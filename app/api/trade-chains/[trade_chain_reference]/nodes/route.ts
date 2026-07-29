// POST  /api/trade-chains/[ref]/nodes — add node
// PATCH /api/trade-chains/[ref]/nodes — update node status/visibility

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    company_id?:       string;
    company_name?:     string;
    node_role:         string;
    node_sequence?:    number;
    country?:          string;
    visibility_level?: string;
  };

  if (!body.node_role) return NextResponse.json({ ok: false, error: "node_role required" }, { status: 400 });

  const { data, error } = await db
    .from("trade_chain_nodes")
    .insert({
      trade_chain_reference,
      company_id:      body.company_id      ?? null,
      company_name:    body.company_name    ?? null,
      node_role:       body.node_role,
      node_sequence:   body.node_sequence   ?? null,
      country:         body.country         ?? null,
      visibility_level: body.visibility_level ?? "Masked",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, node: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    node_id:           string;
    node_status?:      string;
    visibility_level?: string;
    risk_score?:       number;
    credit_score?:     number;
  };

  const { error } = await db
    .from("trade_chain_nodes")
    .update({
      ...(body.node_status      && { node_status: body.node_status }),
      ...(body.visibility_level && { visibility_level: body.visibility_level }),
      ...(body.risk_score   !== undefined && { risk_score:   body.risk_score }),
      ...(body.credit_score !== undefined && { credit_score: body.credit_score }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.node_id)
    .eq("trade_chain_reference", trade_chain_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
