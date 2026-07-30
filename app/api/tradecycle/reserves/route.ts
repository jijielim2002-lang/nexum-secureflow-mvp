// GET   /api/tradecycle/reserves  → list reserves for caller's company
// POST  /api/tradecycle/reserves  → create a new reserve (deducts from available)
// PATCH /api/tradecycle/reserves  → release / settle / cancel a reserve

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db     = adminClient();
  const params = new URL(req.url).searchParams;
  const status = params.get("status");

  let query = db
    .from("tradecycle_reserves")
    .select("*")
    .order("created_at", { ascending: false });

  if (auth.role !== "admin") {
    if (!auth.company_id) return NextResponse.json({ ok: true, reserves: [] });
    query = query.eq("company_id", auth.company_id) as typeof query;
  }
  if (status) query = query.eq("reserve_status", status) as typeof query;

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reserves: data ?? [] });
}

// ── POST — create reserve ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    wallet_id?:           string;
    reserved_amount:      number;
    currency?:            string;
    reserve_purpose:      string;
    release_condition?:   string;
    bundle_reference?:    string;
    tradeflow_reference?: string;
    trade_chain_reference?: string;
  };

  if (!body.reserved_amount || body.reserved_amount <= 0)
    return NextResponse.json({ ok: false, error: "reserved_amount must be positive" }, { status: 400 });
  if (!body.reserve_purpose)
    return NextResponse.json({ ok: false, error: "reserve_purpose required" }, { status: 400 });

  const company_id = auth.company_id;
  if (!company_id) return NextResponse.json({ ok: false, error: "No company" }, { status: 400 });

  const currency = body.currency ?? "MYR";

  // Find wallet
  let wallet_id = body.wallet_id;
  if (!wallet_id) {
    const { data: w } = await db
      .from("tradecycle_wallets")
      .select("id, available_balance")
      .eq("company_id", company_id)
      .eq("currency", currency)
      .maybeSingle();
    if (!w) return NextResponse.json({ ok: false, error: "No wallet found. Record a balance first." }, { status: 400 });
    wallet_id = w.id as string;

    // Check sufficient available balance
    if ((w.available_balance as number) < body.reserved_amount) {
      // Log trade_capacity_exceeded
      await db.from("tradecycle_audit_log").insert({
        company_id, wallet_id,
        event_type: "trade_capacity_exceeded",
        event_amount: body.reserved_amount,
        currency,
        description: `Reserve of ${currency} ${body.reserved_amount} exceeds available balance of ${currency} ${w.available_balance}`,
        performed_by: auth.userId,
      });
      return NextResponse.json({
        ok: false,
        error: "Insufficient available balance. Trade capacity exceeded.",
        available: w.available_balance,
      }, { status: 422 });
    }
  }

  // Generate reference
  const { data: refData } = await db.rpc("generate_reserve_reference" as never);
  const reserve_reference = (refData as string) ?? `RSV-${Date.now()}`;

  const { data: reserve, error } = await db
    .from("tradecycle_reserves")
    .insert({
      wallet_id,
      company_id,
      bundle_reference:      body.bundle_reference      ?? null,
      tradeflow_reference:   body.tradeflow_reference   ?? null,
      trade_chain_reference: body.trade_chain_reference ?? null,
      reserve_reference,
      reserved_amount:       body.reserved_amount,
      currency,
      reserve_purpose:       body.reserve_purpose,
      release_condition:     body.release_condition     ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Recompute wallet balances
  await db.rpc("recompute_wallet_balances" as never, { p_wallet_id: wallet_id });

  // Audit log
  await db.from("tradecycle_audit_log").insert({
    company_id, wallet_id, reserve_id: reserve.id,
    event_type: "reserve_created",
    event_amount: body.reserved_amount,
    currency,
    description: `Reserve ${reserve_reference} created for ${body.reserve_purpose}`,
    performed_by: auth.userId,
    metadata: { reserve_reference, bundle_reference: body.bundle_reference },
  });

  return NextResponse.json({ ok: true, reserve }, { status: 201 });
}

// ── PATCH — release / settle / cancel ────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    reserve_id:       string;
    action:           "release" | "settle" | "cancel" | "partial_release";
    release_amount?:  number;
  };

  if (!body.reserve_id) return NextResponse.json({ ok: false, error: "reserve_id required" }, { status: 400 });
  if (!body.action)     return NextResponse.json({ ok: false, error: "action required" },     { status: 400 });

  // Fetch reserve
  let fetchQ = db.from("tradecycle_reserves").select("*").eq("id", body.reserve_id);
  if (auth.role !== "admin") fetchQ = fetchQ.eq("company_id", auth.company_id ?? "") as typeof fetchQ;
  const { data: reserve, error: fetchErr } = await fetchQ.maybeSingle();
  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  if (!reserve)  return NextResponse.json({ ok: false, error: "Not found" },       { status: 404 });

  const updates: Record<string, unknown> = {};
  let eventType: string;
  let eventAmt = 0;

  if (body.action === "release") {
    updates.reserve_status   = "Released";
    updates.released_amount  = reserve.reserved_amount;
    eventType = "reserve_released";
    eventAmt  = reserve.reserved_amount as number;
  } else if (body.action === "partial_release") {
    const amt = body.release_amount ?? 0;
    const newReleased = (reserve.released_amount as number) + amt;
    const remaining   = (reserve.reserved_amount as number) - newReleased;
    updates.released_amount = newReleased;
    updates.reserve_status  = remaining <= 0 ? "Released" : "Partially Released";
    eventType = "reserve_released";
    eventAmt  = amt;
  } else if (body.action === "settle") {
    updates.reserve_status  = "Settled";
    updates.released_amount = reserve.reserved_amount;
    eventType = "reserve_settled";
    eventAmt  = reserve.reserved_amount as number;
  } else {
    updates.reserve_status  = "Cancelled";
    updates.released_amount = 0;
    eventType = "reserve_cancelled";
  }

  const { data: updated, error: updateErr } = await db
    .from("tradecycle_reserves")
    .update(updates)
    .eq("id", body.reserve_id)
    .select("*")
    .single();

  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

  // Recompute wallet
  await db.rpc("recompute_wallet_balances" as never, { p_wallet_id: reserve.wallet_id });

  // Audit log
  await db.from("tradecycle_audit_log").insert({
    company_id: reserve.company_id,
    wallet_id:  reserve.wallet_id,
    reserve_id: reserve.id,
    event_type: eventType,
    event_amount: eventAmt,
    currency: reserve.currency,
    description: `Reserve ${reserve.reserve_reference as string} — ${body.action}`,
    performed_by: auth.userId,
    metadata: { reserve_reference: reserve.reserve_reference, action: body.action },
  });

  return NextResponse.json({ ok: true, reserve: updated });
}
