// GET   /api/marketplace/listings/[reference]
// PATCH /api/marketplace/listings/[reference]

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isProvider, isCustomer } from "@/lib/apiAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: listing, error } = await db
    .from("service_listings")
    .select("*, provider_company:companies!provider_company_id(name, country), service_listing_details(detail_json)")
    .eq("listing_reference", reference)
    .single();

  if (error || !listing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const l = listing as Record<string, unknown>;
  if (isCustomer(auth) && l.status !== "Live")    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (isProvider(auth) && l.provider_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const details = (l.service_listing_details as { detail_json: unknown }[] | null)?.[0];
  return NextResponse.json({ ok: true, listing: { ...l, detail_json: details?.detail_json ?? null, service_listing_details: undefined } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: existing, error: fetchErr } = await db
    .from("service_listings")
    .select("id, provider_company_id, status")
    .eq("listing_reference", reference)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = await req.json() as Record<string, unknown>;
  const ex   = existing as { id: string; provider_company_id: string; status: string };

  const isOwnListing = isProvider(auth) && ex.provider_company_id === auth.company_id;
  if (!isAdmin(auth) && !isOwnListing) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  if (isOwnListing && !["Draft","Rejected"].includes(ex.status))
    return NextResponse.json({ ok: false, error: "Can only edit Draft or Rejected listings" }, { status: 403 });

  const PROVIDER_FIELDS = new Set(["listing_title","description","cargo_type","currency","validity_from","validity_to","remarks"]);

  const update: Record<string, unknown> = {};
  if (isAdmin(auth)) {
    for (const k of Object.keys(body)) if (k !== "detail_json") update[k] = body[k];
  } else {
    for (const k of Object.keys(body)) if (PROVIDER_FIELDS.has(k)) update[k] = body[k];
    if (body.submit_for_review) { update.status = "Pending Review"; update.admin_review_status = "Pending Review"; }
  }

  if (Object.keys(update).length) {
    const { error } = await db.from("service_listings").update(update).eq("id", ex.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Update detail_json if provided
  if (body.detail_json && typeof body.detail_json === "object") {
    await db.from("service_listing_details")
      .upsert({ service_listing_id: ex.id, detail_json: body.detail_json }, { onConflict: "service_listing_id" });
  }

  return NextResponse.json({ ok: true });
}
