// GET   /api/marketplace/listings/[reference]  — listing detail
// PATCH /api/marketplace/listings/[reference]  — update listing (provider draft / admin any)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPA_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function admin() {
  return createClient(SUPA_URL, SUPA_SVC, { auth: { persistSession: false } });
}

async function verifyToken(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "").trim() ?? "";
  if (!token) return null;
  const anon = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await admin()
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", user.id)
    .single();
  return profile ? { ...profile, userId: user.id } : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const profile = await verifyToken(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = admin();
  const { data: listing, error } = await db
    .from("service_listings")
    .select("*, provider_company:companies!provider_company_id(name, country)")
    .eq("listing_reference", reference)
    .single();

  if (error || !listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

  // Customer can only see Approved listings
  if (profile.role === "customer" && listing.listing_status !== "Approved") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  // Provider can only see own
  if (profile.role === "service_provider" && listing.provider_company_id !== profile.company_id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Fetch customer requests for this listing (provider & admin only)
  let requests = null;
  if (profile.role === "service_provider" || profile.role === "admin") {
    const { data } = await db
      .from("service_customer_requests")
      .select("*")
      .eq("listing_id", listing.id)
      .order("created_at", { ascending: false });
    requests = data ?? [];
  }

  return NextResponse.json({ ok: true, listing, requests });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const profile = await verifyToken(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = admin();
  const { data: existing, error: fetchErr } = await db
    .from("service_listings")
    .select("id, provider_company_id, listing_status")
    .eq("listing_reference", reference)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

  const body = await req.json() as Record<string, unknown>;
  const isAdmin    = profile.role === "admin";
  const isProvider = profile.role === "service_provider" && existing.provider_company_id === profile.company_id;

  if (!isAdmin && !isProvider) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Provider can only edit Draft/Rejected listings
  if (isProvider && !["Draft", "Rejected"].includes(existing.listing_status as string)) {
    return NextResponse.json({ ok: false, error: "Cannot edit a listing that is not in Draft or Rejected state" }, { status: 403 });
  }

  // Build update payload — admin can change status, provider cannot
  const allowedProviderFields = new Set([
    "title", "description", "service_scope", "service_modes", "certifications",
    "languages_supported", "pricing_model", "base_price", "currency",
    "service_details", "available_from", "available_until",
  ]);
  const update: Record<string, unknown> = {};

  if (isAdmin) {
    // Admin can patch anything
    for (const key of Object.keys(body)) update[key] = body[key];
  } else {
    for (const key of Object.keys(body)) {
      if (allowedProviderFields.has(key)) update[key] = body[key];
    }
    // Provider submitting for review
    if (body.submit_for_review === true) update["listing_status"] = "Pending Review";
  }

  const { error } = await db
    .from("service_listings")
    .update(update)
    .eq("id", existing.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
