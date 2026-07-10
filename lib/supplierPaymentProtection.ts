// ─── Supplier Advance Payment Protection v1 ───────────────────────────────────
// Types, constants, compliance wording, and helpers.
// This is a controlled payment workflow — NOT legal escrow.
// ──────────────────────────────────────────────────────────────────────────────

// ─── Status ───────────────────────────────────────────────────────────────────

export const PROTECTION_STATUSES = [
  "Draft",
  "Pending Buyer Funding",
  "Payment Secured",
  "Milestone Release Active",
  "Partially Released",
  "Fully Released",
  "Disputed",
  "Cancelled",
  "Closed",
] as const;
export type ProtectionStatus = typeof PROTECTION_STATUSES[number];

export const PROTECTION_STATUS_BADGE: Record<ProtectionStatus, string> = {
  "Draft":                    "bg-slate-700/50 text-slate-400 border-slate-600",
  "Pending Buyer Funding":    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Payment Secured":          "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Milestone Release Active": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Partially Released":       "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "Fully Released":           "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                 "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":                "bg-slate-700/50 text-slate-500 border-slate-700",
  "Closed":                   "bg-slate-700/50 text-slate-400 border-slate-700",
};

export const PROTECTION_STATUS_ICON: Record<ProtectionStatus, string> = {
  "Draft":                    "📋",
  "Pending Buyer Funding":    "⏳",
  "Payment Secured":          "🔒",
  "Milestone Release Active": "⚙️",
  "Partially Released":       "📤",
  "Fully Released":           "✅",
  "Disputed":                 "⚠️",
  "Cancelled":                "✕",
  "Closed":                   "■",
};

// ─── Release model ────────────────────────────────────────────────────────────

export const RELEASE_MODELS = [
  "Deposit Only",
  "Milestone Release",
  "Production Proof Release",
  "Inspection Release",
  "BL Release",
  "Final Acceptance Release",
  "Manual Review",
] as const;
export type ReleaseModel = typeof RELEASE_MODELS[number];

// ─── Milestone status ─────────────────────────────────────────────────────────

export const MILESTONE_STATUSES = [
  "Pending",
  "Evidence Uploaded",
  "Verified",
  "Release Eligible",
  "Released",
  "Disputed",
  "Cancelled",
] as const;
export type MilestoneStatus = typeof MILESTONE_STATUSES[number];

export const MILESTONE_STATUS_BADGE: Record<MilestoneStatus, string> = {
  "Pending":           "bg-slate-700/50 text-slate-500 border-slate-700",
  "Evidence Uploaded": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Verified":          "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Release Eligible":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Released":          "bg-emerald-500/25 text-emerald-300 border-emerald-500/50",
  "Disputed":          "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":         "bg-slate-700/50 text-slate-600 border-slate-700",
};

export const MILESTONE_STATUS_ICON: Record<MilestoneStatus, string> = {
  "Pending":           "○",
  "Evidence Uploaded": "📎",
  "Verified":          "✓",
  "Release Eligible":  "→",
  "Released":          "✅",
  "Disputed":          "⚠",
  "Cancelled":         "✕",
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SupplierPaymentProtection {
  id:                      string;
  job_reference:           string;
  supplier_id?:            string | null;
  buyer_company_id?:       string | null;
  supplier_name?:          string | null;
  supplier_country?:       string | null;
  protection_status:       ProtectionStatus;
  goods_description?:      string | null;
  hs_code?:                string | null;
  incoterm?:               string | null;
  cargo_value_amount?:     number | null;
  cargo_value_currency?:   string | null;
  advance_required_amount?: number | null;
  advance_currency?:       string | null;
  advance_percentage?:     number | null;
  balance_amount?:         number | null;
  balance_currency?:       string | null;
  release_model:           ReleaseModel;
  required_documents?:     string[] | null;
  risk_level:              string;
  risk_note?:              string | null;
  created_at:              string;
  updated_at:              string;
  // Joined
  supplier_release_milestones?: SupplierReleaseMilestone[];
}

export interface SupplierReleaseMilestone {
  id:                   string;
  protection_id:        string;
  job_reference:        string;
  milestone_name?:      string | null;
  milestone_percentage?: number | null;
  milestone_amount?:    number | null;
  currency?:            string | null;
  required_evidence?:   string | null;
  milestone_status:     MilestoneStatus;
  // Evidence verification columns (added in v2 SQL migration)
  evidence_status?:       string | null;
  evidence_uploaded_at?:  string | null;
  reviewed_by?:           string | null;
  reviewed_at?:           string | null;
  review_note?:           string | null;
  rejection_reason?:      string | null;
  release_blocker_note?:  string | null;
  evidence_document_id?:  string | null;
  verified_by?:           string | null;
  verified_at?:           string | null;
  released_at?:           string | null;
  created_at:             string;
  updated_at:             string;
}

// ─── Default milestone templates ──────────────────────────────────────────────

export interface MilestoneTemplate {
  milestone_name:       string;
  milestone_percentage: number;
  required_evidence:    string;
}

export const DEFAULT_MILESTONE_TEMPLATES: MilestoneTemplate[] = [
  {
    milestone_name:       "Deposit Release",
    milestone_percentage: 30,
    required_evidence:    "Supplier acceptance / Proforma Invoice / Order Confirmation",
  },
  {
    milestone_name:       "Production Proof",
    milestone_percentage: 25,
    required_evidence:    "Production photos / Factory progress report",
  },
  {
    milestone_name:       "QA / Inspection",
    milestone_percentage: 20,
    required_evidence:    "Inspection report / Third-party QA certificate",
  },
  {
    milestone_name:       "BL / Shipping Evidence",
    milestone_percentage: 15,
    required_evidence:    "Bill of Lading / Airway Bill / Shipment proof",
  },
  {
    milestone_name:       "Final Acceptance",
    milestone_percentage: 10,
    required_evidence:    "Buyer acceptance confirmation / Delivery confirmation",
  },
];

// ─── Audit actions ────────────────────────────────────────────────────────────

export const SPP_AUDIT_ACTIONS = {
  protection_created:         "supplier_payment_protection_created",
  protection_updated:         "supplier_payment_protection_updated",
  protection_status_changed:  "supplier_payment_protection_status_changed",
  milestone_created:          "supplier_milestone_created",
  milestone_templates_applied: "supplier_milestone_templates_applied",
  milestone_evidence_uploaded: "supplier_milestone_evidence_uploaded",
  milestone_verified:         "supplier_milestone_verified",
  milestone_release_eligible: "supplier_milestone_release_eligible",
  milestone_released:         "supplier_milestone_released",
  release_blocked:            "supplier_release_blocked",
} as const;

// ─── Compliance wording ───────────────────────────────────────────────────────

export const SPP_COMPLIANCE_WORDING = {
  workflow_only:      "Supplier payment protection workflow — this is not legal escrow.",
  milestone_release:  "Milestone-based release — funds are released only after admin verification of required evidence.",
  payment_secured:    "Payment secured subject to verification — no funds are disbursed automatically.",
  release_recorded:   "Release instruction recorded — manual disbursement required.",
  no_guarantee:       "Nexum does not guarantee supplier performance or delivery.",
  no_auto_disburse:   "Nexum does not automatically disburse funds to suppliers.",
  admin_verify_req:   "Admin verification required before any milestone release.",
  new_supplier_warn:  "New supplier — milestone release recommended. Verify supplier identity before releasing funds.",
  watchlist_warn:     "Supplier on Watchlist — proceed with heightened due diligence.",
  blocked_warn:       "Supplier is Blocked — admin override required before any payment release.",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtProtectionAmount(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export function getNextActionMilestone(
  milestones: SupplierReleaseMilestone[],
): SupplierReleaseMilestone | null {
  const active = milestones.filter(
    (m) => !["Released", "Cancelled"].includes(m.milestone_status),
  );
  if (active.length === 0) return null;
  // Priority: Release Eligible > Evidence Uploaded > Verified > Pending
  return (
    active.find((m) => m.milestone_status === "Release Eligible") ??
    active.find((m) => m.milestone_status === "Evidence Uploaded") ??
    active.find((m) => m.milestone_status === "Verified") ??
    active[0]
  );
}

export function computeTotalReleased(milestones: SupplierReleaseMilestone[]): number {
  return milestones
    .filter((m) => m.milestone_status === "Released")
    .reduce((sum, m) => sum + (m.milestone_amount ?? 0), 0);
}

export function computeReleaseProgress(milestones: SupplierReleaseMilestone[]): number {
  const total = milestones.filter((m) => m.milestone_status !== "Cancelled");
  const released = total.filter((m) => m.milestone_status === "Released");
  if (total.length === 0) return 0;
  return Math.round((released.length / total.length) * 100);
}

export function computeReleasedPct(milestones: SupplierReleaseMilestone[]): number {
  const released = milestones.filter((m) => m.milestone_status === "Released");
  return released.reduce((sum, m) => sum + (m.milestone_percentage ?? 0), 0);
}

export function statusCanAdvanceTo(current: ProtectionStatus): ProtectionStatus[] {
  const flows: Partial<Record<ProtectionStatus, ProtectionStatus[]>> = {
    "Draft":                    ["Pending Buyer Funding", "Cancelled"],
    "Pending Buyer Funding":    ["Payment Secured", "Cancelled"],
    "Payment Secured":          ["Milestone Release Active", "Disputed", "Cancelled"],
    "Milestone Release Active": ["Partially Released", "Fully Released", "Disputed", "Cancelled"],
    "Partially Released":       ["Fully Released", "Disputed", "Closed"],
    "Fully Released":           ["Closed"],
    "Disputed":                 ["Milestone Release Active", "Cancelled"],
  };
  return flows[current] ?? [];
}

// ─── Milestone amount calculator ──────────────────────────────────────────────

export function calcMilestoneAmount(
  advanceAmount: number | null | undefined,
  pct:           number | null | undefined,
): number | null {
  if (!advanceAmount || !pct) return null;
  return Math.round((advanceAmount * pct) / 100 * 100) / 100;
}
