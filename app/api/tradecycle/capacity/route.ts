// GET  /api/tradecycle/capacity  → list capacity analyses for company
// POST /api/tradecycle/capacity  → run a new capacity analysis / simulation

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

// ── Fee rate config (not guaranteed — estimation only) ────────────────────────
const BASE_FEE_RATE = 0.018; // 1.8% per annum base estimate

function recommendPaymentModel(gap: number, gapDays: number, availableBalance: number, proposedValue: number): string {
  if (gap <= 0)                          return "Full Upfront";
  if (availableBalance >= proposedValue * 0.4) return "Deposit + Balance";
  if (gapDays <= 30)                     return "Milestone Payment";
  if (gap > proposedValue * 0.5)         return "Manual Review";
  return "Partner-Funded Gap";
}

function computeRisk(gap: number, proposedValue: number, multiplier: number): string {
  if (multiplier > 3 || gap > proposedValue * 0.7) return "Critical";
  if (multiplier > 2 || gap > proposedValue * 0.5) return "High";
  if (multiplier > 1.5)                             return "Medium";
  return "Low";
}

function computeEligibility(risk: string, gap: number): string {
  if (risk === "Critical")  return "Not Suitable";
  if (risk === "High")      return "Requires Review";
  if (gap > 0)              return "Potentially Eligible";
  return "Simulation Only";
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  let query = db
    .from("tradecycle_capacity_analysis")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (auth.role !== "admin") {
    if (!auth.company_id) return NextResponse.json({ ok: true, analyses: [] });
    query = query.eq("company_id", auth.company_id) as typeof query;
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, analyses: data ?? [] });
}

// ── POST — compute capacity analysis ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    proposed_trade_value:      number;
    active_trade_value?:       number;
    partner_financing_amount?: number;
    tenor_days?:               number;
    currency?:                 string;
    company_id?:               string; // admin override
  };

  if (!body.proposed_trade_value || body.proposed_trade_value <= 0)
    return NextResponse.json({ ok: false, error: "proposed_trade_value required" }, { status: 400 });

  const company_id = auth.role === "admin" && body.company_id ? body.company_id : auth.company_id;
  if (!company_id) return NextResponse.json({ ok: false, error: "No company" }, { status: 400 });

  const currency = body.currency ?? "MYR";

  // Fetch wallet
  const { data: wallet } = await db
    .from("tradecycle_wallets")
    .select("*")
    .eq("company_id", company_id)
    .eq("currency", currency)
    .maybeSingle();

  const availableBalance     = (wallet?.available_balance  as number) ?? 0;
  const reservedBalance      = (wallet?.reserved_balance   as number) ?? 0;
  const totalBalance         = (wallet?.total_balance      as number) ?? 0;
  const activeTradeValue     = body.active_trade_value       ?? 0;
  const proposedValue        = body.proposed_trade_value;
  const partnerFinancing     = body.partner_financing_amount ?? 0;
  const tenorDays            = body.tenor_days               ?? 30;

  // Core calculations
  const totalCapacity        = availableBalance + partnerFinancing;
  const fundingGap           = Math.max(0, proposedValue - totalCapacity);
  const requiredDeposit      = Math.min(proposedValue, availableBalance);
  const capacityMultiplier   = totalBalance > 0 ? +(totalCapacity / totalBalance).toFixed(2) : 1;
  const estimatedFeeRate     = BASE_FEE_RATE * (tenorDays / 365);
  const estimatedFee         = +(partnerFinancing * estimatedFeeRate).toFixed(2);
  const fundingGapDays       = fundingGap > 0 ? tenorDays : 0;

  const recommendedModel = recommendPaymentModel(fundingGap, fundingGapDays, availableBalance, proposedValue);
  const riskLevel        = computeRisk(fundingGap, proposedValue, capacityMultiplier);
  const eligibility      = computeEligibility(riskLevel, fundingGap);

  const analysisNote = [
    `Available balance: ${currency} ${availableBalance.toLocaleString()}.`,
    partnerFinancing > 0 ? `Partner financing simulation: ${currency} ${partnerFinancing.toLocaleString()} (subject to approval).` : "",
    fundingGap > 0 ? `Funding gap: ${currency} ${fundingGap.toLocaleString()} — additional financing or deposit required.` : "Proposed trade value is within current capacity.",
    "Trade capacity is an estimate only. Financing simulation is subject to credit review and approval.",
  ].filter(Boolean).join(" ");

  // Generate reference
  const { data: refData } = await db.rpc("generate_analysis_reference" as never);
  const analysis_reference = (refData as string) ?? `TCA-${Date.now()}`;

  const { data: analysis, error } = await db
    .from("tradecycle_capacity_analysis")
    .insert({
      company_id,
      wallet_id:                 wallet?.id                  ?? null,
      analysis_reference,
      current_cash_balance:      totalBalance,
      available_balance:         availableBalance,
      reserved_balance:          reservedBalance,
      active_trade_value:        activeTradeValue,
      proposed_trade_value:      proposedValue,
      required_customer_deposit: requiredDeposit,
      partner_financing_amount:  partnerFinancing,
      funding_gap_amount:        fundingGap,
      funding_gap_days:          fundingGapDays,
      estimated_fee:             estimatedFee,
      trade_capacity_multiplier: capacityMultiplier,
      recommended_payment_model: recommendedModel,
      risk_level:                riskLevel,
      eligibility_status:        eligibility,
      analysis_note:             analysisNote,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Audit log
  await db.from("tradecycle_audit_log").insert({
    company_id,
    wallet_id: wallet?.id ?? null,
    event_type: "capacity_analysis_created",
    event_amount: proposedValue,
    currency,
    description: `Capacity analysis ${analysis_reference}: proposed ${currency} ${proposedValue.toLocaleString()}, gap ${currency} ${fundingGap.toLocaleString()}`,
    performed_by: auth.userId,
    metadata: { analysis_reference, risk_level: riskLevel, eligibility },
  });

  if (fundingGap > proposedValue * 0.5) {
    await db.from("tradecycle_audit_log").insert({
      company_id,
      wallet_id: wallet?.id ?? null,
      event_type: "trade_capacity_exceeded",
      event_amount: fundingGap,
      currency,
      description: `High funding gap detected: ${currency} ${fundingGap.toLocaleString()} on proposed trade of ${currency} ${proposedValue.toLocaleString()}`,
      performed_by: auth.userId,
    });
  }

  return NextResponse.json({ ok: true, analysis }, { status: 201 });
}
