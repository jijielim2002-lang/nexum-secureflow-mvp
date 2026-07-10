// ─── Holding Account Reconciliation Library ───────────────────────────────────
// Types, helpers, and status maps for manual payment reconciliation.
//
// Reconciliation gates the "Mark Payment Secured" action:
//   reconciliation_status must be 'Matched' before admin can secure payment.

export type ReconciliationStatus =
  | "Pending"
  | "Matched"
  | "Amount Mismatch"
  | "Reference Mismatch"
  | "Duplicate Suspected"
  | "Unclear"
  | "Rejected";

export interface ReconciliationRow {
  id:                    string;
  held_payment_id:       string | null;
  payment_obligation_id: string | null;
  job_reference:         string;
  holding_account_id:    string | null;
  expected_amount:       number | null;
  received_amount:       number | null;
  currency:              string;
  payer_name:            string | null;
  payer_company_id:      string | null;
  bank_reference:        string | null;
  payment_reference:     string | null;
  received_at:           string | null;
  reconciliation_status: ReconciliationStatus;
  reconciliation_note:   string | null;
  reconciled_by:         string | null;
  reconciled_at:         string | null;
  created_at:            string;
  updated_at:            string;
}

// ─── Status badge styles ──────────────────────────────────────────────────────

export const RECON_STATUS_BADGE: Record<ReconciliationStatus, string> = {
  "Pending":              "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Matched":              "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Amount Mismatch":      "bg-red-500/15 text-red-400 border-red-500/30",
  "Reference Mismatch":   "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Duplicate Suspected":  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Unclear":              "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Rejected":             "bg-red-800/30 text-red-500 border-red-800/50",
};

export const RECON_STATUS_ICON: Record<ReconciliationStatus, string> = {
  "Pending":              "⏳",
  "Matched":              "✓",
  "Amount Mismatch":      "⚠",
  "Reference Mismatch":   "⚠",
  "Duplicate Suspected":  "⚠",
  "Unclear":              "?",
  "Rejected":             "✕",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if reconciliation allows admin to mark payment secured */
export function canMarkSecured(r: ReconciliationRow | null | undefined): boolean {
  return r?.reconciliation_status === "Matched";
}

/** True if reconciliation is blocking progress */
export function isReconBlocking(r: ReconciliationRow | null | undefined): boolean {
  if (!r) return false;
  return (
    r.reconciliation_status === "Amount Mismatch" ||
    r.reconciliation_status === "Reference Mismatch" ||
    r.reconciliation_status === "Duplicate Suspected" ||
    r.reconciliation_status === "Unclear" ||
    r.reconciliation_status === "Rejected"
  );
}

/** True if reconciliation is pending (no action yet) */
export function isReconPending(r: ReconciliationRow | null | undefined): boolean {
  return r?.reconciliation_status === "Pending";
}

/** Calculate mismatch delta */
export function amountDelta(r: ReconciliationRow): number | null {
  if (r.received_amount == null || r.expected_amount == null) return null;
  return Number(r.received_amount) - Number(r.expected_amount);
}

/** Format currency amount */
export function fmtReconAmount(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

// ─── Audit action names ───────────────────────────────────────────────────────

export const RECON_AUDIT_ACTIONS: Record<ReconciliationStatus, string> = {
  "Pending":             "reconciliation_created",
  "Matched":             "payment_reconciliation_matched",
  "Amount Mismatch":     "payment_reconciliation_amount_mismatch",
  "Reference Mismatch":  "payment_reconciliation_reference_mismatch",
  "Duplicate Suspected": "payment_reconciliation_duplicate_suspected",
  "Unclear":             "payment_reconciliation_unclear",
  "Rejected":            "payment_reconciliation_rejected",
};

// ─── Nexum Brain context builder ──────────────────────────────────────────────

export function buildReconBrainContext(recon: ReconciliationRow | null): string {
  if (!recon) {
    return "No reconciliation record found for this payment. Reconciliation is required before payment can be secured.";
  }

  const delta = amountDelta(recon);
  const lines: string[] = ["=== Payment Reconciliation Status ==="];

  lines.push(`Reconciliation Status: ${recon.reconciliation_status}`);
  lines.push(`Expected Amount: ${fmtReconAmount(recon.expected_amount, recon.currency)}`);
  lines.push(`Received Amount: ${fmtReconAmount(recon.received_amount, recon.currency)}`);

  if (delta !== null) {
    if (delta === 0) lines.push("Amount Match: EXACT MATCH ✓");
    else lines.push(`Amount Delta: ${delta > 0 ? "+" : ""}${fmtReconAmount(delta, recon.currency)} (${delta > 0 ? "overpayment" : "shortfall"})`);
  }

  if (recon.bank_reference) lines.push(`Bank Reference: ${recon.bank_reference}`);
  if (recon.payment_reference) lines.push(`Payment Reference: ${recon.payment_reference}`);
  if (recon.received_at) lines.push(`Received At: ${recon.received_at.slice(0, 16).replace("T", " ")} UTC`);
  if (recon.reconciliation_note) lines.push(`Note: ${recon.reconciliation_note}`);

  lines.push("");
  lines.push(`Can Mark Payment Secured: ${canMarkSecured(recon) ? "YES — reconciliation matched" : "NO — " + recon.reconciliation_status}`);

  if (isReconBlocking(recon)) {
    lines.push(`Blocking Reason: ${recon.reconciliation_status} — admin review required before payment can be secured.`);
  }

  return lines.join("\n");
}
