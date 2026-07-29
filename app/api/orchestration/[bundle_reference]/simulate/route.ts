// POST /api/orchestration/[bundle_reference]/simulate — create financing simulation
// GET  /api/orchestration/[bundle_reference]/simulate — list simulations

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

type Params = { params: Promise<{ bundle_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("bundle_financing_simulations")
    .select("*")
    .eq("bundle_reference", bundle_reference)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, simulations: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("id, customer_company_id, total_service_amount, currency")
    .eq("bundle_reference", bundle_reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  const body = await req.json() as {
    simulation_type:   "Customer Deferment" | "Provider Working Capital" | "Payout Acceleration" | "Milestone Financing";
    financing_amount?: number;
    tenor_days?:       number;
    fee_rate?:         number;
    repayment_source?: string;
  };

  if (!body.simulation_type)
    return NextResponse.json({ ok: false, error: "simulation_type required" }, { status: 400 });

  const amount    = body.financing_amount ?? bundle.total_service_amount ?? 0;
  const tenorDays = body.tenor_days       ?? 30;
  const feeRate   = body.fee_rate         ?? 0.02;

  // Determine eligibility hint based on simulation type + amount
  let eligibility: "Simulation Only" | "Potentially Eligible" | "Requires Review" | "Not Suitable" = "Simulation Only";
  if (amount > 0 && amount <= 200000) eligibility = "Potentially Eligible";
  else if (amount > 200000)           eligibility = "Requires Review";
  if (body.simulation_type === "Milestone Financing") eligibility = "Requires Review";

  const { data, error } = await db
    .from("bundle_financing_simulations")
    .insert({
      bundle_reference,
      simulation_type:   body.simulation_type,
      financing_amount:  amount,
      currency:          bundle.currency ?? "MYR",
      tenor_days:        tenorDays,
      fee_rate:          feeRate,
      repayment_source:  body.repayment_source ?? null,
      eligibility_status: eligibility,
      simulation_note:   "Simulation only — subject to credit review and documentation.",
      requested_by:      auth.userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, simulation: data });
}
