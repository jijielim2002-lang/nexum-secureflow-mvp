// ─── GET  /api/payment-terms-recommendations/[jobReference]  — latest PTR for job
// ─── POST /api/payment-terms-recommendations/[jobReference]  — accept or override

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { PTR_AUDIT_ACTIONS } from "@/lib/paymentTermsRecommendation";

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

// ── GET — fetch latest (or all) PTRs for a job reference ─────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobReference: string }> }
) {
  const { jobReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url          = new URL(req.url);
  const latestOnly   = url.searchParams.get("latest") !== "false"; // default true

  let q = svc
    .from("payment_terms_recommendations")
    .select("*")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: false });

  // Scope by company for non-admins
  if (isProvider && caller.companyId) {
    q = q.eq("provider_company_id", caller.companyId);
  }
  if (isCustomer && caller.companyId) {
    q = q.eq("customer_company_id", caller.companyId);
  }

  if (latestOnly) q = q.limit(1);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data || data.length === 0) {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  return NextResponse.json({ data: latestOnly ? data[0] : data });
}

// ── POST — accept or override a recommendation ────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobReference: string }> }
) {
  const { jobReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";

  if (!isAdmin && !isProvider) {
    return NextResponse.json(
      { error: "Only admins and providers can accept or override recommendations" },
      { status: 403 }
    );
  }
  const body = await req.json() as {
    action?:          string; // "accept" | "override"
    recommendation_id?: string;
    override_reason?: string;
  };

  if (body.action !== "accept" && body.action !== "override") {
    return NextResponse.json(
      { error: "Invalid action. Use action: 'accept' or 'override'" },
      { status: 400 }
    );
  }

  if (body.action === "override" && !body.override_reason) {
    return NextResponse.json(
      { error: "override_reason is required when action is 'override'" },
      { status: 400 }
    );
  }

  // Resolve which PTR row to update
  let rowId = body.recommendation_id;
  if (!rowId) {
    // Default to latest for this job
    let latestQ = svc
      .from("payment_terms_recommendations")
      .select("id, provider_company_id, customer_company_id, recommendation_type, recommended_deposit_percentage, risk_level")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1);

    if (isProvider && caller.companyId) {
      latestQ = latestQ.eq("provider_company_id", caller.companyId);
    }

    const { data: latest, error: latestErr } = await latestQ.maybeSingle();
    if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500 });
    if (!latest)   return NextResponse.json({ error: "No recommendation found for this job" }, { status: 404 });
    rowId = latest.id;
  }

  // Build update payload
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> =
    body.action === "accept"
      ? { was_accepted: true }
      : {
          was_overridden:   true,
          override_reason:  body.override_reason,
          override_by_role: caller.role,
          override_by_name: caller.fullName,
          overridden_at:    now,
        };

  const { data: updated, error: updateErr } = await svc
    .from("payment_terms_recommendations")
    .update(updatePayload)
    .eq("id", rowId)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Audit log
  const auditAction =
    body.action === "accept"
      ? PTR_AUDIT_ACTIONS.accepted
      : PTR_AUDIT_ACTIONS.overridden;

  const description =
    body.action === "accept"
      ? `Payment terms recommendation accepted for job ${jobReference}.`
      : `Payment terms recommendation overridden for job ${jobReference}. Reason: ${body.override_reason}`;

  await insertAuditLogWithClient(svc, {
    job_reference: jobReference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description,
  }).catch(() => { /* silent */ });

  return NextResponse.json({ success: true, data: updated });
}
