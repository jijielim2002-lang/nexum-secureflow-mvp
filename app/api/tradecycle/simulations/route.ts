// GET  /api/tradecycle/simulations  → list financing simulations
// POST /api/tradecycle/simulations  → create a financing simulation

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

// Required documents per simulation type
const REQUIRED_DOCS: Record<string, string[]> = {
  "Customer Shipment Deferment":  ["Commercial Invoice","Bill of Lading","Insurance Certificate"],
  "Supplier Deposit Financing":   ["Supplier Invoice","Purchase Order","Bank Statement"],
  "Supplier Balance Financing":   ["Commercial Invoice","Delivery Order","Payment History"],
  "Provider Working Capital":     ["Service Agreement","Job Reference","Payment Schedule"],
  "Payout Acceleration":          ["Milestone Evidence","Invoice","Bank Account Details"],
  "Inventory Financing":          ["Inventory Report","Warehouse Receipt","Insurance"],
  "Receivable Financing":         ["Commercial Invoice","Delivery Proof","Receivable Aging"],
};

// Estimated fee rates (annualised, for simulation only — not guaranteed)
const FEE_RATES: Record<string, number> = {
  "Customer Shipment Deferment": 0.020,
  "Supplier Deposit Financing":  0.022,
  "Supplier Balance Financing":  0.018,
  "Provider Working Capital":    0.024,
  "Payout Acceleration":         0.016,
  "Inventory Financing":         0.026,
  "Receivable Financing":        0.019,
};

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  let query = db
    .from("tradecycle_financing_simulations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (auth.role !== "admin") {
    if (!auth.company_id) return NextResponse.json({ ok: true, simulations: [] });
    query = query.eq("company_id", auth.company_id) as typeof query;
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, simulations: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    simulation_type:          string;
    trade_amount:             number;
    customer_deposit?:        number;
    partner_financing_amount?: number;
    tenor_days?:              number;
    repayment_source?:        string;
    bundle_reference?:        string;
    tradeflow_reference?:     string;
    company_id?:              string; // admin override
  };

  if (!body.simulation_type) return NextResponse.json({ ok: false, error: "simulation_type required" }, { status: 400 });
  if (!body.trade_amount)    return NextResponse.json({ ok: false, error: "trade_amount required" },    { status: 400 });

  const company_id = auth.role === "admin" && body.company_id ? body.company_id : auth.company_id;
  if (!company_id) return NextResponse.json({ ok: false, error: "No company" }, { status: 400 });

  const tenorDays          = body.tenor_days               ?? 30;
  const customerDeposit    = body.customer_deposit          ?? 0;
  const partnerFinancing   = body.partner_financing_amount  ?? (body.trade_amount - customerDeposit);
  const feeRate            = FEE_RATES[body.simulation_type] ?? 0.02;
  const annualisedRate     = feeRate * (tenorDays / 365);
  const estimatedFeeAmount = +(partnerFinancing * annualisedRate).toFixed(2);
  const requiredDocs       = REQUIRED_DOCS[body.simulation_type] ?? [];

  const { data: sim, error } = await db
    .from("tradecycle_financing_simulations")
    .insert({
      company_id,
      bundle_reference:        body.bundle_reference        ?? null,
      tradeflow_reference:     body.tradeflow_reference     ?? null,
      simulation_type:         body.simulation_type,
      trade_amount:            body.trade_amount,
      customer_deposit:        customerDeposit,
      partner_financing_amount: partnerFinancing,
      tenor_days:              tenorDays,
      estimated_fee_rate:      feeRate,
      estimated_fee_amount:    estimatedFeeAmount,
      repayment_source:        body.repayment_source        ?? null,
      required_documents:      requiredDocs,
      eligibility_status:      "Simulation Only",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Audit log
  await db.from("tradecycle_audit_log").insert({
    company_id,
    event_type: "financing_simulation_created",
    event_amount: body.trade_amount,
    description: `Financing simulation: ${body.simulation_type} — ${body.trade_amount.toLocaleString()} (Simulation Only)`,
    performed_by: auth.userId,
    metadata: { simulation_type: body.simulation_type, eligibility_status: "Simulation Only" },
  });

  return NextResponse.json({ ok: true, simulation: sim }, { status: 201 });
}
