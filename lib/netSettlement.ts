// ─── Net Settlement Statement — shared types, helpers, constants ──────────────
// Settlement calculation and statement display only.
// No accounting integration. No auto-disbursement.

// ── Status & line-type enums ──────────────────────────────────────────────────

export type SettlementStatus =
  | "Draft"
  | "Generated"
  | "Under Review"
  | "Approved"
  | "Finalized"
  | "Disputed"
  | "Cancelled";

export type LineItemType =
  | "Job Value"
  | "Deposit"
  | "Balance"
  | "Full Payment"
  | "Additional Charge"
  | "Claim Reserve"
  | "Claim Applied"
  | "Refund"
  | "Release"
  | "Adjustment"
  | "Other";

// ── Row interfaces ────────────────────────────────────────────────────────────

export interface NetSettlementStatement {
  id:                       string;
  job_reference:            string;
  customer_company_id:      string | null;
  provider_company_id:      string | null;
  statement_status:         SettlementStatus;
  currency:                 string;
  gross_job_value:          number;
  total_payment_obligations: number;
  total_held_amount:        number;
  total_verified_payments:  number;
  total_additional_charges: number;
  total_claim_reserves:     number;
  total_claim_applied:      number;
  total_refunds:            number;
  net_release_eligible:     number;
  total_released:           number;
  outstanding_amount:       number;
  calculation_snapshot:     Record<string, unknown> | null;
  generated_by:             string | null;
  generated_at:             string | null;
  approved_by:              string | null;
  approved_at:              string | null;
  finalized_at:             string | null;
  created_at:               string;
  updated_at:               string;
}

export interface NetSettlementLineItem {
  id:           string;
  statement_id: string;
  job_reference: string;
  line_type:    LineItemType | null;
  description:  string | null;
  amount:       number;
  currency:     string;
  source_table: string | null;
  source_id:    string | null;
  created_at:   string;
}

// ── State machine ─────────────────────────────────────────────────────────────

export type SettlementAction =
  | "approve"
  | "regenerate"
  | "dispute"
  | "cancel"
  | "finalize";

export const VALID_ACTIONS_BY_STATUS: Record<SettlementStatus, SettlementAction[]> = {
  "Draft":       [],
  "Generated":   ["approve", "regenerate", "dispute", "cancel"],
  "Under Review":["approve", "dispute", "cancel"],
  "Approved":    ["finalize", "dispute"],
  "Finalized":   [],
  "Disputed":    ["approve", "cancel"],
  "Cancelled":   [],
};

// ── Release blocking ──────────────────────────────────────────────────────────

/** Statuses that block release unless admin explicitly overrides */
export const RELEASE_BLOCKING_SETTLEMENT_STATUSES: SettlementStatus[] = ["Disputed"];

export function isSettlementBlockingRelease(status: SettlementStatus): boolean {
  return RELEASE_BLOCKING_SETTLEMENT_STATUSES.includes(status);
}

// ── Verified holding statuses (for calculation) ───────────────────────────────

export const VERIFIED_HOLDING_STATUSES = [
  "Payment Secured",
  "Release Eligible",
  "Release Approved",
  "Release Instructed",
  "Released",
] as const;

// ── UI helpers ────────────────────────────────────────────────────────────────

export function settlementStatusBadge(status: SettlementStatus): string {
  const map: Record<SettlementStatus, string> = {
    "Draft":        "bg-slate-700/50 text-slate-400 border-slate-700",
    "Generated":    "bg-blue-500/15 text-blue-400 border-blue-500/30",
    "Under Review": "bg-amber-500/15 text-amber-400 border-amber-500/30",
    "Approved":     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    "Finalized":    "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
    "Disputed":     "bg-red-500/15 text-red-400 border-red-500/30",
    "Cancelled":    "bg-slate-700/30 text-slate-600 border-slate-700/30",
  };
  return map[status] ?? "bg-slate-700/30 text-slate-500 border-slate-700/30";
}

export function settlementStatusIcon(status: SettlementStatus): string {
  const map: Record<SettlementStatus, string> = {
    "Draft":        "◆",
    "Generated":    "◉",
    "Under Review": "⚡",
    "Approved":     "✓",
    "Finalized":    "✦",
    "Disputed":     "⚠",
    "Cancelled":    "✕",
  };
  return map[status] ?? "◆";
}

export function lineTypeColor(type: LineItemType | null): string {
  if (!type) return "text-slate-400";
  const map: Record<LineItemType, string> = {
    "Job Value":       "text-slate-300",
    "Deposit":         "text-emerald-400",
    "Balance":         "text-emerald-400",
    "Full Payment":    "text-emerald-400",
    "Additional Charge": "text-amber-400",
    "Claim Reserve":   "text-red-400",
    "Claim Applied":   "text-orange-400",
    "Refund":          "text-purple-400",
    "Release":         "text-blue-400",
    "Adjustment":      "text-amber-400",
    "Other":           "text-slate-400",
  };
  return map[type] ?? "text-slate-400";
}

export function isDeductionLine(type: LineItemType | null): boolean {
  return type === "Claim Reserve" || type === "Claim Applied" || type === "Refund";
}

// ── Format helper ─────────────────────────────────────────────────────────────

export function fmtSettlement(n: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

// ── Audit action constants ─────────────────────────────────────────────────────

export const NS_AUDIT_ACTIONS = {
  generated:   "net_settlement_statement_generated",
  regenerated: "net_settlement_statement_regenerated",
  approved:    "net_settlement_statement_approved",
  finalized:   "net_settlement_statement_finalized",
  disputed:    "net_settlement_statement_disputed",
  cancelled:   "net_settlement_statement_cancelled",
} as const;

// ── Compliance note ───────────────────────────────────────────────────────────

export const SETTLEMENT_COMPLIANCE_NOTE =
  "Net settlement statement for operational reference only. " +
  "Release eligible amount is subject to admin approval and agreed workflow. " +
  "This statement does not constitute a legal settlement, invoice, or financial guarantee. " +
  "No funds are automatically disbursed. Recorded reserves are potential claim amounts pending resolution.";

// ── Status display labels ─────────────────────────────────────────────────────

export const SETTLEMENT_STATUS_OPTIONS: SettlementStatus[] = [
  "Draft",
  "Generated",
  "Under Review",
  "Approved",
  "Finalized",
  "Disputed",
  "Cancelled",
];
