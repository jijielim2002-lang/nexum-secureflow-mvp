// ─── GET  /api/liability-reviews  — list (role-scoped)
// ─── POST /api/liability-reviews  — create new review

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  LR_AUDIT_ACTIONS,
  DISPUTE_TO_INCIDENT_MAP,
  type LiabilityReviewStatus,
  type IncidentType,
  type InsuranceClaimStatus,
} from "@/lib/liabilityReview";

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

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url      = new URL(req.url);
  const jobRef   = url.searchParams.get("job_reference");
  const status   = url.searchParams.get("status");
  const limit    = parseInt(url.searchParams.get("limit") ?? "200", 10);

  let q = svc
    .from("liability_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobRef)  q = q.eq("job_reference", jobRef);
  if (status)  q = q.eq("liability_review_status", status);

  if (isProvider && caller.companyId) {
    q = q.eq("provider_company_id", caller.companyId);
  }
  if (isCustomer && caller.companyId) {
    q = q.eq("customer_company_id", caller.companyId);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST — create liability review ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can create liability reviews" }, { status: 403 });
  }

  const body = await req.json() as {
    job_reference:          string;
    dispute_case_id?:       string;
    exception_id?:          string;
    customer_company_id?:   string;
    provider_company_id?:   string;
    incident_type?:         IncidentType;
    claimed_amount?:        number;
    currency?:              string;
    cargo_value?:           number;
    liability_limit_note?:  string;
    insurance_available?:   boolean;
    insurance_policy_reference?: string;
    insurance_claim_status?: InsuranceClaimStatus;
    evidence_summary?:      string;
    admin_review_note?:     string;
    // Auto-fill from dispute
    dispute_type?:          string;
  };

  if (!body.job_reference) {
    return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  }

  // Auto-derive incident_type from dispute_type if not provided
  const incidentType: IncidentType | null =
    body.incident_type ??
    (body.dispute_type ? (DISPUTE_TO_INCIDENT_MAP[body.dispute_type] ?? null) : null);

  const { data: stored, error: storeErr } = await svc
    .from("liability_reviews")
    .insert({
      job_reference:             body.job_reference,
      dispute_case_id:           body.dispute_case_id ?? null,
      exception_id:              body.exception_id ?? null,
      customer_company_id:       body.customer_company_id ?? null,
      provider_company_id:       body.provider_company_id ?? null,
      liability_review_status:   "Pending Review" as LiabilityReviewStatus,
      incident_type:             incidentType,
      claimed_amount:            body.claimed_amount ?? null,
      currency:                  body.currency ?? "RM",
      cargo_value:               body.cargo_value ?? null,
      liability_limit_note:      body.liability_limit_note ?? null,
      insurance_available:       body.insurance_available ?? null,
      insurance_policy_reference: body.insurance_policy_reference ?? null,
      insurance_claim_status:    body.insurance_claim_status ?? "Not Applicable",
      evidence_summary:          body.evidence_summary ?? null,
      admin_review_note:         body.admin_review_note ?? null,
    })
    .select()
    .single();

  if (storeErr) return NextResponse.json({ error: storeErr.message }, { status: 500 });

  // Audit log
  await insertAuditLogWithClient(svc, {
    job_reference: body.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        LR_AUDIT_ACTIONS.created,
    description:   `Liability review created for job ${body.job_reference}. Incident: ${incidentType ?? "TBD"}. Claimed: ${body.claimed_amount ? `${body.currency ?? "RM"} ${body.claimed_amount}` : "TBD"}.`,
  }).catch(() => { /* silent */ });

  return NextResponse.json({ success: true, data: stored });
}
