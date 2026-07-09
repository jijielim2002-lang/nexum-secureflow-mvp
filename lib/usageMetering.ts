// ─── Usage Metering / Overage Billing — shared types and helpers ──────────────

// ── Enums ─────────────────────────────────────────────────────────────────────

export type UsageType =
  | "Secured Job"
  | "Document Extraction"
  | "Tracking Check"
  | "RFQ"
  | "Quotation"
  | "Capital Readiness Assessment"
  | "Financing Simulation"
  | "Credit Pack"
  | "Communication"
  | "Other";

export type MeteringStatus =
  | "Recorded"
  | "Calculated"
  | "Approved"
  | "Waived"
  | "Exported"
  | "Cancelled";

export type SummaryStatus =
  | "Draft"
  | "Generated"
  | "Approved"
  | "Waived"
  | "Exported"
  | "Cancelled";

export type SummaryAction = "approve" | "waive" | "cancel" | "export";

// ── Row interfaces ─────────────────────────────────────────────────────────────

export interface UsageMeteringRow {
  id:                 string;
  company_id:         string | null;
  membership_id:      string | null;
  plan_id:            string | null;
  usage_type:         UsageType;
  usage_reference:    string | null;
  quantity:           number;
  included_quantity:  number;
  overage_quantity:   number;
  unit_rate:          number;
  overage_amount:     number;
  currency:           string;
  usage_period_start: string | null;
  usage_period_end:   string | null;
  status:             MeteringStatus;
  created_at:         string;
  updated_at:         string;
}

export interface OverageBillingSummaryRow {
  id:                           string;
  company_id:                   string | null;
  membership_id:                string | null;
  plan_id:                      string | null;
  billing_period_start:         string;
  billing_period_end:           string;
  total_secured_jobs:           number;
  total_document_extractions:   number;
  total_tracking_checks:        number;
  total_rfqs:                   number;
  total_quotations:             number;
  overage_secured_jobs:         number;
  overage_document_extractions: number;
  overage_tracking_checks:      number;
  overage_rfqs:                 number;
  overage_quotations:           number;
  total_overage_amount:         number;
  currency:                     string;
  summary_status:               SummaryStatus;
  service_fee_id:               string | null;
  generated_by:                 string | null;
  generated_at:                 string | null;
  approved_by:                  string | null;
  approved_at:                  string | null;
  created_at:                   string;
  updated_at:                   string;
}

// ── Audit actions ─────────────────────────────────────────────────────────────

export const USAGE_AUDIT_ACTIONS = {
  recorded:            "usage_recorded",
  overage_calculated:  "usage_overage_calculated",
  summary_generated:   "overage_summary_generated",
  summary_approved:    "overage_summary_approved",
  summary_waived:      "overage_summary_waived",
  exported:            "overage_exported",
} as const;

// ── Valid actions by summary status ──────────────────────────────────────────

export const VALID_SUMMARY_ACTIONS_BY_STATUS: Record<SummaryStatus, SummaryAction[]> = {
  Draft:     ["approve", "waive", "cancel"],
  Generated: ["approve", "waive", "cancel"],
  Approved:  ["export", "waive"],
  Waived:    [],
  Exported:  [],
  Cancelled: [],
};

// ── Usage type → quota field mapping ─────────────────────────────────────────

export const USAGE_TYPE_TO_QUOTA_FIELD: Partial<Record<UsageType, string>> = {
  "Secured Job":           "included_secured_jobs",
  "Document Extraction":   "included_document_extractions",
  "Tracking Check":        "included_tracking_checks",
  "RFQ":                   "included_rfqs",
  "Quotation":             "included_quotations",
};

export const USAGE_TYPE_TO_COUNT_FIELD: Partial<Record<UsageType, keyof OverageBillingSummaryRow>> = {
  "Secured Job":         "total_secured_jobs",
  "Document Extraction": "total_document_extractions",
  "Tracking Check":      "total_tracking_checks",
  "RFQ":                 "total_rfqs",
  "Quotation":           "total_quotations",
};

// ── Overage rate helpers ──────────────────────────────────────────────────────

// Overage rates (per unit above included quota, can be configured per plan)
// Default fallback rates when plan doesn't specify
export const DEFAULT_OVERAGE_RATES: Partial<Record<UsageType, number>> = {
  "Secured Job":         150,  // RM per job over quota
  "Document Extraction": 10,   // RM per extraction over quota
  "Tracking Check":      30,   // RM per check over quota
  "RFQ":                 20,   // RM per RFQ over quota
  "Quotation":           20,   // RM per quotation over quota
};

// ── Compliance note ───────────────────────────────────────────────────────────

export const USAGE_COMPLIANCE_NOTE =
  "Usage metering records are for internal tracking and overage calculation only. " +
  "No invoice is issued automatically. No payment gateway is connected. " +
  "Overage amounts require admin approval before any billing action. " +
  "Final commercial treatment is subject to agreed terms.";

// ── Status badge ──────────────────────────────────────────────────────────────

export function meteringStatusBadge(status: MeteringStatus): string {
  const map: Record<MeteringStatus, string> = {
    Recorded:   "bg-slate-700/60 text-slate-400 border border-slate-600",
    Calculated: "bg-blue-900/60 text-blue-300 border border-blue-700/40",
    Approved:   "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40",
    Waived:     "bg-amber-900/40 text-amber-400 border border-amber-700/30",
    Exported:   "bg-cyan-900/50 text-cyan-300 border border-cyan-700/40",
    Cancelled:  "bg-red-900/40 text-red-400 border border-red-700/30",
  };
  return map[status] ?? "bg-slate-700 text-slate-300";
}

export function summaryStatusBadge(status: SummaryStatus): string {
  const map: Record<SummaryStatus, string> = {
    Draft:     "bg-slate-700/60 text-slate-400 border border-slate-600",
    Generated: "bg-blue-900/60 text-blue-300 border border-blue-700/40",
    Approved:  "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40",
    Waived:    "bg-amber-900/40 text-amber-400 border border-amber-700/30",
    Exported:  "bg-cyan-900/50 text-cyan-300 border border-cyan-700/40",
    Cancelled: "bg-red-900/40 text-red-400 border border-red-700/30",
  };
  return map[status] ?? "bg-slate-700 text-slate-300";
}

export function usageTypeColor(type: UsageType): string {
  const map: Partial<Record<UsageType, string>> = {
    "Secured Job":                    "text-cyan-400",
    "Document Extraction":            "text-purple-400",
    "Tracking Check":                 "text-amber-400",
    "RFQ":                            "text-orange-400",
    "Quotation":                      "text-blue-400",
    "Capital Readiness Assessment":   "text-pink-400",
    "Financing Simulation":           "text-teal-400",
    "Credit Pack":                    "text-emerald-400",
    "Communication":                  "text-slate-400",
    "Other":                          "text-slate-500",
  };
  return map[type] ?? "text-slate-400";
}

// ── Formatter ─────────────────────────────────────────────────────────────────

export function fmtUsage(amount: number, currency = "RM"): string {
  return `${currency} ${Number(amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
}

// ── All usage types ───────────────────────────────────────────────────────────

export const USAGE_TYPE_OPTIONS: UsageType[] = [
  "Secured Job",
  "Document Extraction",
  "Tracking Check",
  "RFQ",
  "Quotation",
  "Capital Readiness Assessment",
  "Financing Simulation",
  "Credit Pack",
  "Communication",
  "Other",
];

export const METERING_STATUS_OPTIONS: MeteringStatus[] = [
  "Recorded", "Calculated", "Approved", "Waived", "Exported", "Cancelled",
];

export const SUMMARY_STATUS_OPTIONS: SummaryStatus[] = [
  "Draft", "Generated", "Approved", "Waived", "Exported", "Cancelled",
];
