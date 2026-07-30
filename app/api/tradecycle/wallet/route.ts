// GET  /api/tradecycle/wallet  → get or auto-create wallet for caller's company
// POST /api/tradecycle/wallet  → record a top-up (balance increase)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

async function getOrCreateWallet(db: ReturnType<typeof adminClient>, company_id: string, currency = "MYR") {
  const { data: existing } = await db
    .from("tradecycle_wallets")
    .select("*")
    .eq("company_id", company_id)
    .eq("currency", currency)
    .maybeSingle();
  if (existing) return existing;

  const { data: created } = await db
    .from("tradecycle_wallets")
    .insert({ company_id, currency })
    .select("*")
    .single();
  return created;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const currency = new URL(req.url).searchParams.get("currency") ?? "MYR";

  if (auth.role === "admin") {
    const { data } = await db
      .from("tradecycle_wallets")
      .select("*, companies(company_name)")
      .order("created_at", { ascending: false });
    return NextResponse.json({ ok: true, wallets: data ?? [] });
  }

  if (!auth.company_id) return NextResponse.json({ ok: false, error: "No company" }, { status: 400 });
  const wallet = await getOrCreateWallet(db, auth.company_id, currency);
  return NextResponse.json({ ok: true, wallet });
}

// ── POST — record top-up ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    amount:       number;
    currency?:    string;
    description?: string;
    company_id?:  string; // admin only
  };

  if (!body.amount || body.amount <= 0)
    return NextResponse.json({ ok: false, error: "amount must be positive" }, { status: 400 });

  const company_id = auth.role === "admin" && body.company_id
    ? body.company_id
    : auth.company_id;
  if (!company_id) return NextResponse.json({ ok: false, error: "No company" }, { status: 400 });

  const currency = body.currency ?? "MYR";
  const wallet   = await getOrCreateWallet(db, company_id, currency);
  if (!wallet) return NextResponse.json({ ok: false, error: "Could not create wallet" }, { status: 500 });

  const newTotal     = (wallet.total_balance     as number) + body.amount;
  const newAvailable = (wallet.available_balance as number) + body.amount;

  const { data: updated, error } = await db
    .from("tradecycle_wallets")
    .update({ total_balance: newTotal, available_balance: newAvailable })
    .eq("id", wallet.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Audit log
  await db.from("tradecycle_audit_log").insert({
    company_id,
    wallet_id:    wallet.id,
    event_type:   "wallet_topup_recorded",
    event_amount: body.amount,
    currency,
    description:  body.description ?? `Top-up of ${currency} ${body.amount.toLocaleString()} recorded`,
    performed_by: auth.userId,
    metadata:     { previous_total: wallet.total_balance, new_total: newTotal },
  });

  return NextResponse.json({ ok: true, wallet: updated });
}
