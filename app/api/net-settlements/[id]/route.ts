// ─── GET  /api/net-settlements/[id] — single statement + line items ───────────
// ─── PATCH /api/net-settlements/[id] — lifecycle actions ─────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  NS_AUDIT_ACTIONS,
  VALID_ACTIONS_BY_STATUS,
  VERIFIED_HOLDING_STATUSES,
  type SettlementStatus,
  type SettlementAction,
} from "@/lib/netSettlement";

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
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── Re-calculate and update statement fields ──────────────────────────────────

async function recalculate(jobReference: string) {
  const [obligR, heldR, reserveR, settlR] = await Promise.all([
    svc.from("payment_obligations").select("id, obligation_type, amount, currency, status").eq("job_reference", jobReference),
    svc.from("held_payments").select("id, amount, currency, holding_status").eq("job_reference", jobReference),
    svc.from("claim_reserves").select("id, reserve_type, reserve_status, reserve_amount, applied_amount, currency").eq("job_reference", jobReference),
    svc.from("release_settlements").select("id, actual_released_amount, settlement_status, currency").eq("job_reference", jobReference),
  ]);

  const obligations  = obligR.data  ?? [];
  const heldPayments = heldR.data   ?? [];
  const reserves     = reserveR.data ?? [];
  const settlements  = settlR.data  ?? [];

  const totalPaymentObligations = obligations.reduce((s, o) => s + Number(o.amount), 0);
  const totalHeldAmount         = heldPayments.reduce((s, h) => s + Number(h.amount), 0);
  const totalVerifiedPayments   = heldPayments
    .filter((h) => (VERIFIED_HOLDING_STATUSES as readonly string[]).includes(h.holding_status))
    .reduce((s, h) => s + Number(h.amount), 0);
  const totalAdditionalCharges  = obligations
    .filter((o) => o.obligation_type === "Additional Charge")
    .reduce((s, o) => s + Number(o.amount), 0);
  const totalClaimReserves = reserves
    .filter((r) => ["Active", "Adjusted"].includes(r.reserve_status))
    .reduce((s, r) => s + Number(r.reserve_amount), 0);
  const totalClaimApplied = reserves
    .filter((r) => r.reserve_status === "Applied")
    .reduce((s, r) => s + Number(r.applied_amount ?? r.reserve_amount), 0);
  const settlementReleased = settlements
    .filter((s) => ["Reconciled", "Completed"].includes(s.settlement_status ?? ""))
    .reduce((s, rs) => s + Number(rs.actual_released_amount ?? 0), 0);
  const heldReleased = heldPayments
    .filter((h) => h.holding_status === "Released")
    .reduce((s, h) => s + Number(h.amount), 0);
  const totalReleased      = Math.max(settlementReleased, heldReleased);
  const totalRefunds       = 0;
  const netReleaseEligible = Math.max(0, totalVerifiedPayments + totalAdditionalCharges - totalClaimReserves - totalClaimApplied - totalRefunds);
  const outstandingAmount  = Math.max(0, totalPaymentObligations - totalVerifiedPayments);

  const newLineItems: Array<{
    line_type: string; description: string; amount: number;
    currency: string; source_table: string; source_id: string;
  }> = [];

  // Obligations as line items
  for (const o of obligations) {
    const typeMap: Record<string, string> = {
      Deposit: "Deposit", Balance: "Balance", "Full Payment": "Full Payment",
      "Additional Charge": "Additional Charge",
    };
    newLineItems.push({
      line_type: typeMap[o.obligation_type] ?? "Other",
      description: `${o.obligation_type} obligation [${o.status}]`,
      amount: Number(o.amount), currency: o.currency,
      source_table: "payment_obligations", source_id: o.id,
    });
  }

  for (const r of reserves.filter((r) => ["Active", "Adjusted"].includes(r.reserve_status))) {
    newLineItems.push({
      line_type: "Claim Reserve",
      description: `${r.reserve_type ?? "Reserve"} — potential claim amount [${r.reserve_status}]`,
      amount: -Number(r.reserve_amount), currency: r.currency,
      source_table: "claim_reserves", source_id: r.id,
    });
  }

  for (const r of reserves.filter((r) => r.reserve_status === "Applied")) {
    newLineItems.push({
      line_type: "Claim Applied",
      description: `${r.reserve_type ?? "Reserve"} — applied claim deduction`,
      amount: -Number(r.applied_amount ?? r.reserve_amount), currency: r.currency,
      source_table: "claim_reserves", source_id: r.id,
    });
  }

  for (const rs of settlements) {
    if ((rs.actual_released_amount ?? 0) > 0) {
      newLineItems.push({
        line_type: "Release",
        description: `Released amount [${rs.settlement_status ?? "Settlement"}]`,
        amount: Number(rs.actual_released_amount), currency: rs.currency,
        source_table: "release_settlements", source_id: rs.id,
      });
    }
  }

  return {
    totalPaymentObligations, totalHeldAmount, totalVerifiedPayments,
    totalAdditionalCharges, totalClaimReserves, totalClaimApplied,
    totalRefunds, netReleaseEligible, totalReleased, outstandingAmount,
    snapshot: { recalculated_at: new Date().toISOString(), obligations_count: obligations.length, held_payments_count: heldPayments.length, reserves_count: reserves.length },
    newLineItems,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: stmt, error } = await svc
    .from("net_settlement_statements")
    .select("*, net_settlement_line_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!stmt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope check for non-admins
  if (caller.role === "service_provider" && stmt.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (caller.role === "customer" && stmt.customer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["admin", "service_provider", "customer"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data: stmt });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: SettlementAction };

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  const { data: stmt, error: fetchErr } = await svc
    .from("net_settlement_statements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !stmt) return NextResponse.json({ error: "Statement not found" }, { status: 404 });

  const currentStatus = stmt.statement_status as SettlementStatus;
  const allowedActions = VALID_ACTIONS_BY_STATUS[currentStatus] ?? [];

  if (!allowedActions.includes(action)) {
    return NextResponse.json({
      error: `Action "${action}" is not allowed when status is "${currentStatus}". Allowed: [${allowedActions.join(", ")}]`,
    }, { status: 422 });
  }

  const now = new Date().toISOString();
  let updatePayload: Record<string, unknown> = {};
  let auditAction: string;

  switch (action) {
    case "approve":
      updatePayload = {
        statement_status: "Approved",
        approved_by: caller.userId,
        approved_at: now,
      };
      auditAction = NS_AUDIT_ACTIONS.approved;
      break;

    case "finalize":
      updatePayload = {
        statement_status: "Finalized",
        finalized_at: now,
      };
      auditAction = NS_AUDIT_ACTIONS.finalized;
      break;

    case "dispute":
      updatePayload = { statement_status: "Disputed" };
      auditAction = NS_AUDIT_ACTIONS.disputed;
      break;

    case "cancel":
      updatePayload = { statement_status: "Cancelled" };
      auditAction = NS_AUDIT_ACTIONS.cancelled;
      break;

    case "regenerate": {
      // Recalculate all figures
      const calc = await recalculate(stmt.job_reference);
      updatePayload = {
        statement_status:         "Generated",
        total_payment_obligations: calc.totalPaymentObligations,
        total_held_amount:        calc.totalHeldAmount,
        total_verified_payments:  calc.totalVerifiedPayments,
        total_additional_charges: calc.totalAdditionalCharges,
        total_claim_reserves:     calc.totalClaimReserves,
        total_claim_applied:      calc.totalClaimApplied,
        total_refunds:            calc.totalRefunds,
        net_release_eligible:     calc.netReleaseEligible,
        total_released:           calc.totalReleased,
        outstanding_amount:       calc.outstandingAmount,
        calculation_snapshot:     calc.snapshot,
        generated_by:             caller.userId,
        generated_at:             now,
      };
      auditAction = NS_AUDIT_ACTIONS.regenerated;

      // Replace line items (delete old, insert new)
      await svc.from("net_settlement_line_items").delete().eq("statement_id", id);
      if (calc.newLineItems.length > 0) {
        await svc.from("net_settlement_line_items").insert(
          calc.newLineItems.map((li) => ({
            statement_id: id,
            job_reference: stmt.job_reference,
            line_type: li.line_type,
            description: li.description,
            amount: li.amount,
            currency: li.currency,
            source_table: li.source_table,
            source_id: li.source_id,
          })),
        );
      }
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await svc
    .from("net_settlement_statements")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ error: updateErr?.message ?? "Update failed" }, { status: 500 });
  }

  const netEligible = (updated.net_release_eligible as number) ?? 0;
  insertAuditLogWithClient(svc, {
    job_reference: stmt.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description:   `Settlement statement ${action} by ${caller.fullName}. Statement ID: ${id}. Net release eligible: ${stmt.currency} ${netEligible.toLocaleString("en-MY", { minimumFractionDigits: 2 })}.`,
  }).catch(() => {});

  return NextResponse.json({ data: updated });
}
