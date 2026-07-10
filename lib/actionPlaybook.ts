// ─── Exception-to-Action Playbook v1 ─────────────────────────────────────────
// Playbook recommendation types, badge styles, audit actions.
// This is recommendation and task generation only.
// Do NOT auto-resolve blockers. Do NOT auto-release payment.

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlaybookTriggerType =
  | "Procurement Gate Blocked"
  | "Payment Blocked"
  | "Supplier Milestone Blocked"
  | "Shipment Delay"
  | "Document Missing"
  | "Discrepancy Detected"
  | "Delivery Dispute"
  | "Liability Review"
  | "Claim Reserve"
  | "Release Blocked"
  | "Customs / HS Code Issue"
  | "Other";

export type RecommendationStatus =
  | "Suggested"
  | "Accepted"
  | "Task Created"
  | "Dismissed"
  | "Completed"
  | "Escalated";

export type PlaybookPriority = "Low" | "Medium" | "High" | "Critical";

// ── DB row types ──────────────────────────────────────────────────────────────

export interface ActionPlaybookRow {
  id:                 string;
  playbook_name:      string;
  trigger_type:       PlaybookTriggerType;
  condition_key:      string | null;
  recommended_action: string | null;
  assigned_role:      string | null;
  priority:           PlaybookPriority;
  due_after_hours:    number;
  escalation_note:    string | null;
  is_active:          boolean;
  created_at:         string;
  updated_at:         string;
}

export interface ActionRecommendationRow {
  id:                     string;
  job_reference:          string | null;
  procurement_reference:  string | null;
  source_type:            string | null;
  source_id:              string | null;
  playbook_id:            string | null;
  recommendation_status:  RecommendationStatus;
  recommended_action:     string | null;
  assigned_role:          string | null;
  priority:               PlaybookPriority;
  due_at:                 string | null;
  rationale:              string | null;
  accepted_by:            string | null;
  accepted_at:            string | null;
  task_id:                string | null;
  dismissed_reason:       string | null;
  escalated_note:         string | null;
  completed_note:         string | null;
  created_at:             string;
  updated_at:             string;
  // joined
  playbook?:              ActionPlaybookRow | null;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

export const RECOMMENDATION_STATUS_BADGE: Record<RecommendationStatus, string> = {
  "Suggested":    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Accepted":     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Task Created": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "Dismissed":    "bg-slate-700/40 text-slate-500 border-slate-600/40",
  "Completed":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Escalated":    "bg-red-500/15 text-red-400 border-red-500/30",
};

export const PRIORITY_BADGE: Record<PlaybookPriority, string> = {
  Low:      "bg-slate-700/40 text-slate-400 border-slate-600/40",
  Medium:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const PRIORITY_ICON: Record<PlaybookPriority, string> = {
  Low:      "◦",
  Medium:   "⚠",
  High:     "⛔",
  Critical: "🚨",
};

export const TRIGGER_TYPE_ICON: Record<PlaybookTriggerType, string> = {
  "Procurement Gate Blocked":  "🚧",
  "Payment Blocked":           "💳",
  "Supplier Milestone Blocked":"🏭",
  "Shipment Delay":            "🚢",
  "Document Missing":          "📭",
  "Discrepancy Detected":      "🔍",
  "Delivery Dispute":          "⚖",
  "Liability Review":          "⚠",
  "Claim Reserve":             "💰",
  "Release Blocked":           "🔒",
  "Customs / HS Code Issue":   "🔖",
  "Other":                     "📋",
};

// ── Audit actions ─────────────────────────────────────────────────────────────

export const PLAYBOOK_AUDIT_ACTIONS = {
  playbook_created:           "action_playbook_created",
  recommendation_generated:   "action_recommendation_generated",
  recommendation_accepted:    "action_recommendation_accepted",
  recommendation_task_created:"action_recommendation_task_created",
  recommendation_dismissed:   "action_recommendation_dismissed",
  recommendation_escalated:   "action_recommendation_escalated",
  recommendation_completed:   "action_recommendation_completed",
} as const;

export type PlaybookAuditAction =
  (typeof PLAYBOOK_AUDIT_ACTIONS)[keyof typeof PLAYBOOK_AUDIT_ACTIONS];

// ── Compliance wording ────────────────────────────────────────────────────────

export const PLAYBOOK_COMPLIANCE_WORDING = {
  basis:
    "Action recommendations are advisory only. Nexum SecureFlow does not auto-resolve blockers or auto-release payments. All recommended actions require human review and admin approval before execution.",
  no_auto_resolve:
    "Accepting a recommendation creates a workflow task for review. It does not automatically resolve the underlying issue.",
  no_auto_release:
    "No payment or advance release occurs automatically as a result of a recommendation. Admin release approval is always required.",
} as const;

// ── All trigger types / statuses / priorities ─────────────────────────────────

export const ALL_TRIGGER_TYPES: PlaybookTriggerType[] = [
  "Procurement Gate Blocked",
  "Payment Blocked",
  "Supplier Milestone Blocked",
  "Shipment Delay",
  "Document Missing",
  "Discrepancy Detected",
  "Delivery Dispute",
  "Liability Review",
  "Claim Reserve",
  "Release Blocked",
  "Customs / HS Code Issue",
  "Other",
];

export const ALL_RECOMMENDATION_STATUSES: RecommendationStatus[] = [
  "Suggested",
  "Accepted",
  "Task Created",
  "Dismissed",
  "Completed",
  "Escalated",
];

export const ALL_PRIORITIES: PlaybookPriority[] = ["Low", "Medium", "High", "Critical"];
