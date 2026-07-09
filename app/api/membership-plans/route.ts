// ─── GET  /api/membership-plans  — list plans
// ─── POST /api/membership-plans  — create plan (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { PLAN_AUDIT_ACTIONS } from "@/lib/membershipPlan";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  // Allow authenticated users to read; anon cannot hit this route (use direct Supabase RLS)
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const status = sp.get("status"); // optional filter

  let q = svc.from("membership_plans").select("*").order("annual_fee", { ascending: true });

  if (caller.role !== "admin") {
    // Non-admins only see Active plans
    q = q.eq("plan_status", "Active");
  } else if (status) {
    q = q.eq("plan_status", status);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    plan_name, plan_status = "Draft",
    annual_fee = 0, monthly_equivalent = 0, currency = "RM",
    included_secured_jobs = 0, included_document_extractions = 0,
    included_tracking_checks = 0, included_rfqs = 0, included_quotations = 0,
    secured_job_fee_rate = 0, payment_holding_fee_rate = 0,
    controlled_release_fee_rate = 0, document_intelligence_fee = 0, tracking_monitoring_fee = 0,
    capital_readiness_access = false, financing_simulation_access = false,
    provider_benchmark_access = false, customer_benchmark_access = false,
    command_center_access = false, priority_support = false, custom_terms_allowed = false,
    description,
  } = body;

  if (!plan_name) return NextResponse.json({ error: "plan_name is required" }, { status: 400 });

  const { data: created, error } = await svc
    .from("membership_plans")
    .insert({
      plan_name, plan_status, annual_fee, monthly_equivalent, currency,
      included_secured_jobs, included_document_extractions, included_tracking_checks,
      included_rfqs, included_quotations,
      secured_job_fee_rate, payment_holding_fee_rate, controlled_release_fee_rate,
      document_intelligence_fee, tracking_monitoring_fee,
      capital_readiness_access, financing_simulation_access,
      provider_benchmark_access, customer_benchmark_access,
      command_center_access, priority_support, custom_terms_allowed,
      description,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role: caller.role, actor_name: caller.fullName,
    action: PLAN_AUDIT_ACTIONS.created,
    description: `Membership plan "${plan_name}" created by ${caller.fullName}.`,
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
