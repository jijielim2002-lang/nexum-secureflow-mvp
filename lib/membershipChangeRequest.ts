// ─── Membership Change Request — shared types, helpers, and workflow logic ─────

// ── Enums ─────────────────────────────────────────────────────────────────────

export type RequestType =
  | "Upgrade"
  | "Downgrade"
  | "Renewal"
  | "Trial Conversion"
  | "Custom Plan"
  | "Cancellation"
  | "Other";

export type RequestStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Approved"
  | "Rejected"
  | "Applied"
  | "Cancelled";

export type RequestAction =
  | "submit"
  | "review"
  | "approve"
  | "reject"
  | "apply"
  | "cancel";

// ── Row interface ──────────────────────────────────────────────────────────────

export interface MembershipChangeRequestRow {
  id:                    string;
  provider_company_id:   string | null;
  current_membership_id: string | null;
  current_plan_id:       string | null;
  requested_plan_id:     string | null;
  request_type:          RequestType;
  request_status:        RequestStatus;
  reason:                string | null;
  usage_summary:         Record<string, number> | null;
  commercial_note:       string | null;
  effective_date:        string | null;
  approved_by:           string | null;
  approved_at:           string | null;
  applied_at:            string | null;
  created_at:            string;
  updated_at:            string;
}

// ── Valid actions by status ───────────────────────────────────────────────────

export const VALID_ACTIONS_BY_STATUS: Record<RequestStatus, RequestAction[]> = {
  Draft:         ["submit", "cancel"],
  Submitted:     ["review", "approve", "reject", "cancel"],
  "Under Review":["approve", "reject", "cancel"],
  Approved:      ["apply", "cancel"],
  Rejected:      [],
  Applied:       [],
  Cancelled:     [],
};

// ── Audit action keys ─────────────────────────────────────────────────────────

export const MCR_AUDIT_ACTIONS = {
  upgrade_recommended:          "membership_upgrade_recommended",
  request_created:              "membership_change_request_created",
  request_approved:             "membership_change_request_approved",
  request_rejected:             "membership_change_request_rejected",
  change_applied:               "membership_change_applied",
  renewal_reminder_created:     "membership_renewal_reminder_created",
  trial_conversion_recommended: "trial_conversion_recommended",
} as const;

// ── Compliance note ───────────────────────────────────────────────────────────

export const MCR_COMPLIANCE_NOTE =
  "Membership change requests are for commercial workflow management only. " +
  "No payment gateway is connected and no official invoice is issued through this platform. " +
  "All changes are subject to admin review and approval before being applied.";

// ── Status badge ──────────────────────────────────────────────────────────────

export function requestStatusBadge(status: RequestStatus): string {
  const map: Record<RequestStatus, string> = {
    Draft:         "bg-slate-700/60 text-slate-400 border border-slate-600",
    Submitted:     "bg-blue-900/60 text-blue-300 border border-blue-700/40",
    "Under Review":"bg-amber-900/40 text-amber-400 border border-amber-700/30",
    Approved:      "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40",
    Rejected:      "bg-red-900/40 text-red-400 border border-red-700/30",
    Applied:       "bg-cyan-900/50 text-cyan-300 border border-cyan-700/40",
    Cancelled:     "bg-slate-800/60 text-slate-600 border border-slate-700",
  };
  return map[status] ?? "bg-slate-700 text-slate-300";
}

// ── Request type colour ───────────────────────────────────────────────────────

export function requestTypeColor(type: RequestType): string {
  const map: Record<RequestType, string> = {
    Upgrade:            "text-cyan-400",
    Downgrade:          "text-amber-400",
    Renewal:            "text-emerald-400",
    "Trial Conversion": "text-purple-400",
    "Custom Plan":      "text-blue-400",
    Cancellation:       "text-red-400",
    Other:              "text-slate-400",
  };
  return map[type] ?? "text-slate-400";
}

// ── Request type icon ─────────────────────────────────────────────────────────

export function requestTypeIcon(type: RequestType): string {
  const map: Record<RequestType, string> = {
    Upgrade:            "⬆",
    Downgrade:          "⬇",
    Renewal:            "🔄",
    "Trial Conversion": "🎯",
    "Custom Plan":      "⚙️",
    Cancellation:       "✕",
    Other:              "•",
  };
  return map[type] ?? "•";
}

// ── Expiry helpers ────────────────────────────────────────────────────────────

export function daysUntilExpiry(endDate: string | null): number | null {
  if (!endDate) return null;
  const end  = new Date(endDate);
  const now  = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function isNearExpiry(endDate: string | null, thresholdDays = 30): boolean {
  const days = daysUntilExpiry(endDate);
  return days !== null && days >= 0 && days <= thresholdDays;
}

export function isExpired(endDate: string | null): boolean {
  const days = daysUntilExpiry(endDate);
  return days !== null && days < 0;
}

// ── Overage vs upgrade cost comparison ───────────────────────────────────────

export interface UpgradeCostComparison {
  currentOverageMonthly:  number;
  currentPlanAnnualFee:   number;
  targetPlanAnnualFee:    number;
  upgradeDelta:           number;  // targetPlanAnnualFee - currentPlanAnnualFee
  monthlyDelta:           number;  // upgradeDelta / 12
  overageExceedsUpgrade:  boolean;
  breakEvenMonths:        number | null;
  recommendation:         string;
}

export function compareOverageVsUpgrade(
  currentOverageMonthly: number,
  currentPlanAnnualFee: number,
  targetPlanAnnualFee: number,
): UpgradeCostComparison {
  const upgradeDelta  = targetPlanAnnualFee - currentPlanAnnualFee;
  const monthlyDelta  = upgradeDelta / 12;
  const overageExceedsUpgrade = currentOverageMonthly > monthlyDelta;
  const breakEvenMonths = monthlyDelta > 0 && currentOverageMonthly > 0
    ? Math.ceil(monthlyDelta / currentOverageMonthly)
    : null;

  let recommendation = "";
  if (overageExceedsUpgrade) {
    recommendation = `Upgrading saves RM ${(currentOverageMonthly - monthlyDelta).toFixed(2)}/month vs continuing overage at this rate.`;
  } else if (monthlyDelta > 0) {
    recommendation = `Upgrade costs RM ${monthlyDelta.toFixed(2)}/month more than your current plan. Overage is currently below this threshold.`;
  } else {
    recommendation = "No cost difference between current and target plan.";
  }

  return {
    currentOverageMonthly,
    currentPlanAnnualFee,
    targetPlanAnnualFee,
    upgradeDelta,
    monthlyDelta,
    overageExceedsUpgrade,
    breakEvenMonths,
    recommendation,
  };
}

// ── Request type options ──────────────────────────────────────────────────────

export const REQUEST_TYPE_OPTIONS: RequestType[] = [
  "Upgrade", "Downgrade", "Renewal", "Trial Conversion",
  "Custom Plan", "Cancellation", "Other",
];

export const REQUEST_STATUS_OPTIONS: RequestStatus[] = [
  "Draft", "Submitted", "Under Review", "Approved",
  "Rejected", "Applied", "Cancelled",
];
