// GET   /api/marketplace/rfqs/[reference] — RFQ detail + quotes
// PATCH /api/marketplace/rfqs/[reference] — update RFQ (customer publish/cancel, admin)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isProvider, isCustomer } from "@/lib/apiAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: rfq, error } = await db
    .from("marketplace_rfqs")
    .select("*")
    .eq("rfq_reference", reference)
    .single();

  if (error || !rfq) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const r = rfq as Record<string, unknown>;

  // Enforce identity masking for providers
  if (isProvider(auth)) {
    const SAFE = ["id","rfq_reference","service_category","origin_country","destination_country",
      "origin_location","destination_location","cargo_description","cargo_type",
      "weight_kg","volume_cbm","quantity","ready_date","target_delivery_date",
      "special_requirements","quote_deadline","rfq_status","created_at","updated_at"];
    const masked: Record<string, unknown> = {};
    for (const k of SAFE) masked[k] = r[k];
    masked.customer_identity_masked = true;

    // Fetch only provider's own quote
    const { data: myQuote } = await db
      .from("marketplace_quotes")
      .select("*")
      .eq("rfq_id", r.id as string)
      .eq("provider_company_id", auth.company_id!)
      .maybeSingle();

    return NextResponse.json({ ok: true, rfq: masked, my_quote: myQuote ?? null });
  }

  if (isCustomer(auth) && r.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Customer / admin — full data + all quotes with provider scores
  const { data: quotes } = await db
    .from("marketplace_quotes")
    .select("*, provider_company:companies!provider_company_id(name, country)")
    .eq("rfq_id", r.id as string)
    .order("quote_amount", { ascending: true });

  // Attach provider scores to each quote
  const providerIds = [...new Set((quotes ?? []).map(q => q.provider_company_id))];
  let scores: Record<string, unknown>[] = [];
  if (providerIds.length > 0) {
    const { data: sc } = await db
      .from("provider_marketplace_scores")
      .select("*")
      .in("provider_company_id", providerIds);
    scores = sc ?? [];
  }
  const scoreMap = new Map(scores.map(s => [(s as { provider_company_id: string }).provider_company_id, s]));

  const enrichedQuotes = (quotes ?? []).map(q => ({
    ...q,
    provider_score: scoreMap.get(q.provider_company_id) ?? null,
  }));

  return NextResponse.json({ ok: true, rfq, quotes: enrichedQuotes });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: rfq, error: fetchErr } = await db
    .from("marketplace_rfqs")
    .select("id, customer_company_id, rfq_status")
    .eq("rfq_reference", reference)
    .single();

  if (fetchErr || !rfq) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const r = rfq as { id: string; customer_company_id: string; rfq_status: string };

  const body = await req.json() as Record<string, unknown>;
  const isOwner = isCustomer(auth) && r.customer_company_id === auth.company_id;
  if (!isAdmin(auth) && !isOwner) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const update: Record<string, unknown> = {};
  if (isAdmin(auth)) {
    for (const k of Object.keys(body)) update[k] = body[k];
  } else {
    // Customer can: publish Draft, cancel
    if (body.action === "publish")  update.rfq_status = "Open for Quotation";
    if (body.action === "cancel")   update.rfq_status = "Cancelled";
    const EDITABLE = new Set(["origin_country","destination_country","origin_location","destination_location",
      "cargo_description","weight_kg","volume_cbm","quantity","ready_date","target_delivery_date",
      "special_requirements","quote_deadline"]);
    for (const k of Object.keys(body)) if (EDITABLE.has(k)) update[k] = body[k];
  }

  const { error } = await db.from("marketplace_rfqs").update(update).eq("id", r.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
