// ─── Nexum Service Fee / Platform Revenue — shared types and helpers ──────────

// ── Enums ─────────────────────────────────────────────────────────────────────

export type FeeType =
  | "Membership Fee"
  | "Secured Job Fee"
  | "Payment Holding Workflow Fee"
  | "Controlled Release Fee"
  | "Document Intelligence Fee"
  | "Tracking Monitoring Fee"
  | "RFQ / Quotation Fee"
  | "Capital Readiness Fee"
  | "Financing Referral Fee"
  | "Manual Admin Fee"
  | "Other";

export type CalculationMethod =
  | "Fixed Amount"
  | "Percentage of Job Value"
  | "Percentage of Held Amount"
  | "Percentage of Released Amount"
  | "Per Document"
  | "Per Tracking Sync"
  | "Per Job"
  | "Manual";

export type FeeStatus =
  | "Draft"
  | "Calculated"
  | "Approved"
  | "Waived"
  | "Exported"
  | "Collected"
  | "Cancelled";

export type FeeAction = "approve" | "waive" | "cancel" | "mark_exported" | "mark_collected";

// ── Row interfaces ─────────────────────────────────────────────────────────────

export interface FeeRuleRow {
  id:                 string;
  fee_name:           string;
  fee_type:           FeeType;
  calculation_method: CalculationMethod;
  fixed_amount:       number | null;
  percentage_rate:    number | null;
  minimum_fee:        number | null;
  maximum_fee:        number | null;
  currency:           string;
  applies_to_plan:    string | null;
  is_active:          boolean;
  remarks:            string | null;
  created_at:         string;
  updated_at:         string;
}

export interface ServiceFeeRow {
  id:                  string;
  job_reference:       string | null;
  company_id:          string | null;
  fee_rule_id:         string | null;
  fee_type:            string;
  fee_description:     string | null;
  base_amount:         number;
  fee_amount:          number;
  currency:            string;
  fee_status:          FeeStatus;
  invoice_required:    boolean;
  accounting_export_id: string | null;
  approved_by:         string | null;
  approved_at:         string | null;
  waived_reason:       string | null;
  created_at:          string;
  updated_at:          string;
}

// ── Audit action keys ─────────────────────────────────────────────────────────

export const FEE_AUDIT_ACTIONS = {
  rule_created:   "fee_rule_created",
  rule_updated:   "fee_rule_updated",
  calculated:     "nexum_service_fee_calculated",
  approved:       "nexum_service_fee_approved",
  waived:         "nexum_service_fee_waived",
  exported:       "nexum_service_fee_exported",
  cancelled:      "nexum_service_fee_cancelled",
  collected:      "nexum_service_fee_collected",
} as const;

// ── Compliance note ───────────────────────────────────────────────────────────

export const FEE_COMPLIANCE_NOTE =
  "Service fee calculations are for internal platform revenue tracking only. " +
  "Fees are not automatically charged, deducted, or collected. " +
  "No official invoice has been issued. No payment gateway is connected. " +
  "Final fee treatment (billed separately, deducted from settlement, waived, or included in membership) " +
  "is subject to admin approval and agreed commercial terms.";

// ── Badge / colour helpers ────────────────────────────────────────────────────

export function feeStatusBadge(status: FeeStatus): string {
  const map: Record<FeeStatus, string> = {
    Draft:      "bg-slate-700/80 text-slate-300",
    Calculated: "bg-blue-900/60 text-blue-300 border border-blue-700/40",
    Approved:   "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40",
    Waived:     "bg-amber-900/40 text-amber-400 border border-amber-700/30",
    Exported:   "bg-cyan-900/50 text-cyan-300 border border-cyan-700/40",
    Collected:  "bg-purple-900/50 text-purple-300 border border-purple-700/40",
    Cancelled:  "bg-red-900/40 text-red-400 border border-red-700/30",
  };
  return map[status] ?? "bg-slate-700 text-slate-300";
}

export function feeTypeColor(type: string): string {
  const map: Record<string, string> = {
    "Secured Job Fee":              "text-cyan-400",
    "Payment Holding Workflow Fee": "text-blue-400",
    "Controlled Release Fee":       "text-emerald-400",
    "Document Intelligence Fee":    "text-purple-400",
    "Tracking Monitoring Fee":      "text-amber-400",
    "RFQ / Quotation Fee":          "text-orange-400",
    "Capital Readiness Fee":        "text-pink-400",
    "Financing Referral Fee":       "text-teal-400",
    "Membership Fee":               "text-slate-300",
    "Manual Admin Fee":             "text-red-400",
    "Other":                        "text-slate-500",
  };
  return map[type] ?? "text-slate-400";
}

// ── Valid actions by status ───────────────────────────────────────────────────

export const VALID_FEE_ACTIONS_BY_STATUS: Record<FeeStatus, FeeAction[]> = {
  Draft:      ["approve", "waive", "cancel"],
  Calculated: ["approve", "waive", "cancel"],
  Approved:   ["mark_exported", "mark_collected", "waive", "cancel"],
  Waived:     [],
  Exported:   ["mark_collected"],
  Collected:  [],
  Cancelled:  [],
};

// ── Fee type options ──────────────────────────────────────────────────────────

export const FEE_TYPE_OPTIONS: FeeType[] = [
  "Secured Job Fee",
  "Payment Holding Workflow Fee",
  "Controlled Release Fee",
  "Document Intelligence Fee",
  "Tracking Monitoring Fee",
  "RFQ / Quotation Fee",
  "Capital Readiness Fee",
  "Financing Referral Fee",
  "Membership Fee",
  "Manual Admin Fee",
  "Other",
];

export const CALCULATION_METHOD_OPTIONS: CalculationMethod[] = [
  "Fixed Amount",
  "Percentage of Job Value",
  "Percentage of Held Amount",
  "Percentage of Released Amount",
  "Per Document",
  "Per Tracking Sync",
  "Per Job",
  "Manual",
];

export const FEE_STATUS_OPTIONS: FeeStatus[] = [
  "Draft", "Calculated", "Approved", "Waived", "Exported", "Collected", "Cancelled",
];

// ── Formatter ─────────────────────────────────────────────────────────────────

export function fmtFee(amount: number, currency = "RM"): string {
  return `${currency} ${Number(amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
}

// ── Describe calculation method ───────────────────────────────────────────────

export function describeMethod(rule: FeeRuleRow): string {
  switch (rule.calculation_method) {
    case "Fixed Amount":                  return `${rule.currency} ${rule.fixed_amount ?? 0} fixed`;
    case "Percentage of Job Value":       return `${rule.percentage_rate ?? 0}% of job value`;
    case "Percentage of Held Amount":     return `${rule.percentage_rate ?? 0}% of held amount`;
    case "Percentage of Released Amount": return `${rule.percentage_rate ?? 0}% of released amount`;
    case "Per Document":                  return `${rule.currency} ${rule.fixed_amount ?? 0} per document`;
    case "Per Tracking Sync":             return `${rule.currency} ${rule.fixed_amount ?? 0} per sync`;
    case "Per Job":                       return `${rule.currency} ${rule.fixed_amount ?? 0} per job`;
    case "Manual":                        return "Manual (admin sets amount)";
    default:                              return rule.calculation_method;
  }
}
