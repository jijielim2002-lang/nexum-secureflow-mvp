// ─── POST /api/strategic-kpi-targets/[id]/recalculate ────────────────────────
// Admin only. Recalculate current_value from live Supabase data based on
// target_category, then update status and progress_percentage accordingly.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

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
  return { userId: user.id, role: p.role, fullName: p.full_name };
}

function computeStatus(
  targetValue: number,
  currentValue: number,
  periodStart: string | null,
  periodEnd: string | null,
  existingStatus: string,
): string {
  if (existingStatus === "Cancelled") return "Cancelled";
  if (currentValue >= targetValue) return "Achieved";

  const now = new Date();
  if (periodEnd && now > new Date(periodEnd)) return "Missed";
  if (!periodStart || !periodEnd) return existingStatus;

  const start   = new Date(periodStart);
  const end     = new Date(periodEnd);
  const totalMs = end.getTime() - start.getTime();
  const elapsed = Math.max(0, now.getTime() - start.getTime());

  if (totalMs <= 0) return existingStatus;

  const expectedPct = Math.min(100, (elapsed / totalMs) * 100);
  const actualPct   = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;

  if (actualPct >= expectedPct)       return "On Track";
  if (actualPct >= expectedPct * 0.8) return "At Risk";
  return "Behind";
}

// ─── Category → live data calculators ────────────────────────────────────────

async function calcCurrentValue(category: string, metricName: string | null): Promise<number | null> {
  switch (category) {

    case "Provider Onboarding": {
      const { count } = await svc
        .from("companies")
        .select("*", { count: "exact", head: true })
        .in("company_type", ["service_provider", "both"]);
      return count ?? 0;
    }

    case "Customer Onboarding": {
      const { count } = await svc
        .from("companies")
        .select("*", { count: "exact", head: true })
        .in("company_type", ["customer", "both"]);
      return count ?? 0;
    }

    case "Secured Job Volume": {
      const { count } = await svc
        .from("secured_jobs")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    }

    case "Payment Secured Volume": {
      // Sum all held_payment amounts (total payment flow secured through platform)
      const { data } = await svc
        .from("held_payments")
        .select("amount");
      return (data ?? []).reduce((s: number, r: { amount?: number | null }) => s + (r.amount ?? 0), 0);
    }

    case "Revenue": {
      // Sum collected nexum service fees (non-waived)
      const { data } = await svc
        .from("nexum_service_fees")
        .select("fee_amount")
        .not("fee_status", "eq", "Waived");
      return (data ?? []).reduce((s: number, r: { fee_amount?: number | null }) => s + (r.fee_amount ?? 0), 0);
    }

    case "Membership": {
      const { count } = await svc
        .from("memberships")
        .select("*", { count: "exact", head: true })
        .eq("status", "Active");
      return count ?? 0;
    }

    case "Supplier Protection": {
      // Sum advance_required_amount across all supplier payment protections
      const { data } = await svc
        .from("supplier_payment_protections")
        .select("advance_required_amount");
      return (data ?? []).reduce((s: number, r: { advance_required_amount?: number | null }) => s + (r.advance_required_amount ?? 0), 0);
    }

    case "Procurement": {
      const { count } = await svc
        .from("procurement_orders")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    }

    case "Capital Pipeline": {
      // Use metric_name hint to distinguish sub-types
      const mn = (metricName ?? "").toLowerCase();
      if (mn.includes("credit pack") || mn.includes("credit_pack")) {
        const { count } = await svc
          .from("credit_packs")
          .select("*", { count: "exact", head: true });
        return count ?? 0;
      }
      if (mn.includes("capital partner") || mn.includes("partner")) {
        const { count } = await svc
          .from("capital_partner_access")
          .select("*", { count: "exact", head: true });
        return count ?? 0;
      }
      // Default: count capital readiness assessments
      const { count } = await svc
        .from("capital_readiness_assessments")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    }

    case "Risk Control": {
      // Count critical open risks (target: reduce to zero)
      const { count } = await svc
        .from("operational_risk_register")
        .select("*", { count: "exact", head: true })
        .eq("risk_severity", "Critical")
        .in("risk_status", ["Open", "In Review", "Mitigation Active"]);
      return count ?? 0;
    }

    case "Pilot": {
      // Pilot: count completed jobs
      const { count } = await svc
        .from("secured_jobs")
        .select("*", { count: "exact", head: true })
        .eq("job_status", "Completed");
      return count ?? 0;
    }

    default:
      return null; // No auto-calculation for Fundraising, Other, Operational Efficiency
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch the target
  const { data: target, error: fetchErr } = await svc
    .from("strategic_kpi_targets")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Calculate current value from live data
  const calculated = await calcCurrentValue(target.target_category, target.metric_name);

  if (calculated === null) {
    return NextResponse.json({
      ok: false,
      message: `No auto-calculation available for category "${target.target_category}". Update current_value manually.`,
      target,
    });
  }

  const newCurrentValue    = calculated;
  const progress_percentage = target.target_value > 0
    ? Math.min(100, (newCurrentValue / target.target_value) * 100)
    : 0;

  const newStatus = computeStatus(
    target.target_value,
    newCurrentValue,
    target.period_start,
    target.period_end,
    target.status,
  );

  const now = new Date().toISOString();
  const wasAchieved = target.status !== "Achieved" && newStatus === "Achieved";

  const { data: updated, error: updateErr } = await svc
    .from("strategic_kpi_targets")
    .update({
      current_value:       newCurrentValue,
      progress_percentage,
      status:              newStatus,
      updated_at:          now,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        wasAchieved ? "kpi_target_achieved" : "kpi_target_recalculated",
    description:   `KPI target recalculated by ${caller.fullName}: "${target.target_name}" → current: ${newCurrentValue}, status: ${newStatus}, progress: ${progress_percentage.toFixed(1)}%.`,
    metadata:      { target_name: target.target_name, current_value: newCurrentValue, target_value: target.target_value, status: newStatus },
  }).catch(() => {});

  return NextResponse.json({ ok: true, data: updated, calculated: newCurrentValue });
}
