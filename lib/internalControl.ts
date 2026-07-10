// ─── Operating SOP / Internal Control Matrix v1 ──────────────────────────────
// Types, badge styles, audit actions.
// This is internal control and SOP visibility only.
// Does NOT connect external compliance/legal systems.
// Does NOT auto-release money.

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowArea =
  | "Job Creation"
  | "Quotation"
  | "RFQ"
  | "Payment Holding"
  | "Payment Reconciliation"
  | "Release Approval"
  | "Settlement Reconciliation"
  | "Delivery Confirmation"
  | "Dispute"
  | "Liability Review"
  | "Claim Reserve"
  | "Supplier Payment Protection"
  | "Supplier Milestone Release"
  | "Procurement Readiness"
  | "Credit Pack"
  | "Financing Simulation"
  | "Accounting Export"
  | "Other";

export type CheckStatus =
  | "Not Checked"
  | "Passed"
  | "Failed"
  | "Warning"
  | "Overridden";

// ── DB row types ──────────────────────────────────────────────────────────────

export interface InternalControlRuleRow {
  id:                         string;
  control_name:               string;
  workflow_area:              WorkflowArea | null;
  trigger_event:              string | null;
  required_evidence:          string | null;
  maker_role:                 string | null;
  checker_role:               string | null;
  approver_role:              string | null;
  requires_dual_approval:     boolean;
  same_user_restricted:       boolean;
  requires_audit_log:         boolean;
  requires_terms_acceptance:  boolean;
  requires_compliance_check:  boolean;
  requires_dispute_check:     boolean;
  requires_reconciliation:    boolean;
  is_active:                  boolean;
  control_note:               string | null;
  created_at:                 string;
  updated_at:                 string;
}

export interface InternalControlCheckRow {
  id:                   string;
  job_reference:        string | null;
  procurement_reference:string | null;
  control_rule_id:      string | null;
  workflow_area:        string | null;
  check_status:         CheckStatus;
  checked_by:           string | null;
  checked_at:           string | null;
  failure_reason:       string | null;
  override_reason:      string | null;
  evidence_summary:     string | null;
  created_at:           string;
  updated_at:           string;
  // joined
  control_rule?:        InternalControlRuleRow | null;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

export const CHECK_STATUS_BADGE: Record<CheckStatus, string> = {
  "Not Checked": "bg-slate-700/40 text-slate-500 border-slate-600/40",
  "Passed":      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Failed":      "bg-red-500/15 text-red-400 border-red-500/30",
  "Warning":     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Overridden":  "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export const CHECK_STATUS_ICON: Record<CheckStatus, string> = {
  "Not Checked": "○",
  "Passed":      "✓",
  "Failed":      "✗",
  "Warning":     "⚠",
  "Overridden":  "↷",
};

export const WORKFLOW_AREA_ICON: Record<WorkflowArea, string> = {
  "Job Creation":             "📋",
  "Quotation":                "💬",
  "RFQ":                      "📝",
  "Payment Holding":          "🏦",
  "Payment Reconciliation":   "💳",
  "Release Approval":         "🔓",
  "Settlement Reconciliation":"⚖",
  "Delivery Confirmation":    "📦",
  "Dispute":                  "⚔",
  "Liability Review":         "⚠",
  "Claim Reserve":            "💰",
  "Supplier Payment Protection": "🛡",
  "Supplier Milestone Release":  "🏭",
  "Procurement Readiness":    "🚧",
  "Credit Pack":              "📊",
  "Financing Simulation":     "🔢",
  "Accounting Export":        "📤",
  "Other":                    "📌",
};

// ── Audit actions ─────────────────────────────────────────────────────────────

export const CONTROL_AUDIT_ACTIONS = {
  rule_created:           "internal_control_rule_created",
  rule_updated:           "internal_control_rule_updated",
  check_run:              "internal_control_check_run",
  check_passed:           "internal_control_passed",
  check_failed:           "internal_control_failed",
  check_overridden:       "internal_control_overridden",
  warning_acknowledged:   "internal_control_warning_acknowledged",
} as const;

export type ControlAuditAction =
  (typeof CONTROL_AUDIT_ACTIONS)[keyof typeof CONTROL_AUDIT_ACTIONS];

// ── Compliance wording ────────────────────────────────────────────────────────

export const CONTROL_COMPLIANCE_WORDING = {
  basis:
    "Internal control checks are SOP visibility tools. They do not constitute legal compliance certification. All checks require human review. Nexum SecureFlow does not auto-release money.",
  override:
    "Overriding a failed control check requires a written justification and creates a permanent audit record. The override does not remove the underlying risk.",
  dual_approval:
    "Dual approval controls require two separate admin users to act as maker and checker. The same user cannot fulfil both roles.",
  no_external:
    "Internal control checks do not connect to external compliance, legal, or regulatory systems.",
} as const;

// ── All workflow areas ────────────────────────────────────────────────────────

export const ALL_WORKFLOW_AREAS: WorkflowArea[] = [
  "Job Creation",
  "Quotation",
  "RFQ",
  "Payment Holding",
  "Payment Reconciliation",
  "Release Approval",
  "Settlement Reconciliation",
  "Delivery Confirmation",
  "Dispute",
  "Liability Review",
  "Claim Reserve",
  "Supplier Payment Protection",
  "Supplier Milestone Release",
  "Procurement Readiness",
  "Credit Pack",
  "Financing Simulation",
  "Accounting Export",
  "Other",
];

export const ALL_CHECK_STATUSES: CheckStatus[] = [
  "Not Checked",
  "Passed",
  "Failed",
  "Warning",
  "Overridden",
];

// ── Helper: determine overall gate status from array of checks ─────────────────

export function getOverallControlStatus(checks: InternalControlCheckRow[]): CheckStatus {
  if (checks.length === 0) return "Not Checked";
  if (checks.some(c => c.check_status === "Failed")) return "Failed";
  if (checks.some(c => c.check_status === "Warning")) return "Warning";
  if (checks.some(c => c.check_status === "Overridden")) return "Overridden";
  if (checks.every(c => c.check_status === "Passed")) return "Passed";
  return "Not Checked";
}

// ── Helper: determine if action is allowed given checks ───────────────────────

export function isActionAllowed(checks: InternalControlCheckRow[]): {
  allowed: boolean;
  reason: string | null;
} {
  const failed = checks.filter(c => c.check_status === "Failed");
  if (failed.length > 0) {
    return {
      allowed: false,
      reason: `${failed.length} control check${failed.length !== 1 ? "s" : ""} failed: ${failed.map(c => c.control_rule?.control_name ?? c.workflow_area ?? c.id).join(", ")}. Override required.`,
    };
  }
  return { allowed: true, reason: null };
}
