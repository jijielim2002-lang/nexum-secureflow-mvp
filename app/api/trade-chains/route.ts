// GET  /api/trade-chains — list chains (admin=all, company=own)
// POST /api/trade-chains — create new trade chain

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  let query = db
    .from("trade_chains")
    .select(`
      *,
      trade_chain_nodes(id, node_role, node_sequence, company_name, company_id, country, node_status),
      trade_chain_risk_flags(id, flag_type, severity, is_resolved)
    `)
    .order("created_at", { ascending: false });

  if (!isAdmin(auth)) {
    // Company sees only chains where they are a node
    const { data: myNodes } = await db
      .from("trade_chain_nodes")
      .select("trade_chain_reference")
      .eq("company_id", auth.companyId ?? "");
    const refs = (myNodes ?? []).map(n => n.trade_chain_reference as string);
    if (refs.length === 0) return NextResponse.json({ ok: true, chains: [] });
    query = query.in("trade_chain_reference", refs);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, chains: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    chain_title?:         string;
    chain_type?:          string;
    commodity_category?:  string;
    product_description?: string;
    hs_code?:             string;
    origin_country?:      string;
    destination_country?: string;
    total_trade_value?:   number;
    currency?:            string;
    nodes?:               {
      company_id?:      string;
      company_name?:    string;
      node_role:        string;
      node_sequence?:   number;
      country?:         string;
      visibility_level?: string;
    }[];
  };

  // Create chain
  const { data: chain, error: chainErr } = await db
    .from("trade_chains")
    .insert({
      chain_title:         body.chain_title         ?? null,
      chain_type:          body.chain_type          ?? "Import to Retail",
      anchor_company_id:   auth.companyId           ?? null,
      created_by:          auth.userId,
      commodity_category:  body.commodity_category  ?? null,
      product_description: body.product_description ?? null,
      hs_code:             body.hs_code             ?? null,
      origin_country:      body.origin_country      ?? null,
      destination_country: body.destination_country ?? null,
      total_trade_value:   body.total_trade_value   ?? 0,
      currency:            body.currency            ?? "MYR",
    })
    .select("*")
    .single();

  if (chainErr) return NextResponse.json({ ok: false, error: chainErr.message }, { status: 500 });

  const ref = (chain as { trade_chain_reference: string }).trade_chain_reference;

  // Auto-add creator as anchor node
  const anchorNode = {
    trade_chain_reference: ref,
    company_id:   auth.companyId ?? null,
    node_role:    "Importer",
    node_sequence: 0,
    visibility_level: "Full",
    node_status: "Active",
  };
  await db.from("trade_chain_nodes").insert(anchorNode);

  // Add additional nodes if provided
  if (body.nodes && body.nodes.length > 0) {
    const nodeRows = body.nodes.map(n => ({
      trade_chain_reference: ref,
      company_id:      n.company_id      ?? null,
      company_name:    n.company_name    ?? null,
      node_role:       n.node_role,
      node_sequence:   n.node_sequence   ?? null,
      country:         n.country         ?? null,
      visibility_level: n.visibility_level ?? "Masked",
    }));
    await db.from("trade_chain_nodes").insert(nodeRows);
  }

  return NextResponse.json({ ok: true, chain, trade_chain_reference: ref }, { status: 201 });
}
