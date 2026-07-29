// GET  /api/marketplace  — list listings (role-filtered)
// POST /api/marketplace  — provider creates a new listing

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

export async function GET(req: NextRequest) {
  const profile = await verifyToken(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = admin();
  let query = db
    .from("service_listings")
    .select("*, provider_company:companies!provider_company_id(name, country)")
    .order("created_at", { ascending: false });

  if (profile.role === "customer") {
    query = query.eq("listing_status", "Approved").eq("is_active", true);
  } else if (profile.role === "service_provider") {
    query = query.eq("provider_company_id", profile.company_id);
  }
  // admin sees all

  const url = new URL(req.url);
  const serviceType = url.searchParams.get("service_type");
  if (serviceType) query = query.eq("service_type", serviceType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, listings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const profile = await verifyToken(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "service_provider" && profile.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Only service providers can create listings" }, { status: 403 });
  }

  const body = await req.json() as Record<string, unknown>;
  const db = admin();

  // Generate reference
  const { data: refData, error: refErr } = await db.rpc("generate_service_reference");
  if (refErr || !refData) return NextResponse.json({ ok: false, error: "Failed to generate reference" }, { status: 500 });

  const { data, error } = await db
    .from("service_listings")
    .insert({
      listing_reference:   refData as string,
      provider_company_id: profile.company_id,
      service_type:        body.service_type,
      title:               body.title,
      description:         body.description        ?? null,
      service_scope:       body.service_scope       ?? null,
      service_modes:       body.service_modes       ?? null,
      certifications:      body.certifications      ?? null,
      languages_supported: body.languages_supported ?? null,
      pricing_model:       body.pricing_model       ?? null,
      base_price:          body.base_price          ?? null,
      currency:            body.currency            ?? "USD",
      service_details:     body.service_details     ?? null,
      available_from:      body.available_from      ?? null,
      available_until:     body.available_until     ?? null,
      listing_status:      "Pending Review",
    })
    .select("listing_reference")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, listing_reference: (data as { listing_reference: string }).listing_reference });
}
