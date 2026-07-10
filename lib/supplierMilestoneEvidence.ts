// ─── Supplier Milestone Evidence Verification v1 ─────────────────────────────
// Types, constants, helpers for milestone evidence verification workflow.
// NOT a quality/legal guarantee. Evidence verified for workflow purpose only.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Evidence status ──────────────────────────────────────────────────────────

export const EVIDENCE_STATUSES = [
  "Not Uploaded",
  "Uploaded",
  "Under Review",
  "Verified",
  "Rejected",
  "More Evidence Required",
] as const;
export type EvidenceStatus = typeof EVIDENCE_STATUSES[number];

export const EVIDENCE_STATUS_BADGE: Record<EvidenceStatus, string> = {
  "Not Uploaded":           "bg-slate-700/50 text-slate-500 border-slate-700",
  "Uploaded":               "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Under Review":           "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Verified":               "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Rejected":               "bg-red-500/15 text-red-400 border-red-500/30",
  "More Evidence Required": "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

export const EVIDENCE_STATUS_ICON: Record<EvidenceStatus, string> = {
  "Not Uploaded":           "○",
  "Uploaded":               "📎",
  "Under Review":           "🔍",
  "Verified":               "✓",
  "Rejected":               "✕",
  "More Evidence Required": "⚠",
};

// ─── Evidence item verification status ───────────────────────────────────────

export const EVIDENCE_ITEM_STATUSES = [
  "Pending",
  "Verified",
  "Rejected",
  "Needs Review",
] as const;
export type EvidenceItemStatus = typeof EVIDENCE_ITEM_STATUSES[number];

export const EVIDENCE_ITEM_STATUS_BADGE: Record<EvidenceItemStatus, string> = {
  "Pending":     "bg-slate-700/50 text-slate-400 border-slate-600",
  "Verified":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Rejected":    "bg-red-500/15 text-red-400 border-red-500/30",
  "Needs Review": "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

// ─── Evidence types ───────────────────────────────────────────────────────────

export const EVIDENCE_ITEM_TYPES = [
  "Proforma Invoice",
  "Order Confirmation",
  "Production Photo",
  "Production Report",
  "Inspection Report",
  "QA Certificate",
  "Packing List",
  "Bill of Lading",
  "Airway Bill",
  "Factory Statement",
  "Buyer Confirmation",
  "Other",
] as const;
export type EvidenceItemType = typeof EVIDENCE_ITEM_TYPES[number];

// Document intelligence-linked types (these may have extraction data)
export const DOCUMENT_INTELLIGENCE_EVIDENCE_TYPES: EvidenceItemType[] = [
  "Inspection Report",
  "Bill of Lading",
  "Airway Bill",
  "Packing List",
  "Proforma Invoice",
];

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SupplierMilestoneEvidenceItem {
  id:                  string;
  milestone_id:        string;
  job_reference:       string;
  document_id?:        string | null;
  evidence_type?:      EvidenceItemType | null;
  uploaded_by_role?:   string | null;
  uploaded_by_user_id?: string | null;
  verification_status: EvidenceItemStatus;
  confidence_score?:   number | null;
  remarks?:            string | null;
  created_at:          string;
  // Joined
  supplier_release_milestones?: {
    id:              string;
    milestone_name:  string | null;
    milestone_status: string;
    evidence_status: EvidenceStatus;
    required_evidence: string | null;
    job_reference:   string;
    supplier_payment_protections?: {
      id:                string;
      supplier_name:     string | null;
      protection_status: string;
    } | null;
  } | null;
  documents?: {
    id:            string;
    document_type: string;
    file_name:     string;
  } | null;
}

// Extended milestone with new evidence columns
export interface SupplierReleaseMilestoneWithEvidence {
  id:                   string;
  protection_id:        string;
  job_reference:        string;
  milestone_name?:      string | null;
  milestone_percentage?: number | null;
  milestone_amount?:    number | null;
  currency?:            string | null;
  required_evidence?:   string | null;
  milestone_status:     string;
  evidence_status:      EvidenceStatus;
  evidence_uploaded_at?: string | null;
  reviewed_by?:         string | null;
  reviewed_at?:         string | null;
  review_note?:         string | null;
  rejection_reason?:    string | null;
  release_blocker_note?: string | null;
  evidence_document_id?: string | null;
  verified_at?:         string | null;
  released_at?:         string | null;
  created_at:           string;
  updated_at:           string;
  // Joined evidence items
  supplier_milestone_evidence_items?: SupplierMilestoneEvidenceItem[];
}

// ─── Audit actions ────────────────────────────────────────────────────────────

export const SMEV_AUDIT_ACTIONS = {
  evidence_uploaded:          "supplier_milestone_evidence_uploaded",
  evidence_verified:          "supplier_milestone_evidence_verified",
  evidence_rejected:          "supplier_milestone_evidence_rejected",
  more_evidence_required:     "supplier_milestone_more_evidence_required",
  release_eligible:           "supplier_milestone_release_eligible",
} as const;

// ─── Compliance wording ───────────────────────────────────────────────────────

export const SMEV_COMPLIANCE_WORDING = {
  workflow_only:       "Evidence verified for workflow purpose only — not a quality or legal certification.",
  not_guaranteed:      "Nexum does not guarantee supplier quality, document authenticity, or goods conformity.",
  release_eligible:    "Release eligible — evidence verified for workflow tracking. Manual release instruction required. No automatic disbursement.",
  admin_review:        "Admin review note — internal workflow reference only.",
  rejection_notice:    "Evidence rejected — release remains blocked. Resubmit corrected evidence to proceed.",
  more_evidence:       "Additional evidence required — release blocked pending supplementary documentation.",
  no_auto_release:     "No funds are released automatically. Manual disbursement instruction required.",
  doc_intelligence:    "Document-derived verification context — subject to admin confirmation.",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function canUploadEvidence(
  milestoneStatus: string,
  evidenceStatus: EvidenceStatus,
): boolean {
  // Can upload when milestone is not released/cancelled
  // and evidence is not already verified (can re-upload if rejected/more-required)
  const terminalMilestone = ["Released", "Cancelled"];
  if (terminalMilestone.includes(milestoneStatus)) return false;
  return true;
}

export function isReleaseEligible(
  evidenceStatus: EvidenceStatus,
  protectionStatus: string,
  hasOpenDispute: boolean,
): boolean {
  if (evidenceStatus !== "Verified") return false;
  if (hasOpenDispute) return false;
  const eligibleProtectionStatuses = ["Payment Secured", "Milestone Release Active"];
  return eligibleProtectionStatuses.includes(protectionStatus);
}

export function getEvidenceBlockReason(
  evidenceStatus: EvidenceStatus,
  protectionStatus: string,
  hasOpenDispute: boolean,
): string | null {
  if (hasOpenDispute) return "Open dispute — all releases blocked pending resolution.";
  if (evidenceStatus === "Rejected") return SMEV_COMPLIANCE_WORDING.rejection_notice;
  if (evidenceStatus === "More Evidence Required") return SMEV_COMPLIANCE_WORDING.more_evidence;
  if (evidenceStatus === "Not Uploaded" || evidenceStatus === "Uploaded") return "Evidence not yet verified by admin.";
  if (evidenceStatus === "Under Review") return "Evidence under admin review.";
  if (evidenceStatus === "Verified") {
    const eligible = ["Payment Secured", "Milestone Release Active"];
    if (!eligible.includes(protectionStatus)) return `Protection must be in Payment Secured or Milestone Release Active status (currently: ${protectionStatus}).`;
  }
  return null;
}

export function fmtEvidenceDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}
