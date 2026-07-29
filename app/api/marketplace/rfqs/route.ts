// GET  /api/marketplace/rfqs — list RFQs (role-filtered + identity masked for providers)
// POST /api/marketplace/rfqs — customer creates an RFQ

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isProvider, isCustomer } from "@/lib/apiAuth";

// Fields revealed to providers — excludes customer identity
const PROVIDER_SAFE_FIELDS = `
  id, rfq_reference, service_category,
  origin_country, destination_country, origin_location, destination_location,
  cargo_description, cargo_type, weight_kg, volume_cbm, quantity,
  ready_date, target_delivery_date, special_requirements, quote_deadline,
  rfq_status, customer_identity_masked, created_at, updated_at
`;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db  = adminClient();
  const url = new URL(req.url);

  if (isCustomer(auth)) {
    // Customer sees own RFQs with full detail
    const { data, error } = await db
      .from("marketplace_rfqs")
      .select("*")
      .eq("customer_company_id", auth.company_id!)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rfqs: data ?? [] });
  }

  if (isProvider(auth)) {
    // Provider sees open RFQs — identity masked (select only safe fields)
    const cat = url.searchParams.get("category");
    let q = db
      .from("marketplace_rfqs")
      .select(PROVIDER_SAFE_FIELDS)
      .in("rfq_status", ["Open for Quotation","Quotes Received","Customer Reviewing"])
      .order("created_at", { ascending: false });
    if (cat) q = q.eq("service_category", cat);
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Also get RFQs this provider already quoted on
    const { data: quoted } = await db
      .from("marketplace_quotes")
      .select("rfq_id, quote_status, quote_reference, quote_amount, currency")
      .eq("provider_company_id", auth.company_id!);

    const quotedMap = new Map((quoted ?? []).map(q => [q.rfq_id, q]));
    const rfqs = (data ?? []).map(r => ({
      ...r,
      my_quote: quotedMap.get(r.id) ?? null,
    }));

    return NextResponse.json({ ok: true, rfqs });
  }

  // Admin — full data
  const { data, error } = await db
    .from("marketplace_rfqs")
    .select("*, customer_company:companies!customer_company_id(name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rfqs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCustomer(auth))
    return NextResponse.json({ ok: false, error: "Customers only" }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const db   = adminClient();

  const { data: ref, error: refErr } = await db.rpc("generate_rfq_reference");
  if (refErr || !ref) return NextResponse.json({ ok: false, error: "Failed to generate reference" }, { status: 500 });

  const { data, error } = await db
    .from("marketplace_rfqs")
    .insert({
      rfq_reference:           ref as string,
      customer_company_id:     auth.company_id!,
      created_by:              auth.userId,
      service_category:        body.service_category,
      origin_country:          body.origin_country          ?? null,
      destination_country:     body.destination_country     ?? null,
      origin_location:         body.origin_location         ?? null,
      destination_location:    body.destination_location    ?? null,
      cargo_description:       body.cargo_description       ?? null,
      cargo_type:              body.cargo_type              ?? "General Cargo",
      weight_kg:               body.weight_kg               ?? null,
      volume_cbm:              body.volume_cbm              ?? null,
      quantity:                body.quantity                ?? null,
      ready_date:              body.ready_date              ?? null,
      target_delivery_date:    body.target_delivery_date    ?? null,
      special_requirements:    body.special_requirements    ?? null,
      quote_deadline:          body.quote_deadline          ?? null,
      rfq_status:              body.publish ? "Open for Quotation" : "Draft",
      customer_identity_masked: true,
    })
    .select("rfq_reference")
    .single();

  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Insert failed" }, { status: 500 });
  return NextResponse.json({ ok: true, rfq_reference: (data as { rfq_reference: string }).rfq_reference });
}
