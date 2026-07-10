// ─── POST /api/net-settlements — Generate a net settlement statement ───────────
// ─── GET  /api/net-settlements — List statements (role-scoped) ────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { NS_AUDIT_ACTIONS, VERIFIED_HOLDING_STATUSES } from "@/lib/netSettlement";

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

// ── Calculation engine ────────────────────────────────────────────────────────

async function calculateSettlement(jobReference: string) {
  const [jobR, obligR, heldR, reserveR, settlR] = await Promise.all([
    svc.from("secured_jobs")
      .select("job_reference, job_value, currency, customer_company_id, service_provider_company_id")
      .eq("job_reference", jobReference)
      .maybeSingle(),
    svc.from("payment_obligations")
      .select("id, obligation_type, amount, currency, status")
      .eq("job_reference", jobReference),
    svc.from("held_payments")
      .select("id, amount, currency, holding_status")
      .eq("job_reference", jobReference),
    svc.from("claim_reserves")
      .select("id, reserve_type, reserve_status, reserve_amount, applied_amount, currency")
      .eq("job_reference", jobReference),
    svc.from("release_settlements")
      .select("id, actual_released_amount, settlement_status, currency")
      .eq("job_reference", jobReference),
  ]);

  if (!jobR.data) return null;
  const job = jobR.data;

  const obligations = obligR.data ?? [];
  const heldPayments = heldR.data ?? [];
  const reserves = reserveR.data ?? [];
  const settlements = settlR.data ?? [];

  // 1. gross_job_value
  const grossJobValue = Number(job.job_value);

  // 2. total_payment_obligations
  const totalPaymentObligations = obligations.reduce((s, o) => s + Number(o.amount), 0);

  // 3. total_held_amount
  const totalHeldAmount = heldPayments.reduce((s, h) => s + Number(h.amount), 0);

  // 4. total_verified_payments (held that are secured/released)
  const totalVerifiedPayments = heldPayments
    .filter((h) => (VERIFIED_HOLDING_STATUSES as readonly string[]).includes(h.holding_status))
    .reduce((s, h) => s + Number(h.amount), 0);

  // 5. total_additional_charges
  const totalAdditionalCharges = obligations
    .filter((o) => o.obligation_type === "Additional Charge")
    .reduce((s, o) => s + Number(o.amount), 0);

  // 6. total_claim_reserves (Active + Adjusted only)
  const totalClaimReserves = reserves
    .filter((r) => ["Active", "Adjusted"].includes(r.reserve_status))
    .reduce((s, r) => s + Number(r.reserve_amount), 0);

  // 7. total_claim_applied
  const totalClaimApplied = reserves
    .filter((r) => r.reserve_status === "Applied")
    .reduce((s, r) => s + Number(r.applied_amount ?? r.reserve_amount), 0);

  // 8. total_released — prefer reconciled settlements, fall back to released held
  const settlementReleased = settlements
    .filter((s) => ["Reconciled", "Completed"].includes(s.settlement_status ?? ""))
    .reduce((s, rs) => s + Number(rs.actual_released_amount ?? 0), 0);
  const heldReleased = heldPayments
    .filter((h) => h.holding_status === "Released")
    .reduce((s, h) => s + Number(h.amount), 0);
  const totalReleased = Math.max(settlementReleased, heldReleased);

  // 9. net_release_eligible
  const totalRefunds = 0; // refunds not yet implemented
  const netReleaseEligible = Math.max(
    0,
    totalVerifiedPayments + totalAdditionalCharges - totalClaimReserves - totalClaimApplied - totalRefunds,
  );

  // 10. outstanding_amount
  const outstandingAmount = Math.max(0, totalPaymentObligations - totalVerifiedPayments);

  // ── Line items ──────────────────────────────────────────────────────────────
  const lineItems: Array<{
    line_type: string; description: string; amount: number;
    currency: string; source_table: string; source_id: string;
  }> = [];

  // Job value
  lineItems.push({
    line_type: "Job Value", description: `Gross job value — ${jobReference}`,
    amount: grossJobValue, currency: job.currency,
    source_table: "secured_jobs", source_id: job.job_reference,
  });

  // Payment obligations
  for (const o of obligations) {
    const typeMap: Record<string, string> = {
      Deposit: "Deposit", Balance: "Balance", "Full Payment": "Full Payment",
      "Additional Charge": "Additional Charge",
    };
    lineItems.push({
      line_type: typeMap[o.obligation_type] ?? "Other",
      description: `${o.obligation_type} obligation [${o.status}]`,
      amount: Number(o.amount), currency: o.currency ?? job.currency,
      source_table: "payment_obligations", source_id: o.id,
    });
  }

  // Claim reserves (active)
  for (const r of reserves.filter((r) => ["Active", "Adjusted"].includes(r.reserve_status))) {
    lineItems.push({
      line_type: "Claim Reserve",
      description: `${r.reserve_type ?? "Reserve"} — potential claim amount [${r.reserve_status}]`,
      amount: -Number(r.reserve_amount), currency: r.currency ?? job.currency,
      source_table: "claim_reserves", source_id: r.id,
    });
  }

  // Claim applied
  for (const r of reserves.filter((r) => r.reserve_status === "Applied")) {
    lineItems.push({
      line_type: "Claim Applied",
      description: `${r.reserve_type ?? "Reserve"} — applied claim deduction`,
      amount: -Number(r.applied_amount ?? r.reserve_amount), currency: r.currency ?? job.currency,
      source_table: "claim_reserves", source_id: r.id,
    });
  }

  // Releases
  for (const rs of settlements) {
    if ((rs.actual_released_amount ?? 0) > 0) {
      lineItems.push({
        line_type: "Release",
        description: `Released amount [${rs.settlement_status ?? "Settlement"}]`,
        amount: Number(rs.actual_released_amount), currency: rs.currency ?? job.currency,
        source_table: "release_settlements", source_id: rs.id,
      });
    }
  }

  const snapshot = {
    calculated_at: new Date().toISOString(),
    obligations_count: obligations.length,
    held_payments_count: heldPayments.length,
    reserves_count: reserves.length,
    settlements_count: settlements.length,
  };

  return {
    customerCompanyId:      job.customer_company_id ?? null,
    providerCompanyId:      job.service_provider_company_id ?? null,
    currency:               job.currency,
    grossJobValue,
    totalPaymentObligations,
    totalHeldAmount,
    totalVerifiedPayments,
    totalAdditionalCharges,
    totalClaimReserves,
    totalClaimApplied,
    totalRefunds,
    netReleaseEligible,
    totalReleased,
    outstandingAmount,
    snapshot,
    lineItems,
  };
}

// ── GET — list statements ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobRef   = searchParams.get("job_reference");
  const status   = searchParams.get("status");
  const limitStr = searchParams.get("limit") ?? "100";
  const limit    = Math.min(parseInt(limitStr, 10) || 100, 500);

  let query = svc.from("net_settlement_statements")
    .select("*, net_settlement_line_items(id, line_type, description, amount, currency, source_table, source_id, created_at)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobRef)  query = query.eq("job_reference", jobRef);
  if (status)  query = query.eq("statement_status", status);

  // Non-admin scope
  if (caller.role === "service_provider" && caller.companyId) {
    query = query.eq("provider_company_id", caller.companyId);
  } else if (caller.role === "customer" && caller.companyId) {
    query = query.eq("customer_company_id", caller.companyId);
  } else if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── POST — generate a new statement ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { job_reference } = body as { job_reference?: string };

  if (!job_reference) {
    return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  }

  const calc = await calculateSettlement(job_reference);
  if (!calc) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const now = new Date().toISOString();

  const { data: stmt, error: stmtErr } = await svc
    .from("net_settlement_statements")
    .insert({
      job_reference,
      customer_company_id:      calc.customerCompanyId,
      provider_company_id:      calc.providerCompanyId,
      statement_status:         "Generated",
      currency:                 calc.currency,
      gross_job_value:          calc.grossJobValue,
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
    })
    .select()
    .single();

  if (stmtErr || !stmt) {
    return NextResponse.json({ error: stmtErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Insert line items
  if (calc.lineItems.length > 0) {
    await svc.from("net_settlement_line_items").insert(
      calc.lineItems.map((li) => ({
        statement_id:  stmt.id,
        job_reference,
        line_type:     li.line_type,
        description:   li.description,
        amount:        li.amount,
        currency:      li.currency,
        source_table:  li.source_table,
        source_id:     li.source_id,
      })),
    );
  }

  insertAuditLogWithClient(svc, {
    job_reference,
    actor_role:  caller.role,
    actor_name:  caller.fullName,
    action:      NS_AUDIT_ACTIONS.generated,
    description: `Net settlement statement generated for ${job_reference} by ${caller.fullName}. Net release eligible: ${calc.currency} ${calc.netReleaseEligible.toLocaleString("en-MY", { minimumFractionDigits: 2 })}.`,
  }).catch(() => {});

  return NextResponse.json({ data: stmt }, { status: 201 });
}
