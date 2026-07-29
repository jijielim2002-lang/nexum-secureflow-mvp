// GET  /api/trade-chains/[ref]/inventory
// POST /api/trade-chains/[ref]/inventory
// PATCH /api/trade-chains/[ref]/inventory

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("trade_chain_inventory_positions")
    .select("*")
    .eq("trade_chain_reference", trade_chain_reference)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inventory: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    product_description?: string;
    quantity?:            number;
    unit?:                string;
    inventory_value?:     number;
    currency?:            string;
    location?:            string;
    received_at?:         string;
    inventory_status?:    string;
  };

  const { data, error } = await db
    .from("trade_chain_inventory_positions")
    .insert({
      trade_chain_reference,
      company_id:          auth.companyId       ?? null,
      product_description: body.product_description ?? null,
      quantity:            body.quantity           ?? 0,
      unit:                body.unit               ?? "unit",
      inventory_value:     body.inventory_value    ?? 0,
      currency:            body.currency           ?? "MYR",
      location:            body.location           ?? null,
      received_at:         body.received_at        ?? null,
      inventory_status:    body.inventory_status   ?? "Ordered",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, position: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    position_id:       string;
    inventory_status?: string;
    quantity?:         number;
    sold_at?:          string;
    location?:         string;
  };

  const { error } = await db
    .from("trade_chain_inventory_positions")
    .update({
      ...(body.inventory_status && { inventory_status: body.inventory_status }),
      ...(body.quantity !== undefined && { quantity: body.quantity }),
      ...(body.sold_at   && { sold_at:   body.sold_at }),
      ...(body.location  && { location:  body.location }),
    })
    .eq("id", body.position_id)
    .eq("trade_chain_reference", trade_chain_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
