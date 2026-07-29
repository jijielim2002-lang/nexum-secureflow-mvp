// GET  /api/vendor-credit-terms  → list (customer: own; admin: all)
// POST /api/vendor-credit-terms  → create new vendor credit term record

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  // Auto-refresh status for non-terminal records before returning
  // (marks Overdue / Due Soon based on today's date)
  await db.rpc("vct_refresh_statuses" as never).maybeSingle().catch(() => null);

  let query = db
    .from("vendor_credit_terms")
    .select("*")
    .order("due_date", { ascending: true });

  if (auth.role !== "admin") {
    if (!auth.company_id) return NextResponse.json({ ok: true, terms: [] });
    query = query.eq("buyer_company_id", auth.company_id) as typeof query;
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Attach computed status (days_until_due) client-side since no RPC
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const enriched = (data ?? []).map((row: Record<string, unknown>) => {
    const due = new Date(row.due_date as string);
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
    let computed_status = row.payment_status as string;
    if (!["Paid On Time","Paid Late","Cancelled","Disputed"].includes(computed_status)) {
      if (daysUntil < 0)         computed_status = "Overdue";
      else if (daysUntil <= 7)   computed_status = "Due Soon";
      else                       computed_status = "Not Due";
    }
    return { ...row, days_until_due: daysUntil, computed_status };
  });

  return NextResponse.json({ ok: true, terms: enriched });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    tradeflow_reference?:   string;
    bundle_reference?:      string;
    trade_chain_reference?: string;
    supplier_company_id?:   string;
    supplier_name:          string;
    invoice_reference?:     string;
    invoice_date?:          string;
    due_date:               string;
    credit_days?:           number;
    credit_limit_granted?:  number;
    invoice_amount:         number;
    currency?:              string;
  };

  if (!body.supplier_name) return NextResponse.json({ ok: false, error: "supplier_name required" }, { status: 400 });
  if (!body.due_date)      return NextResponse.json({ ok: false, error: "due_date required" },      { status: 400 });
  if (!body.invoice_amount) return NextResponse.json({ ok: false, error: "invoice_amount required" }, { status: 400 });

  // Resolve buyer company
  const buyer_company_id = auth.role === "admin" ? null : auth.company_id;

  const { data, error } = await db
    .from("vendor_credit_terms")
    .insert({
      tradeflow_reference:   body.tradeflow_reference   ?? null,
      bundle_reference:      body.bundle_reference      ?? null,
      trade_chain_reference: body.trade_chain_reference ?? null,
      buyer_company_id:      buyer_company_id           ?? null,
      supplier_company_id:   body.supplier_company_id   ?? null,
      supplier_name:         body.supplier_name,
      invoice_reference:     body.invoice_reference     ?? null,
      invoice_date:          body.invoice_date          ?? null,
      due_date:              body.due_date,
      credit_days:           body.credit_days           ?? null,
      credit_limit_granted:  body.credit_limit_granted  ?? 0,
      invoice_amount:        body.invoice_amount,
      currency:              body.currency              ?? "MYR",
      payment_status:        "Not Due",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, term: data }, { status: 201 });
}
