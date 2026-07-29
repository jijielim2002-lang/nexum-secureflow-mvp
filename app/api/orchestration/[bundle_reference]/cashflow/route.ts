// GET  /api/orchestration/[bundle_reference]/cashflow — compute + return cashflow analysis
// POST /api/orchestration/[bundle_reference]/cashflow — (re)compute and save to DB

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ bundle_reference: string }> };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function toDateStr(d: Date): string { return d.toISOString().split("T")[0]; }

interface CashflowResult {
  total_bundle_amount:             number;
  customer_deposit_amount:         number;
  customer_balance_amount:         number;
  expected_cash_in_date:           string | null;
  expected_cash_out_date:          string | null;
  earliest_provider_payable_date:  string | null;
  latest_customer_collection_date: string | null;
  transit_days_estimate:           number;
  funding_gap_days:                number;
  funding_gap_amount:              number;
  gap_owner:                       string;
  recommended_financing_product:   string;
  risk_level:                      string;
  analysis_note:                   string;
}

function computeCashflow(bundle: {
  total_service_amount: number;
  cargo_ready_date?: string | null;
  target_delivery_date?: string | null;
  trade_type?: string;
  origin_country?: string;
  destination_country?: string;
  payment_model?: string;
  shipment_legs?: Array<{ leg_amount: number; expected_start_date?: string; expected_end_date?: string }>;
}): CashflowResult {
  const total = bundle.total_service_amount ?? 0;

  // Estimate transit days based on trade lane
  const origin      = (bundle.origin_country ?? "").toLowerCase();
  const destination = (bundle.destination_country ?? "").toLowerCase();
  let transitDays   = 20; // default
  if (origin.includes("china") && destination.includes("malaysia"))  transitDays = 18;
  else if (origin.includes("china") && destination.includes("singapore")) transitDays = 15;
  else if (origin.includes("europe") || destination.includes("europe")) transitDays = 25;
  else if (bundle.trade_type === "Air") transitDays = 5;

  // If target delivery date given, compute from ready date
  if (bundle.cargo_ready_date && bundle.target_delivery_date) {
    const ready    = new Date(bundle.cargo_ready_date);
    const delivery = new Date(bundle.target_delivery_date);
    transitDays    = Math.max(1, Math.round((delivery.getTime() - ready.getTime()) / 86400000));
  }

  const cashInDate = bundle.cargo_ready_date
    ? new Date(bundle.cargo_ready_date)
    : addDays(new Date(), 3);

  const cashOutDate              = new Date(cashInDate); // customer pays at booking
  const earliestProviderPayable  = addDays(cashInDate, 1);  // providers need to be paid soon after
  const latestCustomerCollection = addDays(cashInDate, transitDays);

  // Funding gap = transit period where customer has paid but has no goods yet
  const fundingGapDays   = transitDays;
  const fundingGapAmount = total;

  // Deposit model
  const isDepositModel    = bundle.payment_model === "Deposit + Balance";
  const depositAmount     = isDepositModel ? Math.round(total * 0.4 * 100) / 100 : total;
  const balanceAmount     = total - depositAmount;

  // Gap owner determination
  let gapOwner = "Customer";
  if (transitDays > 20)       gapOwner = "Customer";
  else if (isDepositModel)    gapOwner = "Customer";

  // Recommendation
  let recommendation   = "None";
  let riskLevel        = "Low";
  let analysisNote     = "";

  if (fundingGapDays >= 20) {
    recommendation = "Customer Shipment Deferment";
    riskLevel      = "High";
    analysisNote   = `Customer pays at booking but cargo arrives in ~${fundingGapDays} days. ` +
      `Recommend deferring customer balance payment until cargo arrives at destination port, ` +
      `bridging the ${fundingGapDays}-day funding gap.`;
  } else if (fundingGapDays >= 10) {
    recommendation = "Deposit + Balance";
    riskLevel      = "Medium";
    analysisNote   = `${fundingGapDays}-day transit creates moderate cash-flow pressure. ` +
      `A 40% deposit at booking and 60% balance on arrival reduces customer exposure.`;
  } else {
    recommendation = "Release Against Milestone";
    riskLevel      = "Low";
    analysisNote   = `Short transit (${fundingGapDays} days). Milestone payment releases manage provider payouts without financing.`;
  }

  if (total > 500000) {
    riskLevel    = "High";
    recommendation = "Manual Review";
    analysisNote += " High-value bundle — recommend manual credit review.";
  }

  return {
    total_bundle_amount:             total,
    customer_deposit_amount:         depositAmount,
    customer_balance_amount:         balanceAmount,
    expected_cash_in_date:           toDateStr(cashInDate),
    expected_cash_out_date:          toDateStr(cashOutDate),
    earliest_provider_payable_date:  toDateStr(earliestProviderPayable),
    latest_customer_collection_date: toDateStr(latestCustomerCollection),
    transit_days_estimate:           transitDays,
    funding_gap_days:                fundingGapDays,
    funding_gap_amount:              fundingGapAmount,
    gap_owner:                       gapOwner,
    recommended_financing_product:   recommendation,
    risk_level:                      riskLevel,
    analysis_note:                   analysisNote,
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: existing } = await db
    .from("bundle_cashflow_analysis")
    .select("*")
    .eq("bundle_reference", bundle_reference)
    .maybeSingle();

  if (existing) return NextResponse.json({ ok: true, cashflow: existing });

  // If no stored analysis, compute on the fly
  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("*, shipment_legs(*)")
    .eq("bundle_reference", bundle_reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  const result = computeCashflow(bundle);
  return NextResponse.json({ ok: true, cashflow: { ...result, bundle_reference, computed_at: new Date().toISOString() } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("*, shipment_legs(*)")
    .eq("bundle_reference", bundle_reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const result = computeCashflow(bundle);

  // Upsert
  const { data: existing } = await db
    .from("bundle_cashflow_analysis")
    .select("id")
    .eq("bundle_reference", bundle_reference)
    .maybeSingle();

  const record = {
    bundle_reference,
    customer_company_id:    bundle.customer_company_id,
    ...result,
    computed_at: new Date().toISOString(),
  };

  if (existing) {
    await db.from("bundle_cashflow_analysis").update(record).eq("id", existing.id);
  } else {
    await db.from("bundle_cashflow_analysis").insert(record);
  }

  // Update bundle cashflow_status + risk_level
  await db.from("shipment_bundles").update({
    cashflow_status: result.recommended_financing_product,
    risk_level:      result.risk_level,
  }).eq("bundle_reference", bundle_reference);

  return NextResponse.json({ ok: true, cashflow: { bundle_reference, ...result } });
}
