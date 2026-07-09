// ─── Types ────────────────────────────────────────────────────────────────────

export type DisputeType =
  | "Delivery Not Received"
  | "Cargo Damage"
  | "Short Delivery"
  | "Wrong Cargo"
  | "Late Delivery"
  | "POD Mismatch"
  | "Payment Dispute"
  | "Document Dispute"
  | "Other";

export type DisputeStatus =
  | "Open"
  | "Under Review"
  | "Evidence Requested"
  | "Provider Responded"
  | "Customer Responded"
  | "Resolved"
  | "Rejected"
  | "Closed";

export type DisputeSeverity = "Low" | "Medium" | "High" | "Critical";

export type ResolutionType =
  | "No Claim"
  | "Partial Claim"
  | "Full Claim"
  | "Replacement"
  | "Discount"
  | "Payment Hold"
  | "Other";

export interface DisputeCase {
  id:                        string;
  job_reference:             string;
  dispute_type:              DisputeType | null;
  raised_by_role:            string | null;
  raised_by_user_id:         string | null;
  raised_by_company_id:      string | null;
  against_company_id:        string | null;
  status:                    DisputeStatus;
  severity:                  DisputeSeverity;
  claim_amount:              number | null;
  currency:                  string;
  dispute_reason:            string | null;
  customer_evidence_summary: string | null;
  provider_response:         string | null;
  admin_review_note:         string | null;
  resolution_type:           ResolutionType | null;
  resolution_amount:         number | null;
  resolved_at:               string | null;
  resolved_by:               string | null;
  created_at:                string;
  updated_at:                string;
}

export interface DisputeEvidence {
  id:                  string;
  dispute_id:          string;
  job_reference:       string;
  document_id:         string | null;
  evidence_type:       string | null;
  uploaded_by_role:    string | null;
  uploaded_by_user_id: string | null;
  remarks:             string | null;
  created_at:          string;
  // joined from documents table
  documents?: {
    file_name:     string;
    document_type: string;
    storage_path:  string | null;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DISPUTE_TYPES: DisputeType[] = [
  "Delivery Not Received",
  "Cargo Damage",
  "Short Delivery",
  "Wrong Cargo",
  "Late Delivery",
  "POD Mismatch",
  "Payment Dispute",
  "Document Dispute",
  "Other",
];

export const DISPUTE_STATUSES: DisputeStatus[] = [
  "Open",
  "Under Review",
  "Evidence Requested",
  "Provider Responded",
  "Customer Responded",
  "Resolved",
  "Rejected",
  "Closed",
];

export const RESOLUTION_TYPES: ResolutionType[] = [
  "No Claim",
  "Partial Claim",
  "Full Claim",
  "Replacement",
  "Discount",
  "Payment Hold",
  "Other",
];

// ─── Badge styles ─────────────────────────────────────────────────────────────

export const DISPUTE_STATUS_BADGE: Record<DisputeStatus, string> = {
  "Open":               "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Under Review":       "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Evidence Requested": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Provider Responded": "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "Customer Responded": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Resolved":           "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Rejected":           "bg-red-500/15 text-red-400 border-red-500/30",
  "Closed":             "bg-slate-500/15 text-slate-400 border-slate-700",
};

export const SEVERITY_BADGE: Record<DisputeSeverity, string> = {
  Low:      "bg-slate-500/15 text-slate-400 border-slate-600",
  Medium:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  High:     "bg-red-500/15 text-red-400 border-red-500/30",
  Critical: "bg-red-900/30 text-red-300 border-red-500/50",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Statuses where the dispute actively blocks balance payment progression */
const BLOCKING_STATUSES = new Set<DisputeStatus>([
  "Open",
  "Under Review",
  "Evidence Requested",
  "Provider Responded",
  "Customer Responded",
]);

export function isDisputeBlockingPayment(dispute: DisputeCase | null | undefined): boolean {
  if (!dispute) return false;
  return BLOCKING_STATUSES.has(dispute.status);
}

export function isActiveDispute(dispute: DisputeCase): boolean {
  return !["Resolved", "Rejected", "Closed"].includes(dispute.status);
}

export function canProceedAfterResolution(dispute: DisputeCase): boolean {
  return (
    dispute.status === "Resolved" &&
    (dispute.resolution_type === "No Claim" || dispute.resolution_type === "Discount")
  );
}
