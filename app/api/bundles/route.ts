// GET  /api/bundles — list customer's shipment bundles (admin sees all)
// POST /api/bundles — customer creates a new shipment bundle

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isCustomer } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCustomer(auth) && !isAdmin(auth))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db = adminClient();

  let q = db
    .from("shipment_bundles")
    .select(`
      id, bundle_reference, shipment_name, origin_country, destination_country,
      bundle_status, payment_terms, payment_status, total_amount, currency,
      ready_date, target_delivery_date, created_at,
      shipment_legs(id, leg_number, service_category, leg_status, provider_company_id)
    `)
    .order("created_at", { ascending: false });

  if (isCustomer(auth)) {
    q = q.eq("customer_company_id", auth.company_id!);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, bundles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCustomer(auth))
    return NextResponse.json({ ok: false, error: "Only customers can create shipment bundles" }, { status: 403 });

  const body = await req.json() as {
    shipment_name?:        string;
    origin_country:        string;
    origin_location?:      string;
    destination_country:   string;
    destination_location?: string;
    cargo_type?:           string;
    cargo_description?:    string;
    weight_kg?:            number;
    volume_cbm?:           number;
    quantity?:             number;
    incoterm?:             string;
    commodity_hs_code?:    string;
    ready_date?:           string;
    target_delivery_date?: string;
    payment_terms?:        "full_upfront" | "milestone" | "net30" | "net60";
    currency?:             string;
    notes?:                string;
    legs?: Array<{
      leg_number:        number;
      service_category:  string;
      leg_description?:  string;
      estimated_start_date?: string;
      estimated_end_date?:   string;
    }>;
  };

  if (!body.origin_country || !body.destination_country)
    return NextResponse.json({ ok: false, error: "origin_country and destination_country are required" }, { status: 400 });

  const db = adminClient();

  // Create bundle
  const { data: bundle, error: bErr } = await db
    .from("shipment_bundles")
    .insert({
      customer_company_id:  auth.company_id,
      shipment_name:        body.shipment_name        ?? null,
      origin_country:       body.origin_country,
      origin_location:      body.origin_location      ?? null,
      destination_country:  body.destination_country,
      destination_location: body.destination_location ?? null,
      cargo_type:           body.cargo_type           ?? null,
      cargo_description:    body.cargo_description    ?? null,
      weight_kg:            body.weight_kg            ?? null,
      volume_cbm:           body.volume_cbm           ?? null,
      quantity:             body.quantity             ?? null,
      incoterm:             body.incoterm             ?? null,
      commodity_hs_code:    body.commodity_hs_code    ?? null,
      ready_date:           body.ready_date           ?? null,
      target_delivery_date: body.target_delivery_date ?? null,
      payment_terms:        body.payment_terms        ?? "full_upfront",
      currency:             body.currency             ?? "MYR",
      notes:                body.notes                ?? null,
      bundle_status:        "Draft",
    })
    .select("id, bundle_reference")
    .single();

  if (bErr || !bundle)
    return NextResponse.json({ ok: false, error: bErr?.message ?? "Failed to create bundle" }, { status: 500 });

  // Insert legs if provided
  if (body.legs && body.legs.length > 0) {
    const legRows = body.legs.map(l => ({
      bundle_id:             bundle.id,
      leg_number:            l.leg_number,
      service_category:      l.service_category,
      leg_description:       l.leg_description       ?? null,
      estimated_start_date:  l.estimated_start_date  ?? null,
      estimated_end_date:    l.estimated_end_date    ?? null,
      leg_status:            "Pending Assignment",
    }));
    const { error: lErr } = await db.from("shipment_legs").insert(legRows);
    if (lErr)
      return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, bundle_reference: bundle.bundle_reference });
}
