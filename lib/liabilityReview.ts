// ─── lib/liabilityReview.ts — Liability Review helpers ──────────────────────
//
// COMPLIANCE NOTE:
//   All outputs are preliminary evidence-collection and review support only.
//   Nexum does not make legal liability determinations, provide insurance advice,
//   or connect to any insurer API. All positions require admin/legal/insurance review.

// ── Status / type enums ────────────────────────────────────────────────────────

export type LiabilityReviewStatus =
  | "Not Required"
  | "Pending Review"
  | "Under Review"
  | "Evidence Requested"
  | "Insurance Review"
  | "Liability Unclear"
  | "Provider Potentially Liable"
  | "Customer Potentially Liable"
  | "Third Party / Carrier Potentially Liable"
  | "No Liability Identified"
  | "Resolved"
  | "Closed";

export type IncidentType =
  | "Cargo Damage"
  | "Cargo Loss"
  | "Short Delivery"
  | "Late Delivery"
  | "POD Mismatch"
  | "Wrong Cargo"
  | "Temperature Excursion"
  | "Customs Hold"
  | "Other";

export type InsuranceClaimStatus =
  | "Not Applicable"
  | "Not Submitted"
  | "Pending Submission"
  | "Submitted"
  | "Under Review"
  | "Approved"
  | "Rejected"
  | "Paid"
  | "Closed";

export type EvidenceType =
  | "POD"
  | "Photo"
  | "Damage Report"
  | "Inspection Report"
  | "Temperature Log"
  | "Delivery Note"
  | "Insurance Policy"
  | "Carrier Report"
  | "Customer Statement"
  | "Provider Statement"
  | "Other";

// ── DB row shapes ──────────────────────────────────────────────────────────────

export interface LiabilityReviewRow {
  id:                        string;
  job_reference:             string;
  dispute_case_id:           string | null;
  exception_id:              string | null;
  customer_company_id:       string | null;
  provider_company_id:       string | null;
  liability_review_status:   LiabilityReviewStatus;
  incident_type:             IncidentType | null;
  claimed_amount:            number | null;
  currency:                  string;
  cargo_value:               number | null;
  liability_limit_note:      string | null;
  insurance_available:       boolean | null;
  insurance_policy_reference: string | null;
  insurance_claim_status:    InsuranceClaimStatus;
  evidence_summary:          string | null;
  admin_review_note:         string | null;
  preliminary_position:      string | null;
  resolution_note:           string | null;
  reviewed_by:               string | null;
  reviewed_at:               string | null;
  resolved_at:               string | null;
  created_at:                string;
  updated_at:                string;
}

export interface LiabilityEvidenceRow {
  id:                  string;
  liability_review_id: string;
  job_reference:       string;
  document_id:         string | null;
  evidence_type:       EvidenceType | null;
  uploaded_by_role:    string | null;
  uploaded_by_user_id: string | null;
  remarks:             string | null;
  created_at:          string;
}

// ── Status that blocks payment release ────────────────────────────────────────

export const RELEASE_BLOCKING_STATUSES: LiabilityReviewStatus[] = [
  "Pending Review",
  "Under Review",
  "Evidence Requested",
  "Insurance Review",
];

export function isReleaseBlocked(status: LiabilityReviewStatus | null | undefined): boolean {
  if (!status) return false;
  return RELEASE_BLOCKING_STATUSES.includes(status);
}

// ── Statuses that indicate active / unresolved review ─────────────────────────

export const ACTIVE_STATUSES: LiabilityReviewStatus[] = [
  "Pending Review",
  "Under Review",
  "Evidence Requested",
  "Insurance Review",
  "Liability Unclear",
];

export function isActiveReview(status: LiabilityReviewStatus | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_STATUSES.includes(status);
}

// ── Dispute types that should trigger a liability review suggestion ────────────

export const DISPUTE_TYPES_REQUIRING_LR = [
  "Cargo Damage",
  "Short Delivery",
  "POD Mismatch",
  "Delivery Not Received",
  "Late Delivery",
  "Wrong Cargo",
  "Temperature Excursion",
];

export const EXCEPTION_TYPES_REQUIRING_LR = [
  "Cargo Issue",
  "Customer Dispute",
  "Provider Delay",
];

// ── Dispute type → incident type mapping ──────────────────────────────────────

export const DISPUTE_TO_INCIDENT_MAP: Record<string, IncidentType> = {
  "Cargo Damage":         "Cargo Damage",
  "Short Delivery":       "Short Delivery",
  "POD Mismatch":         "POD Mismatch",
  "Delivery Not Received": "Cargo Loss",
  "Late Delivery":        "Late Delivery",
  "Wrong Cargo":          "Wrong Cargo",
  "Temperature Excursion": "Temperature Excursion",
};

// ── Display helpers ────────────────────────────────────────────────────────────

export function lrStatusColor(status: LiabilityReviewStatus): string {
  const map: Record<LiabilityReviewStatus, string> = {
    "Not Required":                          "text-slate-500",
    "Pending Review":                        "text-amber-400",
    "Under Review":                          "text-blue-400",
    "Evidence Requested":                    "text-orange-400",
    "Insurance Review":                      "text-purple-400",
    "Liability Unclear":                     "text-amber-400",
    "Provider Potentially Liable":           "text-red-400",
    "Customer Potentially Liable":           "text-orange-400",
    "Third Party / Carrier Potentially Liable": "text-yellow-400",
    "No Liability Identified":               "text-emerald-400",
    "Resolved":                              "text-emerald-400",
    "Closed":                                "text-slate-400",
  };
  return map[status] ?? "text-slate-400";
}

export function lrStatusBadge(status: LiabilityReviewStatus): string {
  const map: Record<LiabilityReviewStatus, string> = {
    "Not Required":                          "border-slate-700 bg-slate-800/50 text-slate-500",
    "Pending Review":                        "border-amber-500/30 bg-amber-500/10 text-amber-400",
    "Under Review":                          "border-blue-500/30 bg-blue-500/10 text-blue-400",
    "Evidence Requested":                    "border-orange-500/30 bg-orange-500/10 text-orange-400",
    "Insurance Review":                      "border-purple-500/30 bg-purple-500/10 text-purple-400",
    "Liability Unclear":                     "border-amber-500/30 bg-amber-500/10 text-amber-400",
    "Provider Potentially Liable":           "border-red-500/30 bg-red-500/10 text-red-400",
    "Customer Potentially Liable":           "border-orange-500/30 bg-orange-500/10 text-orange-400",
    "Third Party / Carrier Potentially Liable": "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
    "No Liability Identified":               "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    "Resolved":                              "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    "Closed":                                "border-slate-700 bg-slate-800/50 text-slate-400",
  };
  return map[status] ?? "border-slate-700 bg-slate-800/50 text-slate-400";
}

export function insuranceStatusColor(status: InsuranceClaimStatus): string {
  const map: Record<InsuranceClaimStatus, string> = {
    "Not Applicable":    "text-slate-500",
    "Not Submitted":     "text-slate-400",
    "Pending Submission":"text-amber-400",
    "Submitted":         "text-blue-400",
    "Under Review":      "text-blue-400",
    "Approved":          "text-emerald-400",
    "Rejected":          "text-red-400",
    "Paid":              "text-emerald-400",
    "Closed":            "text-slate-400",
  };
  return map[status] ?? "text-slate-400";
}

export function incidentTypeIcon(type: IncidentType | null | undefined): string {
  const map: Record<IncidentType, string> = {
    "Cargo Damage":        "📦",
    "Cargo Loss":          "❌",
    "Short Delivery":      "⚖",
    "Late Delivery":       "⏰",
    "POD Mismatch":        "📋",
    "Wrong Cargo":         "🔄",
    "Temperature Excursion": "🌡",
    "Customs Hold":        "🔒",
    "Other":               "•",
  };
  if (!type) return "•";
  return map[type] ?? "•";
}

export function fmtLrAmount(v: number | null | undefined, currency = "RM"): string {
  if (v == null) return "—";
  return `${currency} ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Audit actions ──────────────────────────────────────────────────────────────

export const LR_AUDIT_ACTIONS = {
  created:                  "liability_review_created",
  evidence_uploaded:        "liability_evidence_uploaded",
  status_updated:           "liability_review_status_updated",
  insurance_status_updated: "insurance_claim_status_updated",
  resolved:                 "liability_review_resolved",
  release_blocked:          "release_blocked_by_liability_review",
} as const;

// ── Status options ─────────────────────────────────────────────────────────────

export const LR_STATUS_OPTIONS: LiabilityReviewStatus[] = [
  "Not Required",
  "Pending Review",
  "Under Review",
  "Evidence Requested",
  "Insurance Review",
  "Liability Unclear",
  "Provider Potentially Liable",
  "Customer Potentially Liable",
  "Third Party / Carrier Potentially Liable",
  "No Liability Identified",
  "Resolved",
  "Closed",
];

export const INCIDENT_TYPE_OPTIONS: IncidentType[] = [
  "Cargo Damage",
  "Cargo Loss",
  "Short Delivery",
  "Late Delivery",
  "POD Mismatch",
  "Wrong Cargo",
  "Temperature Excursion",
  "Customs Hold",
  "Other",
];

export const INSURANCE_STATUS_OPTIONS: InsuranceClaimStatus[] = [
  "Not Applicable",
  "Not Submitted",
  "Pending Submission",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Paid",
  "Closed",
];

export const EVIDENCE_TYPE_OPTIONS: EvidenceType[] = [
  "POD",
  "Photo",
  "Damage Report",
  "Inspection Report",
  "Temperature Log",
  "Delivery Note",
  "Insurance Policy",
  "Carrier Report",
  "Customer Statement",
  "Provider Statement",
  "Other",
];
