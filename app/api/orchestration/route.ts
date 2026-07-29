// GET  /api/orchestration  — list bundles (role-filtered)
// POST /api/orchestration  — create shipment bundle

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isCustomer, isProvider } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db  = adminClient();
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  const SELECT = `
    id, bundle_reference, bundle_title, trade_type, shipment_mode,
    origin_country, destination_country, origin_location, destination_location,
    cargo_type, total_service_amount, currency, bundle_status, payment_model,
    cashflow_status, risk_level, cargo_ready_date, target_delivery_date, created_at,
    shipment_legs(id, leg_reference, leg_sequence, leg_type, leg_status, provider_name,
                  leg_amount, currency, service_provider_company_id,
                  expected_start_date, expected_end_date)
  `;

  let q = db.from("shipment_bundles").select(SELECT).order("created_at", { ascending: false });

  if (isAdmin(auth)) {
    if (statusFilter) q = q.eq("bundle_status", statusFilter);
  } else if (isCustomer(auth)) {
    q = q.eq("customer_company_id", auth.company_id!);
    if (statusFilter) q = q.eq("bundle_status", statusFilter);
  } else if (isProvider(auth)) {
    // Provider sees bundles where they are a leg provider OR orchestrator/participant
    const { data: legBundles } = await db
      .from("shipment_legs")
      .select("bundle_reference")
      .eq("service_provider_company_id", auth.company_id!);
    const { data: partBundles } = await db
      .from("bundle_participants")
      .select("bundle_reference")
      .eq("company_id", auth.company_id!);
    const refs = [
      ...new Set([
        ...(legBundles ?? []).map(l => l.bundle_reference),
        ...(partBundles ?? []).map(p => p.bundle_reference),
      ])
    ];
    if (refs.length === 0) return NextResponse.json({ ok: true, bundles: [] });
    q = q.in("bundle_reference", refs);
  } else {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, bundles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCustomer(auth) && !isAdmin(auth) && !isProvider(auth))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    bundle_title?:         string;
    trade_type?:           string;
    shipment_mode?:        string;
    origin_country?:       string;
    destination_country?:  string;
    origin_location?:      string;
    destination_location?: string;
    cargo_description?:    string;
    cargo_type?:           string;
    hs_code?:              string;
    incoterm?:             string;
    gross_weight_kg?:      number;
    volume_cbm?:           number;
    quantity?:             number;
    total_cargo_value?:    number;
    currency?:             string;
    payment_model?:        string;
    cargo_ready_date?:     string;
    target_delivery_date?: string;
    notes?:                string;
    legs?: Array<{
      leg_sequence:         number;
      leg_type:             string;
      origin_location?:     string;
      destination_location?:string;
      expected_start_date?: string;
      expected_end_date?:   string;
      leg_amount?:          number;
    }>;
  };

  const db = adminClient();

  const { data: bundle, error: bErr } = await db
    .from("shipment_bundles")
    .insert({
      customer_company_id:   auth.company_id,
      created_by:            auth.userId,
      bundle_title:          body.bundle_title          ?? null,
      trade_type:            body.trade_type            ?? "Import",
      shipment_mode:         body.shipment_mode         ?? "Multimodal",
      origin_country:        body.origin_country        ?? null,
      destination_country:   body.destination_country   ?? null,
      origin_location:       body.origin_location       ?? null,
      destination_location:  body.destination_location  ?? null,
      cargo_description:     body.cargo_description     ?? null,
      cargo_type:            body.cargo_type            ?? "General Cargo",
      hs_code:               body.hs_code               ?? null,
      incoterm:              body.incoterm              ?? null,
      gross_weight_kg:       body.gross_weight_kg       ?? null,
      volume_cbm:            body.volume_cbm            ?? null,
      quantity:              body.quantity              ?? null,
      total_cargo_value:     body.total_cargo_value     ?? 0,
      currency:              body.currency              ?? "MYR",
      payment_model:         body.payment_model         ?? "Full Upfront",
      cargo_ready_date:      body.cargo_ready_date      ?? null,
      target_delivery_date:  body.target_delivery_date  ?? null,
      notes:                 body.notes                 ?? null,
      bundle_status:         "Draft",
    })
    .select("id, bundle_reference")
    .single();

  if (bErr || !bundle)
    return NextResponse.json({ ok: false, error: bErr?.message ?? "Create failed" }, { status: 500 });

  // Insert legs
  if (body.legs && body.legs.length > 0) {
    const legRows = body.legs.map(l => ({
      bundle_reference:     bundle.bundle_reference,
      leg_sequence:         l.leg_sequence,
      leg_type:             l.leg_type,
      origin_location:      l.origin_location       ?? null,
      destination_location: l.destination_location  ?? null,
      expected_start_date:  l.expected_start_date   ?? null,
      expected_end_date:    l.expected_end_date      ?? null,
      leg_amount:           l.leg_amount             ?? 0,
      leg_status:           "Draft",
    }));
    const { error: lErr } = await db.from("shipment_legs").insert(legRows);
    if (lErr) return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 });
  }

  // Register customer as bundle_customer participant
  await db.from("bundle_participants").insert({
    bundle_reference:  bundle.bundle_reference,
    company_id:        auth.company_id,
    participant_role:  "bundle_customer",
    added_by:          auth.userId,
  }).select();

  return NextResponse.json({ ok: true, bundle_reference: bundle.bundle_reference });
}
