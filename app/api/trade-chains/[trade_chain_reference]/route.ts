// GET   /api/trade-chains/[ref] — full chain detail
// PATCH /api/trade-chains/[ref] — update status / fields

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  const { data: chain, error } = await db
    .from("trade_chains")
    .select("*")
    .eq("trade_chain_reference", trade_chain_reference)
    .single();

  if (error || !chain) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Access check
  if (!isAdmin(auth)) {
    const { data: myNode } = await db
      .from("trade_chain_nodes")
      .select("id")
      .eq("trade_chain_reference", trade_chain_reference)
      .eq("company_id", auth.companyId ?? "")
      .maybeSingle();
    if (!myNode && (chain as { created_by: string }).created_by !== auth.userId) {
      return NextResponse.json({ ok: false, error: "Access denied" }, { status: 403 });
    }
  }

  const myCompanyId = auth.companyId ?? null;
  const adminView   = isAdmin(auth);

  // Fetch all related data in parallel
  const [nodesRes, linksRes, bundlesRes, inventoryRes, receivablesRes, cashflowRes, financingRes, riskRes] = await Promise.all([
    db.from("trade_chain_nodes").select("*").eq("trade_chain_reference", trade_chain_reference).order("node_sequence"),
    db.from("trade_chain_links").select("*").eq("trade_chain_reference", trade_chain_reference).order("created_at"),
    db.from("shipment_bundles").select("id,bundle_reference,bundle_title,bundle_status,trade_chain_reference,total_service_amount,currency,origin_country,destination_country,created_at").eq("trade_chain_reference", trade_chain_reference),
    db.from("trade_chain_inventory_positions").select("*").eq("trade_chain_reference", trade_chain_reference),
    db.from("trade_chain_receivables").select("*").eq("trade_chain_reference", trade_chain_reference),
    db.from("trade_chain_cashflow_analysis").select("*").eq("trade_chain_reference", trade_chain_reference),
    db.from("trade_chain_financing_opportunities").select("*").eq("trade_chain_reference", trade_chain_reference),
    db.from("trade_chain_risk_flags").select("*").eq("trade_chain_reference", trade_chain_reference).order("created_at", { ascending: false }),
  ]);

  // Masking: for non-admin, filter cashflow/financing to own company only
  const nodes       = nodesRes.data ?? [];
  const links       = linksRes.data ?? [];
  const bundles     = bundlesRes.data ?? [];
  const inventory   = inventoryRes.data ?? [];
  const receivables = adminView
    ? receivablesRes.data ?? []
    : (receivablesRes.data ?? []).filter((r: { seller_company_id?: string; buyer_company_id?: string }) =>
        r.seller_company_id === myCompanyId || r.buyer_company_id === myCompanyId);
  const cashflow    = adminView
    ? cashflowRes.data ?? []
    : (cashflowRes.data ?? []).filter((c: { company_id?: string }) => c.company_id === myCompanyId);
  const financing   = adminView
    ? financingRes.data ?? []
    : (financingRes.data ?? []).filter((f: { company_id?: string }) => f.company_id === myCompanyId);
  const riskFlags   = riskRes.data ?? [];

  // Node masking for non-admin: only show Full or own-company nodes
  const visibleNodes = adminView
    ? nodes
    : nodes.map((n: { visibility_level?: string; company_id?: string; company_name?: string }) => {
        if (n.visibility_level === "Hidden") return null;
        if (n.visibility_level === "Masked" && n.company_id !== myCompanyId) {
          return { ...n, company_name: "— Masked —", company_id: null };
        }
        return n;
      }).filter(Boolean);

  return NextResponse.json({
    ok: true, chain, nodes: visibleNodes, links, bundles,
    inventory, receivables, cashflow, financing, risk_flags: riskFlags,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    action?:              string;
    chain_title?:         string;
    overall_risk_level?:  string;
    financing_readiness?: string;
    total_trade_value?:   number;
  };

  const STATUS_MAP: Record<string, string> = {
    activate:  "Active",
    progress:  "In Progress",
    complete:  "Completed",
    dispute:   "Disputed",
    suspend:   "Suspended",
    cancel:    "Cancelled",
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.action && STATUS_MAP[body.action]) updates.chain_status = STATUS_MAP[body.action];
  if (body.chain_title)         updates.chain_title          = body.chain_title;
  if (body.overall_risk_level)  updates.overall_risk_level   = body.overall_risk_level;
  if (body.financing_readiness) updates.financing_readiness  = body.financing_readiness;
  if (body.total_trade_value !== undefined) updates.total_trade_value = body.total_trade_value;

  const { error } = await db
    .from("trade_chains")
    .update(updates)
    .eq("trade_chain_reference", trade_chain_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
