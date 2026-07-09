// ─── lib/claimReserve.ts — Claims / Recovery Reserve Ledger helpers ──────────
//
// COMPLIANCE NOTE:
//   All outputs are internal workflow records only.
//   No funds are auto-deducted. All reserves require admin approval.
//   This is not a legal determination or binding financial obligation.
//   All positions are preliminary and require admin, legal, and insurance review.

// ── Status / type enums ────────────────────────────────────────────────────────

export type ReserveType =
  | "Cargo Damage"
  | "Short Delivery"
  | "Late Delivery"
  | "POD Dispute"
  | "Payment Dispute"
  | "Insurance Deductible"
  | "Potential Refund"
  | "Other";

export type ReserveStatus =
  | "Draft"
  | "Active"
  | "Adjusted"
  | "Released"
  | "Applied"
  | "Cancelled";

// ── DB row shape ───────────────────────────────────────────────────────────────

export interface ClaimReserveRow {
  id:                     string;
  job_reference:          string;
  dispute_case_id:        string | null;
  liability_review_id:    string | null;
  held_payment_id:        string | null;
  release_instruction_id: string | null;
  reserve_type:           ReserveType | null;
  reserve_status:         ReserveStatus;
  reserve_amount:         number;
  currency:               string;
  reason:                 string | null;
  created_by:             string | null;
  approved_by:            string | null;
  approved_at:            string | null;
  applied_amount:         number | null;
  released_amount:        number | null;
  resolution_note:        string | null;
  created_at:             string;
  updated_at:             string;
}

// ── Active reserve helpers ────────────────────────────────────────────────────

/** Statuses that count against available release amount */
export const BLOCKING_RESERVE_STATUSES: ReserveStatus[] = ["Active", "Adjusted"];

/** True if this reserve blocks payment release */
export function isReserveBlocking(reserve: ClaimReserveRow): boolean {
  return BLOCKING_RESERVE_STATUSES.includes(reserve.reserve_status);
}

/** Sum of all active reserve amounts for a job */
export function totalActiveReserve(reserves: ClaimReserveRow[]): number {
  return reserves
    .filter(isReserveBlocking)
    .reduce((s, r) => s + Number(r.reserve_amount), 0);
}

/** Available release amount = held amount - active reserves */
export function availableReleaseAmount(heldAmount: number, reserves: ClaimReserveRow[]): number {
  return Math.max(0, heldAmount - totalActiveReserve(reserves));
}

/** True if any active reserve exceeds available release amount */
export function isReleaseReducedByReserve(heldAmount: number, reserves: ClaimReserveRow[]): boolean {
  return totalActiveReserve(reserves) > 0 && totalActiveReserve(reserves) <= heldAmount;
}

/** True if active reserves exceed held amount — would block full release */
export function isReleaseBlockedByReserve(heldAmount: number, reserves: ClaimReserveRow[]): boolean {
  return totalActiveReserve(reserves) >= heldAmount;
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function reserveStatusBadge(status: ReserveStatus): string {
  const map: Record<ReserveStatus, string> = {
    "Draft":     "border-slate-700 bg-slate-800/50 text-slate-400",
    "Active":    "border-amber-500/30 bg-amber-500/10 text-amber-400",
    "Adjusted":  "border-blue-500/30 bg-blue-500/10 text-blue-400",
    "Released":  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    "Applied":   "border-purple-500/30 bg-purple-500/10 text-purple-400",
    "Cancelled": "border-slate-700 bg-slate-800/50 text-slate-500",
  };
  return map[status] ?? "border-slate-700 bg-slate-800/50 text-slate-400";
}

export function reserveStatusColor(status: ReserveStatus): string {
  const map: Record<ReserveStatus, string> = {
    "Draft":     "text-slate-400",
    "Active":    "text-amber-400",
    "Adjusted":  "text-blue-400",
    "Released":  "text-emerald-400",
    "Applied":   "text-purple-400",
    "Cancelled": "text-slate-500",
  };
  return map[status] ?? "text-slate-400";
}

export function reserveTypeIcon(type: ReserveType | null | undefined): string {
  const map: Record<ReserveType, string> = {
    "Cargo Damage":         "📦",
    "Short Delivery":       "⚖",
    "Late Delivery":        "⏰",
    "POD Dispute":          "📋",
    "Payment Dispute":      "⚠",
    "Insurance Deductible": "🛡",
    "Potential Refund":     "↩",
    "Other":                "•",
  };
  if (!type) return "•";
  return map[type] ?? "•";
}

export function fmtReserveAmount(v: number | null | undefined, currency = "RM"): string {
  if (v == null) return "—";
  return `${currency} ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Audit actions ──────────────────────────────────────────────────────────────

export const CR_AUDIT_ACTIONS = {
  created:             "claim_reserve_created",
  approved:            "claim_reserve_approved",
  adjusted:            "claim_reserve_adjusted",
  applied:             "claim_reserve_applied",
  released:            "claim_reserve_released",
  cancelled:           "claim_reserve_cancelled",
  release_reduced:     "release_reduced_by_claim_reserve",
} as const;

// ── Status option lists ────────────────────────────────────────────────────────

export const RESERVE_TYPE_OPTIONS: ReserveType[] = [
  "Cargo Damage",
  "Short Delivery",
  "Late Delivery",
  "POD Dispute",
  "Payment Dispute",
  "Insurance Deductible",
  "Potential Refund",
  "Other",
];

export const RESERVE_STATUS_OPTIONS: ReserveStatus[] = [
  "Draft",
  "Active",
  "Adjusted",
  "Released",
  "Applied",
  "Cancelled",
];

// ── Admin actions that are valid per status ────────────────────────────────────

export type ReserveAction = "approve" | "adjust" | "apply" | "release" | "cancel";

export const VALID_ACTIONS_BY_STATUS: Record<ReserveStatus, ReserveAction[]> = {
  "Draft":     ["approve", "cancel"],
  "Active":    ["adjust", "apply", "release", "cancel"],
  "Adjusted":  ["apply", "release", "cancel"],
  "Released":  [],
  "Applied":   [],
  "Cancelled": [],
};

// ── Compliance label ───────────────────────────────────────────────────────────

export const RESERVE_COMPLIANCE_NOTE =
  "Reserve recorded for payment-control workflow. No funds auto-deducted. Release subject to review. All positions are preliminary and require admin, legal, and insurance review before any determination.";
