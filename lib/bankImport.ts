// ─── Bank Statement / CSV Import Reconciliation Library ──────────────────────
// Types, CSV parsing, matching logic, audit actions, brain context builder.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankImportRow {
  id:                 string;
  import_name:        string | null;
  holding_account_id: string | null;
  file_name:          string | null;
  uploaded_by:        string | null;
  import_status:      "Uploaded" | "Parsed" | "Matched" | "Error";
  total_rows:         number;
  matched_rows:       number;
  unmatched_rows:     number;
  error_message:      string | null;
  created_at:         string;
}

export type TransactionType = "Incoming" | "Outgoing" | "Unknown";
export type MatchStatus     = "Unmatched" | "Suggested Match" | "Matched" | "Ignored";

export interface BankTransaction {
  id:                            string;
  import_id:                     string;
  holding_account_id:            string | null;
  transaction_date:              string | null;
  value_date:                    string | null;
  description:                   string | null;
  reference:                     string | null;
  debit:                         number;
  credit:                        number;
  amount:                        number | null;
  currency:                      string;
  counterparty_name:             string | null;
  transaction_type:              TransactionType;
  match_status:                  MatchStatus;
  matched_held_payment_id:       string | null;
  matched_release_settlement_id: string | null;
  confidence_score:              number | null;
  match_reasons:                 string | null;
  created_at:                    string;
}

// Column mapping: our field name → the CSV header string the admin selected
export interface ColumnMapping {
  transaction_date?:  string;
  value_date?:        string;
  description?:       string;
  reference?:         string;
  debit?:             string;
  credit?:            string;
  amount?:            string;
  counterparty_name?: string;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = splitCSVLine(nonEmpty[0]);
  const rows    = nonEmpty.slice(1).map(splitCSVLine);
  return { headers, rows };
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current  = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, "").replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseDate(s: string): string | null {
  if (!s || s.trim() === "") return null;
  try {
    const d = new Date(s.trim());
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch { return null; }
}

export type ParsedTxRow = Omit<
  BankTransaction,
  "id" | "import_id" | "holding_account_id" | "match_status" |
  "matched_held_payment_id" | "matched_release_settlement_id" |
  "confidence_score" | "match_reasons" | "created_at"
>;

export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
  defaultCurrency = "RM",
): ParsedTxRow[] {
  const headerLower = headers.map((h) => h.toLowerCase());
  const idx = (field: keyof ColumnMapping) => {
    const h = mapping[field];
    if (!h) return -1;
    return headerLower.indexOf(h.toLowerCase());
  };

  const dateIdx  = idx("transaction_date");
  const vdIdx    = idx("value_date");
  const descIdx  = idx("description");
  const refIdx   = idx("reference");
  const debitIdx = idx("debit");
  const creditIdx = idx("credit");
  const amtIdx   = idx("amount");
  const cpIdx    = idx("counterparty_name");

  return rows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => {
      const get = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

      let debit  = debitIdx  >= 0 ? parseNum(get(debitIdx))  : 0;
      let credit = creditIdx >= 0 ? parseNum(get(creditIdx)) : 0;

      // If only an 'amount' column: positive = credit, negative = debit
      if (amtIdx >= 0 && debitIdx < 0 && creditIdx < 0) {
        const raw  = get(amtIdx).replace(/,/g, "");
        const amtN = parseFloat(raw.replace(/[^\d.\-]/g, ""));
        if (!isNaN(amtN)) {
          if (raw.includes("-") || amtN < 0) { debit = Math.abs(amtN); credit = 0; }
          else                               { credit = amtN; debit = 0; }
        }
      }

      const txType: TransactionType =
        credit > 0 ? "Incoming" : debit > 0 ? "Outgoing" : "Unknown";

      return {
        transaction_date:  parseDate(get(dateIdx)),
        value_date:        parseDate(get(vdIdx)),
        description:       get(descIdx)  || null,
        reference:         get(refIdx)   || null,
        debit,
        credit,
        amount:            debit > 0 ? debit : credit > 0 ? credit : null,
        currency:          defaultCurrency,
        counterparty_name: get(cpIdx) || null,
        transaction_type:  txType,
      };
    });
}

// ─── Matching candidates ──────────────────────────────────────────────────────

export interface HeldPaymentCandidate {
  id:                    string;
  job_reference:         string;
  amount:                number;
  currency:              string;
  holding_status:        string;
  payment_reference?:    string | null;
  customer_name?:        string | null;
  customer_company_name?: string | null;
}

export interface ReleaseSettlementCandidate {
  id:                      string;
  job_reference:           string;
  expected_release_amount: number;
  currency:                string;
  settlement_status:       string;
  payee_name?:             string | null;
  release_reference?:      string | null;
  provider_name?:          string | null;
}

export interface MatchResult {
  candidateId: string;
  score:       number;
  reasons:     string[];
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

function fuzzyTokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokA = a.toLowerCase().split(/[\s\-_,./]+/).filter((t) => t.length > 2);
  const tokB = b.toLowerCase().split(/[\s\-_,./]+/).filter((t) => t.length > 2);
  if (tokA.length === 0 || tokB.length === 0) return 0;
  const matches = tokA.filter((t) => tokB.some((tb) => tb.includes(t) || t.includes(tb))).length;
  return matches / Math.max(tokA.length, tokB.length);
}

function textContains(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  if (!haystack || !needle || needle.length < 3) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

type IncomingTx = Pick<ParsedTxRow, "credit" | "currency" | "reference" | "description" | "counterparty_name">;
type OutgoingTx = Pick<ParsedTxRow, "debit"  | "currency" | "reference" | "description" | "counterparty_name">;

export function scoreIncomingMatch(tx: IncomingTx, hp: HeldPaymentCandidate): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  if (tx.currency !== hp.currency) return { candidateId: hp.id, score: 0, reasons: ["Currency mismatch"] };

  const amtDiff = Math.abs(tx.credit - hp.amount);
  if (amtDiff < 0.01) {
    score += 60; reasons.push("Exact amount match");
  } else if (hp.amount > 0 && amtDiff / hp.amount < 0.01) {
    score += 45; reasons.push("Near amount match (<1%)");
  } else {
    return { candidateId: hp.id, score: 0, reasons: ["Amount too far off"] };
  }

  const text = [tx.reference ?? "", tx.description ?? ""].join(" ");

  if (hp.payment_reference && textContains(text, hp.payment_reference)) {
    score += 35; reasons.push(`Payment reference matched (${hp.payment_reference})`);
  } else if (textContains(text, hp.job_reference)) {
    score += 25; reasons.push(`Job reference in text (${hp.job_reference})`);
  }

  const nameOverlap = fuzzyTokenOverlap(
    tx.counterparty_name ?? "",
    hp.customer_company_name ?? hp.customer_name ?? "",
  );
  if (nameOverlap > 0.3) {
    score += 15; reasons.push(`Company name overlap (${Math.round(nameOverlap * 100)}%)`);
  }

  return { candidateId: hp.id, score, reasons };
}

export function scoreOutgoingMatch(tx: OutgoingTx, rs: ReleaseSettlementCandidate): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  if (tx.currency !== rs.currency) return { candidateId: rs.id, score: 0, reasons: ["Currency mismatch"] };

  const amtDiff = Math.abs(tx.debit - rs.expected_release_amount);
  if (amtDiff < 0.01) {
    score += 60; reasons.push("Exact amount match");
  } else if (rs.expected_release_amount > 0 && amtDiff / rs.expected_release_amount < 0.01) {
    score += 45; reasons.push("Near amount match (<1%)");
  } else {
    return { candidateId: rs.id, score: 0, reasons: ["Amount too far off"] };
  }

  const text = [tx.reference ?? "", tx.description ?? ""].join(" ");

  if (rs.release_reference && textContains(text, rs.release_reference)) {
    score += 35; reasons.push(`Release reference matched (${rs.release_reference})`);
  } else if (textContains(text, rs.job_reference)) {
    score += 25; reasons.push(`Job reference in text (${rs.job_reference})`);
  }

  const nameOverlap = fuzzyTokenOverlap(
    tx.counterparty_name ?? "",
    rs.payee_name ?? rs.provider_name ?? "",
  );
  if (nameOverlap > 0.3) {
    score += 15; reasons.push(`Payee name overlap (${Math.round(nameOverlap * 100)}%)`);
  }

  return { candidateId: rs.id, score, reasons };
}

// Pick best match above threshold
export function bestMatch(results: MatchResult[], threshold = 60): MatchResult | null {
  const above = results.filter((r) => r.score >= threshold);
  if (above.length === 0) return null;
  return above.reduce((best, r) => (r.score > best.score ? r : best));
}

// ─── Audit action names ───────────────────────────────────────────────────────

export const BANK_IMPORT_AUDIT_ACTIONS = {
  uploaded:  "bank_statement_import_uploaded",
  parsed:    "bank_statement_parsed",
  suggested: "bank_transaction_suggested_match",
  confirmed: "bank_transaction_match_confirmed",
  rejected:  "bank_transaction_match_rejected",
  ignored:   "bank_transaction_ignored",
} as const;

// ─── Status badge styles ──────────────────────────────────────────────────────

export const IMPORT_STATUS_BADGE: Record<string, string> = {
  Uploaded:  "border-slate-700/40 bg-slate-800/40 text-slate-400",
  Parsed:    "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Matched:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Error:     "border-red-500/30 bg-red-500/10 text-red-400",
};

export const MATCH_STATUS_BADGE: Record<string, string> = {
  Unmatched:        "border-slate-700/40 bg-slate-800/40 text-slate-500",
  "Suggested Match": "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Matched:          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Ignored:          "border-slate-700/40 bg-slate-800/20 text-slate-600",
};

export const TX_TYPE_BADGE: Record<string, string> = {
  Incoming: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Outgoing: "border-red-500/30 bg-red-500/10 text-red-400",
  Unknown:  "border-slate-700/40 bg-slate-800/40 text-slate-500",
};

export function confidenceColor(score: number | null): string {
  if (score === null) return "text-slate-600";
  if (score >= 90) return "text-emerald-400";
  if (score >= 75) return "text-amber-400";
  if (score >= 60) return "text-orange-400";
  return "text-red-400";
}

// ─── Nexum Brain context ──────────────────────────────────────────────────────

export interface BrainBankContext {
  totalImports:   number;
  unmatchedCount: number;
  suggestedCount: number;
  matchedCount:   number;
  importErrors:   number;
  recentImports:  { name: string | null; date: string; status: string; matched: number; total: number }[];
}

export function buildBankImportBrainContext(ctx: BrainBankContext): string {
  const lines: string[] = ["=== Bank Statement / CSV Import Reconciliation ==="];
  lines.push(`Total imports: ${ctx.totalImports}`);
  lines.push(`Transactions unmatched: ${ctx.unmatchedCount}`);
  lines.push(`Transactions with suggested matches (pending admin review): ${ctx.suggestedCount}`);
  lines.push(`Transactions confirmed matched: ${ctx.matchedCount}`);
  if (ctx.importErrors > 0) lines.push(`Import errors: ${ctx.importErrors} — check /admin/bank-imports`);

  lines.push("");
  lines.push("Q: Has this payment been matched to bank statement?");
  lines.push(
    ctx.matchedCount > 0
      ? `A: Yes — ${ctx.matchedCount} transaction(s) confirmed matched to bank statements. See /admin/bank-imports.`
      : "A: No confirmed bank statement matches on record yet.",
  );

  lines.push("");
  lines.push("Q: Is there a bank transaction supporting this proof?");
  lines.push(
    ctx.suggestedCount > 0
      ? `A: ${ctx.suggestedCount} suggested match(es) pending admin confirmation. Admin must review and confirm at /admin/bank-imports.`
      : "A: No suggested bank transaction matches found. Upload a bank statement CSV to reconcile.",
  );

  lines.push("");
  lines.push("Q: Has provider release been reconciled with bank statement?");
  lines.push(
    "A: Bank-statement reconciliation for outgoing releases must be confirmed by admin in /admin/bank-imports. " +
    "A confirmed outgoing match updates the release_settlement with actual bank transaction reference and amount.",
  );

  if (ctx.recentImports.length > 0) {
    lines.push("\nRecent imports:");
    ctx.recentImports.slice(0, 3).forEach((r) => {
      lines.push(`  - ${r.name ?? r.date}: ${r.status}, ${r.matched}/${r.total} matched`);
    });
  }
  return lines.join("\n");
}
