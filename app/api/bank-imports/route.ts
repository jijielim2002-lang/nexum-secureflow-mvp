// ─── GET + POST /api/bank-imports ─────────────────────────────────────────────
// GET   list all bank statement imports (admin only)
// POST  upload CSV, parse, auto-suggest matches (admin only)
//
// POST accepts multipart/form-data:
//   file             — the CSV file
//   importName       — display name for this import
//   holdingAccountId — (optional) uuid of payment_holding_accounts row
//   columnMapping    — JSON: { transaction_date, description, reference, debit, credit, amount, counterparty_name }
//   currency         — default currency if not in CSV (default "RM")
//
// Auto-matching runs immediately on import.
// Matches are SUGGESTED only — no confirmed reconciliation without admin action.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  parseCSV,
  applyMapping,
  scoreIncomingMatch,
  scoreOutgoingMatch,
  bestMatch,
  BANK_IMPORT_AUDIT_ACTIONS,
  type ColumnMapping,
  type HeldPaymentCandidate,
  type ReleaseSettlementCandidate,
} from "@/lib/bankImport";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const limit  = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10), 500);

  let q = svc
    .from("bank_statement_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("import_status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 }); }

  const file              = formData.get("file") as File | null;
  const importName        = (formData.get("importName")  as string | null) ?? null;
  const holdingAccountId  = (formData.get("holdingAccountId") as string | null) ?? null;
  const currency          = (formData.get("currency") as string | null) ?? "RM";
  const mappingRaw        = formData.get("columnMapping") as string | null;

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  let mapping: ColumnMapping = {};
  if (mappingRaw) {
    try { mapping = JSON.parse(mappingRaw) as ColumnMapping; }
    catch { return NextResponse.json({ error: "Invalid columnMapping JSON" }, { status: 400 }); }
  }

  const now = new Date().toISOString();
  const fileName = file.name;

  // ── Create import record ────────────────────────────────────────────────────

  const { data: importRow, error: importErr } = await svc
    .from("bank_statement_imports")
    .insert({
      import_name:       importName,
      holding_account_id: holdingAccountId ?? null,
      file_name:         fileName,
      uploaded_by:       adminId,
      import_status:     "Uploaded",
      created_at:        now,
    })
    .select()
    .single();

  if (importErr || !importRow) {
    return NextResponse.json({ error: importErr?.message ?? "Failed to create import" }, { status: 500 });
  }

  const importId = importRow.id as string;

  // ── Parse CSV ───────────────────────────────────────────────────────────────

  let csvText: string;
  try { csvText = await file.text(); }
  catch {
    await svc.from("bank_statement_imports").update({ import_status: "Error", error_message: "Failed to read file" }).eq("id", importId);
    return NextResponse.json({ error: "Failed to read uploaded file" }, { status: 400 });
  }

  const { headers, rows } = parseCSV(csvText);

  if (headers.length === 0) {
    await svc.from("bank_statement_imports").update({ import_status: "Error", error_message: "CSV is empty or has no headers" }).eq("id", importId);
    return NextResponse.json({ error: "CSV is empty or unreadable" }, { status: 400 });
  }

  const parsed = applyMapping(headers, rows, mapping, currency);

  if (parsed.length === 0) {
    await svc.from("bank_statement_imports").update({
      import_status: "Parsed", total_rows: 0, matched_rows: 0, unmatched_rows: 0,
    }).eq("id", importId);
    return NextResponse.json({ importId, totalRows: 0, suggestedMatches: 0, unmatched: 0 });
  }

  // ── Insert transactions (batch of 500) ──────────────────────────────────────

  const txInserts = parsed.map((p) => ({
    import_id:          importId,
    holding_account_id: holdingAccountId ?? null,
    ...p,
    match_status:  "Unmatched" as const,
    created_at:    now,
  }));

  const BATCH = 500;
  for (let i = 0; i < txInserts.length; i += BATCH) {
    const { error: txErr } = await svc.from("bank_statement_transactions").insert(txInserts.slice(i, i + BATCH));
    if (txErr) {
      await svc.from("bank_statement_imports").update({ import_status: "Error", error_message: txErr.message }).eq("id", importId);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }
  }

  await svc.from("bank_statement_imports").update({ import_status: "Parsed", total_rows: parsed.length }).eq("id", importId);

  // ── Audit: uploaded + parsed ─────────────────────────────────────────────────

  await svc.from("audit_logs").insert([
    {
      actor_role:  "admin",
      actor_name:  "Nexum Admin",
      action:      BANK_IMPORT_AUDIT_ACTIONS.uploaded,
      description: `Bank statement import "${importName ?? fileName}" uploaded. File: ${fileName}. ${parsed.length} rows parsed.`,
      created_at:  now,
    },
    {
      actor_role:  "admin",
      actor_name:  "Nexum Admin",
      action:      BANK_IMPORT_AUDIT_ACTIONS.parsed,
      description: `Import "${importName ?? fileName}" parsed: ${parsed.length} transactions. Incoming: ${parsed.filter(r => r.transaction_type === "Incoming").length}, Outgoing: ${parsed.filter(r => r.transaction_type === "Outgoing").length}.`,
      created_at:  now,
    },
  ]);

  // ── Auto-match ───────────────────────────────────────────────────────────────

  const incomingTx = parsed.filter((r) => r.transaction_type === "Incoming");
  const outgoingTx = parsed.filter((r) => r.transaction_type === "Outgoing");

  // Fetch candidates (all unsettled, in any relevant currency)
  const currencies = [...new Set(parsed.map((r) => r.currency))];

  const [hpRes, settlRes, jobsRes] = await Promise.all([
    svc
      .from("held_payments")
      .select("id, job_reference, amount, currency, holding_status")
      .in("holding_status", ["Holding", "Pending Secured", "Deposit Secured"])
      .in("currency", currencies),
    svc
      .from("release_settlements")
      .select("id, job_reference, expected_release_amount, currency, settlement_status, payee_name, release_reference")
      .in("settlement_status", ["Pending", "Processing", "Released"])
      .in("currency", currencies),
    svc
      .from("secured_jobs")
      .select("job_reference, customer, service_provider, customer_company_id, service_provider_company_id"),
  ]);

  const hpRaw   = (hpRes.data   ?? []) as { id: string; job_reference: string; amount: number; currency: string; holding_status: string }[];
  const settlRaw = (settlRes.data ?? []) as { id: string; job_reference: string; expected_release_amount: number; currency: string; settlement_status: string; payee_name: string | null; release_reference: string | null }[];
  const jobsRaw  = (jobsRes.data ?? []) as { job_reference: string; customer: string; service_provider: string; customer_company_id: string | null; service_provider_company_id: string | null }[];

  const jobMap = new Map(jobsRaw.map((j) => [j.job_reference, j]));

  const hpCandidates: HeldPaymentCandidate[] = hpRaw.map((hp) => {
    const job = jobMap.get(hp.job_reference);
    return {
      id:                    hp.id,
      job_reference:         hp.job_reference,
      amount:                hp.amount,
      currency:              hp.currency,
      holding_status:        hp.holding_status,
      customer_name:         job?.customer ?? null,
      customer_company_name: job?.customer ?? null,
      payment_reference:     null,
    };
  });

  const settlCandidates: ReleaseSettlementCandidate[] = settlRaw.map((rs) => {
    const job = jobMap.get(rs.job_reference);
    return {
      id:                      rs.id,
      job_reference:           rs.job_reference,
      expected_release_amount: rs.expected_release_amount,
      currency:                rs.currency,
      settlement_status:       rs.settlement_status,
      payee_name:              rs.payee_name,
      release_reference:       rs.release_reference,
      provider_name:           job?.service_provider ?? null,
    };
  });

  // Re-fetch inserted transactions with their ids so we can update them
  const { data: insertedTxs } = await svc
    .from("bank_statement_transactions")
    .select("id, transaction_type, credit, debit, currency, reference, description, counterparty_name")
    .eq("import_id", importId)
    .order("created_at");

  const txRows = insertedTxs ?? [];

  const updates: { id: string; match_status: string; matched_held_payment_id?: string | null; matched_release_settlement_id?: string | null; confidence_score?: number; match_reasons?: string }[] = [];

  let suggestedCount = 0;

  for (const tx of txRows) {
    if (tx.transaction_type === "Incoming" && hpCandidates.length > 0) {
      const scores = hpCandidates.map((hp) => scoreIncomingMatch(tx as Parameters<typeof scoreIncomingMatch>[0], hp));
      const best = bestMatch(scores);
      if (best) {
        updates.push({
          id:                     tx.id,
          match_status:           "Suggested Match",
          matched_held_payment_id: best.candidateId,
          confidence_score:       best.score,
          match_reasons:          best.reasons.join("; "),
        });
        suggestedCount++;
      }
    } else if (tx.transaction_type === "Outgoing" && settlCandidates.length > 0) {
      const scores = settlCandidates.map((rs) => scoreOutgoingMatch(tx as Parameters<typeof scoreOutgoingMatch>[0], rs));
      const best = bestMatch(scores);
      if (best) {
        updates.push({
          id:                           tx.id,
          match_status:                 "Suggested Match",
          matched_release_settlement_id: best.candidateId,
          confidence_score:             best.score,
          match_reasons:                best.reasons.join("; "),
        });
        suggestedCount++;
      }
    }
  }

  // Apply match updates
  for (const upd of updates) {
    const { id, ...fields } = upd;
    await svc.from("bank_statement_transactions").update(fields).eq("id", id);
  }

  // Audit: suggested matches
  if (suggestedCount > 0) {
    await svc.from("audit_logs").insert({
      actor_role:  "system",
      actor_name:  "Nexum SecureFlow",
      action:      BANK_IMPORT_AUDIT_ACTIONS.suggested,
      description: `Auto-matching: ${suggestedCount} suggested match(es) generated for import "${importName ?? fileName}". Admin confirmation required — no reconciliation applied automatically.`,
      created_at:  now,
    });
  }

  // Update import totals
  const matchedRows   = suggestedCount;
  const unmatchedRows = txRows.length - suggestedCount;

  await svc.from("bank_statement_imports").update({
    import_status:  "Matched",
    total_rows:     parsed.length,
    matched_rows:   matchedRows,
    unmatched_rows: unmatchedRows,
  }).eq("id", importId);

  return NextResponse.json({
    importId,
    totalRows:       parsed.length,
    suggestedMatches: suggestedCount,
    unmatched:       unmatchedRows,
  });
}
