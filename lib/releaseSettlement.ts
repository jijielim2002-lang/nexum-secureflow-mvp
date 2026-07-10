// ─── Release / Settlement Reconciliation Library ─────────────────────────────
// Types, helpers, and status maps for manual settlement reconciliation.
//
// Settlement gates the final "Released" status on held payments:
//   settlement_status must be 'Reconciled' before held_payment is marked Released
//   and the job can be financially closed.

export type SettlementStatus =
  | "Pending"
  | "Processing"
  | "Released"
  | "Amount Mismatch"
  | "Reference Mismatch"
  | "Failed"
  | "Cancelled"
  | "Reconciled";

export interface ReleaseSettlementRow {
  id:                       string;
  release_instruction_id:   string | null;
  held_payment_id:          string | null;
  job_reference:            string;
  payee_company_id:         string | null;
  expected_release_amount:  number;
  actual_released_amount:   number | null;
  currency:                 string;
  payee_name:               string | null;
  payee_bank_name:          string | null;
  payee_account_reference:  string | null;
  release_reference:        string | null;
  bank_transaction_reference: string | null;
  settlement_status:        SettlementStatus;
  released_at:              string | null;
  reconciled_by:            string | null;
  reconciled_at:            string | null;
  reconciliation_note:      string | null;
  created_at:               string;
  updated_at:               string;
}

// ─── Status badge styles ──────────────────────────────────────────────────────

export const SETTLEMENT_STATUS_BADGE: Record<SettlementStatus, string> = {
  "Pending":            "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Processing":         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Released":           "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Amount Mismatch":    "bg-red-500/15 text-red-400 border-red-500/30",
  "Reference Mismatch": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Failed":             "bg-red-800/30 text-red-500 border-red-800/50",
  "Cancelled":          "bg-slate-800/40 text-slate-600 border-slate-700/40",
  "Reconciled":         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export const SETTLEMENT_STATUS_ICON: Record<SettlementStatus, string> = {
  "Pending":            "⏳",
  "Processing":         "⚙",
  "Released":           "→",
  "Amount Mismatch":    "⚠",
  "Reference Mismatch": "⚠",
  "Failed":             "✕",
  "Cancelled":          "—",
  "Reconciled":         "✓",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if settlement allows the job to be financially closed */
export function isSettlementReconciled(s: ReleaseSettlementRow | null | undefined): boolean {
  return s?.settlement_status === "Reconciled";
}

/** True if settlement is in a blocking / error state */
export function isSettlementBlocking(s: ReleaseSettlementRow | null | undefined): boolean {
  if (!s) return false;
  return (
    s.settlement_status === "Amount Mismatch" ||
    s.settlement_status === "Reference Mismatch" ||
    s.settlement_status === "Failed"
  );
}

/** True if settlement is in a terminal state (no further action needed or possible) */
export function isSettlementTerminal(s: ReleaseSettlementRow | null | undefined): boolean {
  if (!s) return false;
  return (
    s.settlement_status === "Reconciled" ||
    s.settlement_status === "Cancelled"
  );
}

/** True if provider has been paid (settlement released or reconciled) */
export function providerHasBeenPaid(s: ReleaseSettlementRow | null | undefined): boolean {
  if (!s) return false;
  return s.settlement_status === "Released" || s.settlement_status === "Reconciled";
}

/** Calculate settlement delta (actual − expected) */
export function settlementDelta(s: ReleaseSettlementRow): number | null {
  if (s.actual_released_amount == null || s.expected_release_amount == null) return null;
  return Number(s.actual_released_amount) - Number(s.expected_release_amount);
}

/** Format currency amount */
export function fmtSettlementAmount(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

// ─── Audit action names ───────────────────────────────────────────────────────

export const SETTLEMENT_AUDIT_ACTIONS: Record<SettlementStatus, string> = {
  "Pending":            "release_settlement_created",
  "Processing":         "release_settlement_processing",
  "Released":           "release_settlement_released",
  "Amount Mismatch":    "release_settlement_amount_mismatch",
  "Reference Mismatch": "release_settlement_reference_mismatch",
  "Failed":             "release_settlement_failed",
  "Cancelled":          "release_settlement_cancelled",
  "Reconciled":         "release_settlement_reconciled",
};

// ─── Step order for progress bar ─────────────────────────────────────────────

export const SETTLEMENT_STEP_ORDER: SettlementStatus[] = [
  "Pending", "Processing", "Released", "Reconciled",
];

// ─── Nexum Brain context builder ──────────────────────────────────────────────

export function buildSettlementBrainContext(
  settlements: ReleaseSettlementRow[],
  currency: string,
): string {
  if (settlements.length === 0) {
    return [
      "=== Release / Settlement Status ===",
      "No settlement records found for this job.",
      "Settlement records are created when a release instruction is approved.",
      "The provider has not yet been paid for this job.",
    ].join("\n");
  }

  const lines: string[] = ["=== Release / Settlement Status ==="];

  const reconciled = settlements.filter((s) => s.settlement_status === "Reconciled");
  const released   = settlements.filter((s) => s.settlement_status === "Released");
  const processing = settlements.filter((s) => s.settlement_status === "Processing");
  const blocking   = settlements.filter((s) => isSettlementBlocking(s));
  const pending    = settlements.filter((s) => s.settlement_status === "Pending");

  const totalExpected = settlements.reduce((acc, s) => acc + Number(s.expected_release_amount), 0);
  const totalActual   = reconciled.reduce((acc, s) => acc + Number(s.actual_released_amount ?? s.expected_release_amount), 0)
                      + released.reduce((acc, s) => acc + Number(s.actual_released_amount ?? s.expected_release_amount), 0);

  lines.push(`Total Settlements: ${settlements.length}`);
  lines.push(`Expected Release Total: ${fmtSettlementAmount(totalExpected, currency)}`);
  lines.push(`Confirmed Released/Reconciled: ${fmtSettlementAmount(totalActual, currency)}`);
  lines.push("");

  if (reconciled.length === settlements.length) {
    lines.push("Has the provider been paid? YES — all settlements reconciled. Job is financially closed.");
  } else if (released.length > 0 || reconciled.length > 0) {
    lines.push(`Has the provider been paid? PARTIALLY — ${reconciled.length + released.length} of ${settlements.length} settlements released or reconciled.`);
  } else if (processing.length > 0) {
    lines.push("Has the provider been paid? NOT YET — release instruction issued, settlement processing.");
  } else if (pending.length > 0) {
    lines.push("Has the provider been paid? NOT YET — settlement pending. Release instruction awaiting processing.");
  }

  for (const s of settlements) {
    lines.push("");
    lines.push(`── Settlement for ${fmtSettlementAmount(s.expected_release_amount, s.currency)} ──`);
    lines.push(`  Status: ${s.settlement_status}`);
    lines.push(`  Is Release Approved? ${s.settlement_status !== "Pending" ? "Yes" : "No — pending admin approval"}`);
    lines.push(`  Is Settlement Reconciled? ${s.settlement_status === "Reconciled" ? "YES ✓" : "NO"}`);
    if (s.actual_released_amount != null) {
      lines.push(`  Actual Released: ${fmtSettlementAmount(s.actual_released_amount, s.currency)}`);
    }
    const delta = settlementDelta(s);
    if (delta != null) {
      if (delta === 0) lines.push("  Amount Match: EXACT MATCH ✓");
      else lines.push(`  Amount Delta: ${delta > 0 ? "+" : ""}${fmtSettlementAmount(delta, s.currency)} (${delta > 0 ? "overpayment" : "shortfall"})`);
    }
    if (s.bank_transaction_reference) lines.push(`  Bank Transaction Ref: ${s.bank_transaction_reference}`);
    if (s.payee_bank_name) lines.push(`  Payee Bank: ${s.payee_bank_name}`);
    if (s.released_at) lines.push(`  Released At: ${s.released_at.slice(0, 16).replace("T", " ")} UTC`);
    if (s.reconciled_at) lines.push(`  Reconciled At: ${s.reconciled_at.slice(0, 16).replace("T", " ")} UTC`);
    if (s.reconciliation_note) lines.push(`  Note: ${s.reconciliation_note}`);

    if (isSettlementBlocking(s)) {
      lines.push(`  ⚠ BLOCKING: ${s.settlement_status} — admin must resolve before financial closure.`);
    }
  }

  lines.push("");
  if (blocking.length > 0) {
    lines.push(`What is blocking financial closure? ${blocking.map((s) => s.settlement_status).join(", ")} — admin review required.`);
  } else if (reconciled.length === settlements.length) {
    lines.push("What is blocking financial closure? Nothing — all settlements reconciled. Job is financially closed.");
  } else {
    lines.push(`What is blocking financial closure? ${pending.length + processing.length + released.length} settlement(s) not yet reconciled.`);
  }

  const allReconciled = settlements.length > 0 && settlements.every((s) =>
    s.settlement_status === "Reconciled" || s.settlement_status === "Cancelled"
  );
  lines.push(`Has the job financially closed? ${allReconciled ? "YES — all settlements reconciled." : "NO — pending settlement reconciliation."}`);

  return lines.join("\n");
}
