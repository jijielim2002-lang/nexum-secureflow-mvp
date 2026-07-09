// ─── GET  /api/overage-summaries — list summaries
// ─── POST /api/overage-summaries — generate summary for company + period

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { USAGE_AUDIT_ACTIONS } from "@/lib/usageMetering";
import { calculateOverageSummary } from "@/lib/usageMeteringEngine";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp        = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  const status    = sp.get("status");
  const from      = sp.get("from");
  const to        = sp.get("to");

  let q = svc
    .from("overage_billing_summaries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (caller.role !== "admin") {
    if (!caller.companyId) return NextResponse.json({ data: [] });
    q = q.eq("company_id", caller.companyId);
  } else if (companyId) {
    q = q.eq("company_id", companyId);
  }

  if (status) q = q.eq("summary_status", status);
  if (from)   q = q.gte("billing_period_start", from);
  if (to)     q = q.lte("billing_period_end", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { company_id, period_start, period_end } = body as {
    company_id?: string;
    period_start?: string;
    period_end?: string;
  };

  if (!company_id)    return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  if (!period_start)  return NextResponse.json({ error: "period_start is required" }, { status: 400 });
  if (!period_end)    return NextResponse.json({ error: "period_end is required" }, { status: 400 });

  const { summary, membershipId, planId, error: calcErr } = await calculateOverageSummary(
    svc, company_id, period_start, period_end
  );
  if (calcErr) return NextResponse.json({ error: calcErr }, { status: 422 });

  const { data: created, error: insertErr } = await svc
    .from("overage_billing_summaries")
    .insert({
      company_id,
      membership_id:               membershipId,
      plan_id:                     planId,
      billing_period_start:        period_start,
      billing_period_end:          period_end,
      total_secured_jobs:          summary.total_secured_jobs,
      total_document_extractions:  summary.total_document_extractions,
      total_tracking_checks:       summary.total_tracking_checks,
      total_rfqs:                  summary.total_rfqs,
      total_quotations:            summary.total_quotations,
      overage_secured_jobs:        summary.overage_secured_jobs,
      overage_document_extractions:summary.overage_document_extractions,
      overage_tracking_checks:     summary.overage_tracking_checks,
      overage_rfqs:                summary.overage_rfqs,
      overage_quotations:          summary.overage_quotations,
      total_overage_amount:        summary.total_overage_amount,
      currency:                    summary.currency,
      summary_status:              "Generated",
      generated_by:                caller.userId,
      generated_at:                new Date().toISOString(),
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role: caller.role, actor_name: caller.fullName,
    action: USAGE_AUDIT_ACTIONS.summary_generated,
    description: `Overage summary generated for company ${company_id} (${period_start} to ${period_end}) by ${caller.fullName}. Total overage: ${summary.currency} ${summary.total_overage_amount.toFixed(2)}.`,
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
