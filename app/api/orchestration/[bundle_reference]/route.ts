// GET   /api/orchestration/[bundle_reference]  — full bundle detail
// PATCH /api/orchestration/[bundle_reference]  — update bundle

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isCustomer } from "@/lib/apiAuth";

type Params = { params: Promise<{ bundle_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  const { data: bundle, error } = await db
    .from("shipment_bundles")
    .select(`
      *,
      customer_company:companies!customer_company_id(name, country),
      shipment_legs(
        id, leg_reference, leg_sequence, leg_type, leg_status,
        provider_name, service_provider_company_id, quote_reference,
        secured_job_reference, origin_location, destination_location,
        expected_start_date, expected_end_date, actual_start_at, actual_completed_at,
        leg_amount, currency, payable_to_provider, trigger_next_leg_on_status,
        handoff_note, risk_flags,
        provider_company:companies!service_provider_company_id(name, country)
      )
    `)
    .eq("bundle_reference", bundle_reference)
    .single();

  if (error || !bundle)
    return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  // Access check: admin, customer owner, or participant
  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id) {
    const { data: part } = await db
      .from("bundle_participants")
      .select("id")
      .eq("bundle_reference", bundle_reference)
      .eq("company_id", auth.company_id!)
      .maybeSingle();
    const { data: legPart } = await db
      .from("shipment_legs")
      .select("id")
      .eq("bundle_reference", bundle_reference)
      .eq("service_provider_company_id", auth.company_id!)
      .maybeSingle();
    if (!part && !legPart)
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Sort legs
  if (bundle.shipment_legs) {
    bundle.shipment_legs.sort((a: { leg_sequence: number }, b: { leg_sequence: number }) =>
      a.leg_sequence - b.leg_sequence);
  }

  // Fetch payment plan + allocations (if any)
  const [{ data: paymentPlan }, { data: allocations }, { data: cashflow },
         { data: simulations }, { data: riskFlags }, { data: participants }] = await Promise.all([
    db.from("bundle_payment_plans").select("*").eq("bundle_reference", bundle_reference).maybeSingle(),
    db.from("bundle_payment_allocations").select("*").eq("bundle_reference", bundle_reference)
      .order("leg_reference", { ascending: true }),
    db.from("bundle_cashflow_analysis").select("*").eq("bundle_reference", bundle_reference).maybeSingle(),
    db.from("bundle_financing_simulations").select("*").eq("bundle_reference", bundle_reference)
      .order("created_at", { ascending: false }),
    db.from("bundle_risk_flags").select("*").eq("bundle_reference", bundle_reference)
      .eq("is_resolved", false).order("created_at", { ascending: false }),
    db.from("bundle_participants").select("*, company:companies!company_id(name)")
      .eq("bundle_reference", bundle_reference),
  ]);

  return NextResponse.json({
    ok: true,
    bundle,
    payment_plan:   paymentPlan,
    allocations:    allocations ?? [],
    cashflow,
    simulations:    simulations ?? [],
    risk_flags:     riskFlags   ?? [],
    participants:   participants ?? [],
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("id, customer_company_id, bundle_status")
    .eq("bundle_reference", bundle_reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });
  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    action?:                "activate" | "cancel" | "complete" | "dispute";
    bundle_title?:          string;
    bundle_status?:         string;
    payment_model?:         string;
    cashflow_status?:       string;
    risk_level?:            string;
    total_service_amount?:  number;
    notes?:                 string;
  };

  const updates: Record<string, unknown> = {};

  if (body.action) {
    const statusMap: Record<string, string> = {
      activate: "Active",
      cancel:   "Cancelled",
      complete: "Completed",
      dispute:  "Disputed",
    };
    updates.bundle_status = statusMap[body.action];
  }

  if (body.bundle_title          !== undefined) updates.bundle_title         = body.bundle_title;
  if (body.bundle_status         !== undefined) updates.bundle_status        = body.bundle_status;
  if (body.payment_model         !== undefined) updates.payment_model        = body.payment_model;
  if (body.cashflow_status       !== undefined) updates.cashflow_status      = body.cashflow_status;
  if (body.risk_level            !== undefined) updates.risk_level           = body.risk_level;
  if (body.total_service_amount  !== undefined) updates.total_service_amount = body.total_service_amount;
  if (body.notes                 !== undefined) updates.notes                = body.notes;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  const { error } = await db.from("shipment_bundles").update(updates).eq("id", bundle.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
