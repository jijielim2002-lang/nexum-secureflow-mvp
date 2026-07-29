// GET  /api/marketplace  — list service_listings (role-filtered)
// POST /api/marketplace  — provider creates a listing (Draft → Pending Review)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isProvider, isCustomer } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db  = adminClient();
  const url = new URL(req.url);
  const cat = url.searchParams.get("category");

  let q = db
    .from("service_listings")
    .select("*, provider_company:companies!provider_company_id(name, country), service_listing_details(detail_json)")
    .order("created_at", { ascending: false });

  if (isCustomer(auth))  q = q.eq("status", "Live");
  else if (isProvider(auth)) q = q.eq("provider_company_id", auth.company_id!);
  // admin sees all

  if (cat) q = q.eq("service_category", cat);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Flatten detail_json into listings
  const listings = (data ?? []).map((l: Record<string, unknown>) => {
    const details = (l.service_listing_details as { detail_json: unknown }[] | null)?.[0];
    return { ...l, detail_json: details?.detail_json ?? null, service_listing_details: undefined };
  });

  return NextResponse.json({ ok: true, listings });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isProvider(auth) && !isAdmin(auth))
    return NextResponse.json({ ok: false, error: "Providers only" }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const db   = adminClient();

  const { data: refData, error: refErr } = await db.rpc("generate_listing_reference");
  if (refErr || !refData) return NextResponse.json({ ok: false, error: "Failed to generate reference" }, { status: 500 });

  const { data: listing, error: lErr } = await db
    .from("service_listings")
    .insert({
      listing_reference:   refData as string,
      provider_company_id: auth.company_id!,
      created_by:          auth.userId,
      service_category:    body.service_category,
      listing_title:       body.listing_title,
      description:         body.description         ?? null,
      cargo_type:          body.cargo_type           ?? "General Cargo",
      currency:            body.currency             ?? "USD",
      validity_from:       body.validity_from        ?? null,
      validity_to:         body.validity_to          ?? null,
      remarks:             body.remarks              ?? null,
      status:              body.submit_for_review ? "Pending Review" : "Draft",
      admin_review_status: "Pending Review",
    })
    .select("id, listing_reference")
    .single();

  if (lErr || !listing) return NextResponse.json({ ok: false, error: lErr?.message ?? "Insert failed" }, { status: 500 });

  // Insert detail_json if provided
  if (body.detail_json && typeof body.detail_json === "object") {
    await db.from("service_listing_details").insert({
      service_listing_id: (listing as { id: string }).id,
      detail_json:        body.detail_json,
    });
  }

  return NextResponse.json({ ok: true, listing_reference: (listing as { listing_reference: string }).listing_reference });
}
