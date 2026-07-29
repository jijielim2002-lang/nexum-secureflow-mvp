// GET  /api/trade-chains/[ref]/financing — list opportunities
// POST /api/trade-chains/[ref]/financing — create financing opportunity (simulation only)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ trade_chain_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  let query = db
    .from("trade_chain_financing_opportunities")
    .select("*")
    .eq("trade_chain_reference", trade_chain_reference)
    .order("created_at", { ascending: false });

  if (!isAdmin(auth)) {
    query = query.eq("company_id", auth.companyId ?? "");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, opportunities: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { trade_chain_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    company_id?:         string;
    opportunity_type:    string;
    recommended_amount?: number;
    currency?:           string;
    tenor_days?:         number;
    repayment_source?:   string;
    reason?:             string;
  };

  if (!body.opportunity_type)
    return NextResponse.json({ ok: false, error: "opportunity_type required" }, { status: 400 });

  const amount = body.recommended_amount ?? 0;
  // Simple eligibility hint
  let eligibility: "Simulation Only" | "Potentially Eligible" | "Requires Review" | "Not Suitable" = "Simulation Only";
  if (amount > 0 && amount <= 500000)  eligibility = "Potentially Eligible";
  else if (amount > 500000)            eligibility = "Requires Review";

  const { data, error } = await db
    .from("trade_chain_financing_opportunities")
    .insert({
      trade_chain_reference,
      company_id:          body.company_id       ?? auth.companyId ?? null,
      opportunity_type:    body.opportunity_type,
      recommended_amount:  amount,
      currency:            body.currency          ?? "MYR",
      tenor_days:          body.tenor_days         ?? 30,
      repayment_source:    body.repayment_source  ?? null,
      reason:              body.reason            ?? null,
      eligibility_status:  eligibility,
      simulation_note:     "Simulation only — subject to credit review and documentation.",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, opportunity: data }, { status: 201 });
}
