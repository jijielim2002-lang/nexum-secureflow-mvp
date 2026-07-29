// GET  /api/trade-chains/[ref]/cashflow — get all cashflow gaps
// POST /api/trade-chains/[ref]/cashflow — compute + save per-node gaps

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

// Financing product recommendation by role + gap
function recommendFinancing(role: string, gapDays: number, gapAmount: number): string {
  if (gapAmount <= 0) return "No Financing Needed";
  if (role === "Factory" || role === "Supplier") {
    return gapDays > 30 ? "Supplier Balance Financing" : "Supplier Deposit Protection";
  }
  if (role === "Importer") {
    return gapDays >= 20 ? "Shipment Working Capital" : "Duty Tax Financing";
  }
  if (role === "Trader" || role === "Distributor") {
    return "Inventory Financing";
  }
  if (role === "Retailer") {
    return "Retailer Stock Financing";
  }
  return "Distributor Working Capital";
}

function riskFromGap(days: number): "Low" | "Medium" | "High" | "Critical" {
  if (days < 15) return "Low";
  if (days < 30) return "Medium";
  if (days < 60) return "High";
  return "Critical";
}

export async function GET(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  let query = db
    .from("trade_chain_cashflow_analysis")
    .select("*")
    .eq("trade_chain_reference", trade_chain_reference)
    .order("created_at", { ascending: false });

  if (!isAdmin(auth)) {
    query = query.eq("company_id", auth.companyId ?? "");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cashflow: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    // Manual entry mode
    company_id?:    string;
    company_role?:  string;
    cash_out_amount?: number;
    cash_out_date?:   string;
    cash_in_amount?:  number;
    cash_in_date?:    string;
    gap_reason?:      string;
    // Auto-compute mode
    auto_compute?: boolean;
  };

  if (body.auto_compute) {
    // Auto-compute for all nodes from trade links
    const { data: nodes } = await db
      .from("trade_chain_nodes")
      .select("*")
      .eq("trade_chain_reference", trade_chain_reference);
    const { data: links } = await db
      .from("trade_chain_links")
      .select("*")
      .eq("trade_chain_reference", trade_chain_reference);

    const rows = (nodes ?? []).map((node: {
      id: string; company_id?: string; node_role?: string; trade_chain_reference: string;
    }) => {
      // Find outgoing (cash_out) and incoming (cash_in) links
      const outLinks = (links ?? []).filter((l: { from_node_id?: string }) => l.from_node_id === node.id);
      const inLinks  = (links ?? []).filter((l: { to_node_id?: string }) => l.to_node_id   === node.id);

      const cashOut = outLinks.reduce((s: number, l: { trade_amount?: number }) => s + (l.trade_amount ?? 0), 0);
      const cashIn  = inLinks.reduce((s: number, l: { trade_amount?: number }) => s + (l.trade_amount ?? 0), 0);

      // Estimate dates from link due dates
      const outDate = outLinks[0]?.expected_payment_date ?? null;
      const inDate  = inLinks[0]?.expected_payment_date  ?? null;

      let gapDays = 0;
      if (outDate && inDate) {
        gapDays = Math.max(0, Math.round(
          (new Date(inDate).getTime() - new Date(outDate).getTime()) / 86400000
        ));
      }

      const gapAmount = Math.max(0, cashOut - cashIn);
      const role      = node.node_role ?? "Other";

      return {
        trade_chain_reference,
        company_id:    node.company_id ?? null,
        company_role:  role,
        cash_out_amount: cashOut,
        cash_out_date:   outDate,
        cash_in_amount:  cashIn,
        cash_in_date:    inDate,
        funding_gap_amount: gapAmount,
        funding_gap_days:   gapDays,
        gap_reason: `${role} pays upstream before receiving downstream payment`,
        recommended_financing_product: recommendFinancing(role, gapDays, gapAmount),
        risk_level: riskFromGap(gapDays),
      };
    });

    // Upsert per company_id
    await db.from("trade_chain_cashflow_analysis").delete().eq("trade_chain_reference", trade_chain_reference);
    if (rows.length > 0) await db.from("trade_chain_cashflow_analysis").insert(rows);

    const { data } = await db
      .from("trade_chain_cashflow_analysis")
      .select("*")
      .eq("trade_chain_reference", trade_chain_reference);

    return NextResponse.json({ ok: true, cashflow: data ?? [] });
  }

  // Manual entry
  const cashOut   = body.cash_out_amount ?? 0;
  const cashIn    = body.cash_in_amount  ?? 0;
  const gapAmount = Math.max(0, cashOut - cashIn);
  let gapDays   = 0;
  if (body.cash_out_date && body.cash_in_date) {
    gapDays = Math.max(0, Math.round(
      (new Date(body.cash_in_date).getTime() - new Date(body.cash_out_date).getTime()) / 86400000
    ));
  }
  const role = body.company_role ?? "Other";

  const { data, error } = await db
    .from("trade_chain_cashflow_analysis")
    .insert({
      trade_chain_reference,
      company_id:    body.company_id    ?? auth.companyId ?? null,
      company_role:  role,
      cash_out_amount: cashOut,
      cash_out_date:   body.cash_out_date ?? null,
      cash_in_amount:  cashIn,
      cash_in_date:    body.cash_in_date  ?? null,
      funding_gap_amount: gapAmount,
      funding_gap_days:   gapDays,
      gap_reason:    body.gap_reason ?? null,
      recommended_financing_product: recommendFinancing(role, gapDays, gapAmount),
      risk_level:    riskFromGap(gapDays),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cashflow: data }, { status: 201 });
}
