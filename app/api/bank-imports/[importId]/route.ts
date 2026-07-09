// ─── GET /api/bank-imports/[importId] ────────────────────────────────────────
// Returns import row + all associated transactions with match details.
// Filter params: matchStatus, transactionType, limit

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  const { importId } = await params;
  const matchStatus      = req.nextUrl.searchParams.get("matchStatus");
  const transactionType  = req.nextUrl.searchParams.get("transactionType");
  const limit            = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "2000", 10), 5000);

  const { data: importRow, error: importErr } = await svc
    .from("bank_statement_imports")
    .select("*")
    .eq("id", importId)
    .single();

  if (importErr || !importRow) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  let txQuery = svc
    .from("bank_statement_transactions")
    .select("*")
    .eq("import_id", importId)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (matchStatus)     txQuery = txQuery.eq("match_status", matchStatus);
  if (transactionType) txQuery = txQuery.eq("transaction_type", transactionType);

  const { data: transactions, error: txErr } = await txQuery;
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  // Enrich transactions: fetch matched entities for display
  const txs = transactions ?? [];

  const hpIds     = [...new Set(txs.map((t) => t.matched_held_payment_id).filter(Boolean) as string[])];
  const settlIds  = [...new Set(txs.map((t) => t.matched_release_settlement_id).filter(Boolean) as string[])];

  const [hpRes, settlRes] = await Promise.all([
    hpIds.length > 0
      ? svc.from("held_payments").select("id, job_reference, amount, currency, holding_status").in("id", hpIds)
      : { data: [] },
    settlIds.length > 0
      ? svc.from("release_settlements").select("id, job_reference, expected_release_amount, currency, settlement_status, payee_name").in("id", settlIds)
      : { data: [] },
  ]);

  const hpMap    = new Map((hpRes.data ?? []).map((r: { id: string }) => [r.id, r]));
  const settlMap = new Map((settlRes.data ?? []).map((r: { id: string }) => [r.id, r]));

  const enriched = txs.map((tx) => ({
    ...tx,
    matched_held_payment:       tx.matched_held_payment_id       ? hpMap.get(tx.matched_held_payment_id)    : null,
    matched_release_settlement: tx.matched_release_settlement_id ? settlMap.get(tx.matched_release_settlement_id) : null,
  }));

  return NextResponse.json({ import: importRow, transactions: enriched });
}
