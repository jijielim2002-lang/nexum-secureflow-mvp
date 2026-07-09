// ─── POST /api/liability-reviews/[id]/evidence — upload evidence record

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { LR_AUDIT_ACTIONS, type EvidenceType } from "@/lib/liabilityReview";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch review to validate access
  const { data: review, error: reviewErr } = await svc
    .from("liability_reviews")
    .select("id, job_reference, provider_company_id, customer_company_id, liability_review_status")
    .eq("id", id)
    .maybeSingle();

  if (reviewErr) return NextResponse.json({ error: reviewErr.message }, { status: 500 });
  if (!review)   return NextResponse.json({ error: "Review not found" }, { status: 404 });

  // Scope check
  if (isProvider && caller.companyId && review.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isCustomer && caller.companyId && review.customer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    document_id?:   string;
    evidence_type?: EvidenceType;
    remarks?:       string;
  };

  // Role-based evidence type restrictions
  const allowedTypesForCustomer: EvidenceType[] = [
    "Photo", "Damage Report", "Customer Statement", "Delivery Note", "Temperature Log", "Other",
  ];
  const allowedTypesForProvider: EvidenceType[] = [
    "POD", "Delivery Note", "Provider Statement", "Inspection Report",
    "Temperature Log", "Carrier Report", "Other",
  ];

  if (isCustomer && body.evidence_type && !allowedTypesForCustomer.includes(body.evidence_type)) {
    return NextResponse.json(
      { error: `Customers can only upload: ${allowedTypesForCustomer.join(", ")}` },
      { status: 400 }
    );
  }
  if (isProvider && body.evidence_type && !allowedTypesForProvider.includes(body.evidence_type)) {
    return NextResponse.json(
      { error: `Providers can only upload: ${allowedTypesForProvider.join(", ")}` },
      { status: 400 }
    );
  }

  const { data: stored, error: storeErr } = await svc
    .from("liability_evidence")
    .insert({
      liability_review_id: id,
      job_reference:       review.job_reference,
      document_id:         body.document_id ?? null,
      evidence_type:       body.evidence_type ?? null,
      uploaded_by_role:    caller.role,
      uploaded_by_user_id: caller.userId,
      remarks:             body.remarks ?? null,
    })
    .select()
    .single();

  if (storeErr) return NextResponse.json({ error: storeErr.message }, { status: 500 });

  await insertAuditLogWithClient(svc, {
    job_reference: review.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        LR_AUDIT_ACTIONS.evidence_uploaded,
    description:   `Liability evidence uploaded for job ${review.job_reference}: ${body.evidence_type ?? "Other"} by ${caller.role}.${body.remarks ? ` Remarks: ${body.remarks}` : ""}`,
  }).catch(() => { /* silent */ });

  return NextResponse.json({ success: true, data: stored });
}
