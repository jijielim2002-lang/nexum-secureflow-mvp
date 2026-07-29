// POST  /api/trade-chains/[ref]/links — add trade link
// PATCH /api/trade-chains/[ref]/links — update link status

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    from_node_id?:           string;
    to_node_id?:             string;
    link_type?:              string;
    invoice_reference?:      string;
    payment_terms?:          string;
    trade_amount?:           number;
    currency?:               string;
    expected_payment_date?:  string;
    expected_delivery_date?: string;
    risk_level?:             string;
  };

  const { data, error } = await db
    .from("trade_chain_links")
    .insert({
      trade_chain_reference,
      from_node_id:           body.from_node_id           ?? null,
      to_node_id:             body.to_node_id             ?? null,
      link_type:              body.link_type              ?? "Goods Sale",
      invoice_reference:      body.invoice_reference      ?? null,
      payment_terms:          body.payment_terms          ?? null,
      trade_amount:           body.trade_amount           ?? 0,
      currency:               body.currency               ?? "MYR",
      expected_payment_date:  body.expected_payment_date  ?? null,
      expected_delivery_date: body.expected_delivery_date ?? null,
      risk_level:             body.risk_level             ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, link: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    link_id:               string;
    link_status?:          string;
    actual_payment_date?:  string;
    actual_delivery_date?: string;
    risk_level?:           string;
  };

  const { error } = await db
    .from("trade_chain_links")
    .update({
      ...(body.link_status           && { link_status:           body.link_status }),
      ...(body.actual_payment_date   && { actual_payment_date:   body.actual_payment_date }),
      ...(body.actual_delivery_date  && { actual_delivery_date:  body.actual_delivery_date }),
      ...(body.risk_level            && { risk_level:            body.risk_level }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.link_id)
    .eq("trade_chain_reference", trade_chain_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
