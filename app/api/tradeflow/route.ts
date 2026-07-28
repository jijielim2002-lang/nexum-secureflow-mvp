// POST /api/tradeflow        → create new tradeflow request
// GET  /api/tradeflow        → list tradeflow requests (customer: own; admin: all)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyUser(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const db = admin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await db.from("profiles")
    .select("role, company_id").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { user, role: profile.role as string, company_id: profile.company_id as string | null };
}

function randomAlphaNum(n: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generateRef() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `TF-${y}${m}${d}-${randomAlphaNum(6)}`;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = admin();
  let query = db
    .from("tradeflow_requests")
    .select("id,tradeflow_reference,request_type,trade_type,supplier_name,supplier_country,buyer_name,currency,trade_amount,requested_payment_amount,payment_stage,payment_status,remittance_required,remittance_status,risk_level,workflow_status,created_at,updated_at,customer_company_id")
    .order("created_at", { ascending: false });

  if (auth.role !== "admin") {
    if (!auth.company_id) return NextResponse.json({ ok: true, requests: [] });
    query = query.eq("customer_company_id", auth.company_id) as typeof query;
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["customer", "admin"].includes(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = admin();
  const tradeflow_reference = generateRef();
  const now = new Date().toISOString();

  const insert = {
    tradeflow_reference,
    customer_company_id:       auth.company_id ?? null,
    customer_user_id:          auth.user.id,
    request_type:              body.request_type             ?? null,
    trade_type:                body.trade_type               ?? "Import",
    supplier_name:             body.supplier_name            ?? null,
    supplier_country:          body.supplier_country         ?? null,
    buyer_name:                body.buyer_name               ?? null,
    buyer_country:             body.buyer_country            ?? null,
    commodity_description:     body.commodity_description    ?? null,
    hs_code:                   body.hs_code                  ?? null,
    currency:                  body.currency                 ?? "USD",
    trade_amount:              body.trade_amount             ?? null,
    requested_payment_amount:  body.requested_payment_amount ?? null,
    payment_stage:             body.payment_stage            ?? null,
    incoterm:                  body.incoterm                 ?? null,
    origin_country:            body.origin_country           ?? null,
    destination_country:       body.destination_country      ?? null,
    shipment_mode:             body.shipment_mode            ?? null,
    expected_ship_date:        body.expected_ship_date       ?? null,
    expected_arrival_date:     body.expected_arrival_date    ?? null,
    release_condition:         body.release_condition        ?? null,
    remittance_required:       body.remittance_required      ?? false,
    remittance_partner:        body.remittance_partner       ?? null,
    remittance_status:         body.remittance_required ? "Pending Partner Review" : "Not Required",
    payment_status:            "Draft",
    created_at:                now,
    updated_at:                now,
  };

  const { error } = await db.from("tradeflow_requests").insert(insert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, tradeflow_reference });
}
