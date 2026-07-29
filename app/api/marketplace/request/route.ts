// GET  /api/marketplace/request  — list customer requests (role-filtered)
// POST /api/marketplace/request  — customer submits a service request
// PATCH /api/marketplace/request — provider quotes / admin action / customer accepts

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
    .from("service_customer_requests")
    .select("*, listing:service_listings!listing_id(title, service_type, currency)")
    .order("created_at", { ascending: false });

  if (profile.role === "customer") {
    query = query.eq("customer_company_id", profile.company_id);
  } else if (profile.role === "service_provider") {
    query = query.eq("provider_company_id", profile.company_id);
  }
  // admin sees all

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const profile = await verifyToken(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "customer") {
    return NextResponse.json({ ok: false, error: "Only customers can submit service requests" }, { status: 403 });
  }

  const body = await req.json() as Record<string, unknown>;
  const db = admin();

  // Verify listing exists and is Approved
  const { data: listing, error: listingErr } = await db
    .from("service_listings")
    .select("id, provider_company_id, listing_status, is_active")
    .eq("id", body.listing_id)
    .single();

  if (listingErr || !listing) {
    return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });
  }
  if (listing.listing_status !== "Approved" || !listing.is_active) {
    return NextResponse.json({ ok: false, error: "This listing is not currently available" }, { status: 400 });
  }

  // Generate reference
  const { data: refData, error: refErr } = await db.rpc("generate_service_request_reference");
  if (refErr || !refData) return NextResponse.json({ ok: false, error: "Failed to generate reference" }, { status: 500 });

  const { data, error } = await db
    .from("service_customer_requests")
    .insert({
      request_reference:    refData as string,
      listing_id:           listing.id,
      customer_company_id:  profile.company_id,
      provider_company_id:  listing.provider_company_id,
      job_id:               body.job_id               ?? null,
      message:              body.message               ?? null,
      quantity:             body.quantity              ?? null,
      requested_start_date: body.requested_start_date ?? null,
      requested_end_date:   body.requested_end_date   ?? null,
      origin_country:       body.origin_country        ?? null,
      destination_country:  body.destination_country   ?? null,
      cargo_description:    body.cargo_description     ?? null,
      special_requirements: body.special_requirements  ?? null,
      attached_documents:   body.attached_documents    ?? null,
      agreed_currency:      body.currency              ?? "USD",
      request_status:       "Submitted",
    })
    .select("request_reference")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, request_reference: (data as { request_reference: string }).request_reference });
}

export async function PATCH(req: NextRequest) {
  const profile = await verifyToken(req);
  if (!profile) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { request_reference, _action, ...fields } = body as {
    request_reference: string;
    _action?: string;
    [k: string]: unknown;
  };

  if (!request_reference) return NextResponse.json({ ok: false, error: "request_reference is required" }, { status: 400 });

  const db = admin();
  const { data: req2, error: fetchErr } = await db
    .from("service_customer_requests")
    .select("id, customer_company_id, provider_company_id, request_status")
    .eq("request_reference", request_reference)
    .single();

  if (fetchErr || !req2) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });

  const isAdmin    = profile.role === "admin";
  const isCustomer = profile.role === "customer" && req2.customer_company_id === profile.company_id;
  const isProvider = profile.role === "service_provider" && req2.provider_company_id === profile.company_id;

  if (!isAdmin && !isCustomer && !isProvider) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const update: Record<string, unknown> = {};

  if (_action === "provider_quote" && isProvider) {
    update.provider_quote        = fields.provider_quote;
    update.provider_quote_notes  = fields.provider_quote_notes ?? null;
    update.provider_response     = fields.provider_response ?? null;
    update.provider_responded_at = new Date().toISOString();
    update.request_status        = "Quoted";
  } else if (_action === "customer_accept" && isCustomer) {
    update.request_status = "Accepted";
    update.agreed_price   = req2.request_status === "Quoted" ? fields.agreed_price ?? null : null;
  } else if (_action === "customer_cancel" && isCustomer) {
    update.request_status = "Cancelled";
  } else if (_action === "mark_in_progress" && (isProvider || isAdmin)) {
    update.request_status = "In Progress";
  } else if (_action === "mark_completed" && (isProvider || isAdmin)) {
    update.request_status = "Completed";
    update.completed_at   = new Date().toISOString();
    if (isAdmin && fields.platform_commission) update.platform_commission = fields.platform_commission;
  } else if (_action === "admin_note" && isAdmin) {
    update.admin_notes = fields.admin_notes ?? null;
    if (fields.request_status) update.request_status = fields.request_status;
  } else if (isAdmin) {
    // Admin free-form update
    for (const key of Object.keys(fields)) update[key] = fields[key];
  } else {
    return NextResponse.json({ ok: false, error: "Invalid action or insufficient permissions" }, { status: 400 });
  }

  const { error } = await db
    .from("service_customer_requests")
    .update(update)
    .eq("id", req2.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
