// GET   /api/trade-chains/[ref]/risk — list risk flags
// POST  /api/trade-chains/[ref]/risk — raise flag (admin)
// PATCH /api/trade-chains/[ref]/risk — resolve flag (admin)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("trade_chain_risk_flags")
    .select("*")
    .eq("trade_chain_reference", trade_chain_reference)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, flags: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(auth)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const db   = adminClient();
  const body = await req.json() as {
    flag_type:     string;
    severity?:     string;
    description?:  string;
    node_id?:      string;
    link_id?:      string;
  };

  const { data, error } = await db
    .from("trade_chain_risk_flags")
    .insert({
      trade_chain_reference,
      flag_type:   body.flag_type,
      severity:    body.severity    ?? "Medium",
      description: body.description ?? null,
      node_id:     body.node_id     ?? null,
      link_id:     body.link_id     ?? null,
      raised_by:   auth.userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, flag: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(auth)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const db   = adminClient();
  const body = await req.json() as { flag_id: string; resolution_note?: string };

  const { error } = await db
    .from("trade_chain_risk_flags")
    .update({
      is_resolved:     true,
      resolved_at:     new Date().toISOString(),
      resolved_by:     auth.userId,
      resolution_note: body.resolution_note ?? null,
    })
    .eq("id", body.flag_id)
    .eq("trade_chain_reference", trade_chain_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
