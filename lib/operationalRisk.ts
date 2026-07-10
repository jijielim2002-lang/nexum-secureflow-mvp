// ─── Operational Risk Register v1 ────────────────────────────────────────────
// Types, badge styles, audit actions, compliance wording, helpers.
//
// Constraints:
//   - Does NOT create legal risk opinions.
//   - Does NOT connect external risk database.
//   - This is internal operational risk tracking only.
//   - Does NOT auto-block workflow actions.

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskCategory =
  | "Payment Risk"
  | "Release Risk"
  | "Supplier Risk"
  | "Buyer Risk"
  | "Provider Risk"
  | "Shipment Risk"
  | "Document Risk"
  | "Customs / HS Code Risk"
  | "Incoterm / Responsibility Risk"
  | "Dispute / Claim Risk"
  | "Compliance Wording Risk"
  | "RLS / Access Control Risk"
  | "Internal Control Override Risk"
  | "System / Data Quality Risk"
  | "AI Extraction Risk"
  | "Bank Reconciliation Risk"
  | "Other";

export type RiskSeverity = "Low" | "Medium" | "High" | "Critical";
export type RiskLikelihood = "Low" | "Medium" | "High";
export type RiskImpact = "Low" | "Medium" | "High" | "Critical";

export type RiskStatus =
  | "Open"
  | "In Review"
  | "Mitigation Active"
  | "Accepted"
  | "Resolved"
  | "Closed";

export type MitigationActionStatus =
  | "Open"
  | "In Progress"
  | "Completed"
  | "Dismissed"
  | "Overdue";

// ── DB row types ──────────────────────────────────────────────────────────────

export interface OperationalRiskRow {
  id:                    string;
  risk_reference:        string;
  job_reference:         string | null;
  procurement_reference: string | null;
  company_id:            string | null;
  supplier_id:           string | null;
  risk_category:         RiskCategory | null;
  risk_title:            string;
  risk_description:      string | null;
  risk_severity:         RiskSeverity;
  likelihood:            RiskLikelihood;
  impact:                RiskImpact;
  risk_status:           RiskStatus;
  root_cause:            string | null;
  mitigation_plan:       string | null;
  owner_role:            string | null;
  owner_user_id:         string | null;
  due_date:              string | null;
  resolved_at:           string | null;
  resolution_note:       string | null;
  source_type:           string | null;
  source_id:             string | null;
  created_by:            string | null;
  created_at:            string;
  updated_at:            string;
  // joined
  mitigation_actions?:   RiskMitigationActionRow[];
}

export interface RiskMitigationActionRow {
  id:                  string;
  risk_id:             string;
  action_title:        string | null;
  action_description:  string | null;
  assigned_role:       string | null;
  assigned_user_id:    string | null;
  status:              MitigationActionStatus;
  due_at:              string | null;
  completed_at:        string | null;
  created_at:          string;
}

// ── Reference generator ───────────────────────────────────────────────────────

export function generateRiskReference(): string {
  const now   = new Date();
  const yy    = String(now.getFullYear()).slice(2);
  const mm    = String(now.getMonth() + 1).padStart(2, "0");
  const rand  = Math.floor(Math.random() * 900000) + 100000;
  return `RISK-${yy}${mm}-${rand}`;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

export const RISK_SEVERITY_BADGE: Record<RiskSeverity, string> = {
  Low:      "bg-slate-700/40 text-slate-400 border-slate-600/40",
  Medium:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const RISK_STATUS_BADGE: Record<RiskStatus, string> = {
  "Open":              "bg-red-500/15 text-red-400 border-red-500/30",
  "In Review":         "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Mitigation Active": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Accepted":          "bg-slate-700/40 text-slate-400 border-slate-600/40",
  "Resolved":          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Closed":            "bg-slate-800/60 text-slate-500 border-slate-700/40",
};

export const MITIGATION_STATUS_BADGE: Record<MitigationActionStatus, string> = {
  "Open":        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "In Progress": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Completed":   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Dismissed":   "bg-slate-700/40 text-slate-500 border-slate-600/40",
  "Overdue":     "bg-red-500/15 text-red-400 border-red-500/30",
};

export const RISK_SEVERITY_ICON: Record<RiskSeverity, string> = {
  Low:      "○",
  Medium:   "◑",
  High:     "●",
  Critical: "🔴",
};

export const RISK_CATEGORY_ICON: Record<RiskCategory, string> = {
  "Payment Risk":                    "💳",
  "Release Risk":                    "🔓",
  "Supplier Risk":                   "🏭",
  "Buyer Risk":                      "🏢",
  "Provider Risk":                   "📦",
  "Shipment Risk":                   "🚢",
  "Document Risk":                   "📄",
  "Customs / HS Code Risk":          "🛃",
  "Incoterm / Responsibility Risk":  "⚖",
  "Dispute / Claim Risk":            "⚔",
  "Compliance Wording Risk":         "📝",
  "RLS / Access Control Risk":       "🔐",
  "Internal Control Override Risk":  "↷",
  "System / Data Quality Risk":      "⚙",
  "AI Extraction Risk":              "🤖",
  "Bank Reconciliation Risk":        "🏦",
  "Other":                           "📌",
};

// ── Audit actions ─────────────────────────────────────────────────────────────

export const RISK_AUDIT_ACTIONS = {
  risk_created:            "operational_risk_created",
  risk_auto_detected:      "operational_risk_auto_detected",
  mitigation_created:      "operational_risk_mitigation_created",
  status_updated:          "operational_risk_status_updated",
  risk_accepted:           "operational_risk_accepted",
  risk_resolved:           "operational_risk_resolved",
  risk_closed:             "operational_risk_closed",
} as const;

export type RiskAuditAction =
  (typeof RISK_AUDIT_ACTIONS)[keyof typeof RISK_AUDIT_ACTIONS];

// ── Compliance wording ────────────────────────────────────────────────────────

export const RISK_COMPLIANCE_WORDING = {
  basis:
    "Operational risk register entries are internal risk signals requiring review. They do not constitute legal, compliance, or fraud conclusions. All entries require human review and judgment.",
  auto_detected:
    "Auto-detected risks are generated from system signals. They indicate a potential risk requiring attention — not a confirmed incident or violation.",
  accepted:
    "Accepting a risk means acknowledging the risk signal and deciding to proceed without immediate mitigation. This creates a permanent audit record.",
  no_external:
    "This risk register does not connect to external regulatory, legal, or compliance databases.",
  no_auto_block:
    "Risk register entries do not automatically block workflow actions. Existing workflow controls manage action permissions separately.",
} as const;

// ── All categories ────────────────────────────────────────────────────────────

export const ALL_RISK_CATEGORIES: RiskCategory[] = [
  "Payment Risk",
  "Release Risk",
  "Supplier Risk",
  "Buyer Risk",
  "Provider Risk",
  "Shipment Risk",
  "Document Risk",
  "Customs / HS Code Risk",
  "Incoterm / Responsibility Risk",
  "Dispute / Claim Risk",
  "Compliance Wording Risk",
  "RLS / Access Control Risk",
  "Internal Control Override Risk",
  "System / Data Quality Risk",
  "AI Extraction Risk",
  "Bank Reconciliation Risk",
  "Other",
];

export const ALL_RISK_STATUSES: RiskStatus[] = [
  "Open",
  "In Review",
  "Mitigation Active",
  "Accepted",
  "Resolved",
  "Closed",
];

export const ALL_RISK_SEVERITIES: RiskSeverity[] = [
  "Low", "Medium", "High", "Critical",
];

// ── Helper: compute composite severity from likelihood × impact ───────────────

export function computeRiskSeverity(
  likelihood: RiskLikelihood,
  impact: RiskImpact,
): RiskSeverity {
  const lScore = { Low: 1, Medium: 2, High: 3 }[likelihood] ?? 2;
  const iScore = { Low: 1, Medium: 2, High: 3, Critical: 4 }[impact] ?? 2;
  const combined = lScore * iScore;
  if (combined >= 9) return "Critical";
  if (combined >= 6) return "High";
  if (combined >= 3) return "Medium";
  return "Low";
}

// ── Helper: is risk overdue ───────────────────────────────────────────────────

export function isRiskOverdue(risk: OperationalRiskRow): boolean {
  if (!risk.due_date) return false;
  if (["Resolved", "Closed", "Accepted"].includes(risk.risk_status)) return false;
  return new Date(risk.due_date) < new Date();
}

// ── Auto-detection source types ───────────────────────────────────────────────

export const RISK_SOURCE_TYPES = {
  internal_control_override:     "internal_control_override",
  failed_control_check:          "failed_control_check",
  critical_procurement_disc:     "critical_procurement_discrepancy",
  payment_recon_mismatch:        "payment_reconciliation_mismatch",
  release_settlement_mismatch:   "release_settlement_mismatch",
  supplier_blocked_watchlist:    "supplier_blocked_watchlist",
  company_watchlist:             "company_watchlist",
  shipment_delay_critical:       "shipment_delay_critical",
  dispute_high_critical:         "dispute_high_critical",
  liability_review_high_claim:   "liability_review_high_claim",
  claim_reserve_high_amount:     "claim_reserve_high_amount",
  ai_extraction_low_confidence:  "ai_extraction_low_confidence",
  missing_hs_code_ddp:           "missing_hs_code_ddp",
  unsafe_wording_detected:       "unsafe_wording_detected",
  bank_import_unmatched:         "bank_import_unmatched",
} as const;
