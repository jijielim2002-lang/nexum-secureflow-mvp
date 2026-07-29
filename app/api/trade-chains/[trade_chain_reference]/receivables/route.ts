// GET  /api/trade-chains/[ref]/receivables
// POST /api/trade-chains/[ref]/receivables
// PATCH /api/trade-chains/[ref]/receivables

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  let query = db
    .from("trade_chain_receivables")
    .select("*")
    .eq("trade_chain_reference", trade_chain_reference)
    .order("due_date");

  if (!isAdmin(auth)) {
    // Only see own receivables as seller or buyer
    query = query.or(`seller_company_id.eq.${auth.companyId},buyer_company_id.eq.${auth.companyId}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, receivables: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    buyer_company_id?:  string;
    invoice_reference?: string;
    invoice_amount?:    number;
    currency?:          string;
    invoice_date?:      string;
    due_date?:          string;
  };

  const { data, error } = await db
    .from("trade_chain_receivables")
    .insert({
      trade_chain_reference,
      seller_company_id: auth.companyId       ?? null,
      buyer_company_id:  body.buyer_company_id ?? null,
      invoice_reference: body.invoice_reference ?? null,
      invoice_amount:    body.invoice_amount    ?? 0,
      currency:          body.currency          ?? "MYR",
      invoice_date:      body.invoice_date      ?? null,
      due_date:          body.due_date          ?? null,
      payment_status:    "Unpaid",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, receivable: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    receivable_id:   string;
    payment_status?: string;
    paid_date?:      string;
  };

  const { error } = await db
    .from("trade_chain_receivables")
    .update({
      ...(body.payment_status && { payment_status: body.payment_status }),
      ...(body.paid_date      && { paid_date:      body.paid_date }),
    })
    .eq("id", body.receivable_id)
    .eq("trade_chain_reference", trade_chain_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
