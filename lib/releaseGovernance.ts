// ─── Release Governance & Dual Approval Library ──────────────────────────────
// Types, helpers, and context builders for maker-checker release governance.
//
// Governance flow:
//   Draft → Pending Checker Approval → Checker Approved → Instructed → Completed
//                                    ↘ Checker Rejected

export type GovernanceStatus =
  | "Draft"
  | "Pending Checker Approval"
  | "Checker Approved"
  | "Checker Rejected"
  | "Ready for Finance Instruction"
  | "Instructed"
  | "Completed"
  | "Cancelled";

// ─── Extended release instruction row with governance fields ─────────────────

export interface ReleaseInstructionGovernanceRow {
  id:                string;
  job_reference:     string;
  held_payment_id:   string | null;
  payee_company_id:  string | null;
  amount:            number;
  currency:          string;
  release_type:      string;
  release_status:    string;
  governance_status: GovernanceStatus;
  created_by:        string | null;
  checked_by:        string | null;
  checked_at:        string | null;
  checker_note:      string | null;
  approved_by:       string | null;
  approved_at:       string | null;
  approval_reason:   string | null;
  instructed_by:     string | null;
  instructed_at:     string | null;
  completed_at:      string | null;
  rejection_reason:  string | null;
  created_at:        string;
  updated_at:        string;
}

// ─── Status badges ───────────────────────────────────────────────────────────

export const GOVERNANCE_STATUS_BADGE: Record<GovernanceStatus, string> = {
  "Draft":                        "bg-slate-700/40 text-slate-400 border-slate-600/30",
  "Pending Checker Approval":     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Checker Approved":             "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Checker Rejected":             "bg-red-500/15 text-red-400 border-red-500/30",
  "Ready for Finance Instruction":"bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Instructed":                   "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Completed":                    "bg-emerald-600/15 text-emerald-300 border-emerald-600/30",
  "Cancelled":                    "bg-slate-600/20 text-slate-500 border-slate-600/30",
};

export const GOVERNANCE_STATUS_ICON: Record<GovernanceStatus, string> = {
  "Draft":                        "○",
  "Pending Checker Approval":     "⏳",
  "Checker Approved":             "✓",
  "Checker Rejected":             "✕",
  "Ready for Finance Instruction":"▶",
  "Instructed":                   "⚙",
  "Completed":                    "✓✓",
  "Cancelled":                    "✗",
};

// ─── Governance step order for progress display ──────────────────────────────

export const GOVERNANCE_STEPS: { key: GovernanceStatus; label: string }[] = [
  { key: "Pending Checker Approval", label: "Awaiting Checker" },
  { key: "Checker Approved",         label: "Checker Approved" },
  { key: "Instructed",               label: "Finance Instructed" },
  { key: "Completed",                label: "Reconciled" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if governance is complete (settlement reconciled) */
export function isGovernanceComplete(ri: ReleaseInstructionGovernanceRow): boolean {
  return ri.governance_status === "Completed";
}

/** True if governance is in a terminal failed/cancelled state */
export function isGovernanceTerminal(ri: ReleaseInstructionGovernanceRow): boolean {
  return ri.governance_status === "Checker Rejected" || ri.governance_status === "Cancelled";
}

/** True if checker approval is needed */
export function needsCheckerApproval(ri: ReleaseInstructionGovernanceRow): boolean {
  return ri.governance_status === "Pending Checker Approval" || ri.governance_status === "Draft";
}

/** True if finance instruction is allowed */
export function canFinanceInstruct(ri: ReleaseInstructionGovernanceRow): boolean {
  return ri.governance_status === "Checker Approved" || ri.governance_status === "Ready for Finance Instruction";
}

/** True if current user is the maker (same-user block for checker role) */
export function isMaker(ri: ReleaseInstructionGovernanceRow, userId: string): boolean {
  return ri.created_by === userId;
}

/** Returns governance violation message, or null if no violation */
export function governanceViolation(
  ri: ReleaseInstructionGovernanceRow,
  userId: string,
  action: "checker_approve" | "checker_reject" | "instruct" | "reconcile",
): string | null {
  if (action === "checker_approve" || action === "checker_reject") {
    if (ri.created_by && ri.created_by === userId) {
      return "Governance violation: the checker must be a different person from the release maker.";
    }
  }
  if (action === "instruct") {
    if (ri.created_by && ri.created_by === userId) {
      return "Warning: the finance instructor is the same person as the release maker. This should be a different operator.";
    }
  }
  if (action === "reconcile") {
    if (ri.instructed_by && ri.instructed_by === userId) {
      return "Warning: the reconciler is the same person as the finance instructor. This should be a different operator where possible.";
    }
  }
  return null;
}

/** Summarise next required action for the governance flow */
export function nextGovernanceAction(ri: ReleaseInstructionGovernanceRow): {
  role: string;
  action: string;
  isBlocked: boolean;
} {
  switch (ri.governance_status) {
    case "Draft":
    case "Pending Checker Approval":
      return { role: "Checker (different admin)", action: "Approve or reject this release instruction", isBlocked: false };
    case "Checker Approved":
    case "Ready for Finance Instruction":
      return { role: "Finance Admin", action: "Mark Release Instructed and process payout through bank/partner", isBlocked: false };
    case "Instructed":
      return { role: "Finance Admin / Reconciler", action: "Record actual transfer details and Mark Reconciled", isBlocked: false };
    case "Checker Rejected":
      return { role: "Release Maker", action: "Review rejection reason and resubmit or cancel", isBlocked: true };
    case "Completed":
      return { role: "—", action: "Settlement fully reconciled — no further action required", isBlocked: false };
    case "Cancelled":
      return { role: "—", action: "Release instruction cancelled", isBlocked: true };
    default:
      return { role: "Admin", action: "Review release instruction status", isBlocked: false };
  }
}

// ─── Audit action names ───────────────────────────────────────────────────────

export const GOVERNANCE_AUDIT_ACTIONS = {
  submitted:              "release_instruction_submitted_for_checker",
  checker_approved:       "release_checker_approved",
  checker_rejected:       "release_checker_rejected",
  finance_instructed:     "release_finance_instructed",
  settlement_reconciled:  "release_settlement_reconciled_checker",
  violation_detected:     "release_governance_violation_detected",
} as const;

// ─── Nexum Brain context builder ──────────────────────────────────────────────

export function buildGovernanceBrainContext(
  instructions: ReleaseInstructionGovernanceRow[],
  currency: string,
): string {
  const lines: string[] = ["=== Release Governance & Dual Approval ==="];

  if (instructions.length === 0) {
    lines.push("Release Instructions: None on record.");
    lines.push("Can this payment be released? No active release instruction found.");
    return lines.join("\n");
  }

  for (const ri of instructions) {
    const next = nextGovernanceAction(ri);
    lines.push(`\n--- Release Instruction (${ri.release_type}) ---`);
    lines.push(`Amount: ${ri.currency} ${Number(ri.amount).toFixed(2)}`);
    lines.push(`Release Status: ${ri.release_status}`);
    lines.push(`Governance Status: ${ri.governance_status}`);
    lines.push(`Maker (created_by): ${ri.created_by ? ri.created_by.slice(0, 8) + "…" : "Unknown"}`);
    lines.push(`Checker (checked_by): ${ri.checked_by ? ri.checked_by.slice(0, 8) + "…" : "Not yet checked"}`);
    if (ri.checked_at) lines.push(`Checked At: ${ri.checked_at.slice(0, 10)}`);
    if (ri.checker_note) lines.push(`Checker Note: ${ri.checker_note}`);
    if (ri.instructed_by) lines.push(`Finance Instructor: ${ri.instructed_by.slice(0, 8)}…`);
    if (ri.instructed_at) lines.push(`Instructed At: ${ri.instructed_at.slice(0, 10)}`);
    lines.push(`\nGovernance Assessment:`);
    lines.push(`Has release passed maker-checker control? ${ri.governance_status === "Checker Approved" || ri.governance_status === "Instructed" || ri.governance_status === "Completed" ? "YES — checker has approved." : "NO — " + ri.governance_status + "."}`);
    lines.push(`Who needs to approve next? ${next.role} — ${next.action}`);
    lines.push(`Is release blocked? ${next.isBlocked ? "YES — " + ri.governance_status : "No"}`);
    lines.push(`Can this payment be released? ${canFinanceInstruct(ri) ? "YES — governance approved, ready for finance instruction." : isGovernanceComplete(ri) ? "Payment already released and reconciled." : "NO — " + ri.governance_status + "."}`);
    lines.push(`What is blocking release? ${ri.governance_status === "Pending Checker Approval" || ri.governance_status === "Draft" ? "Awaiting checker (different admin) approval." : ri.governance_status === "Checker Rejected" ? `Checker rejected. Reason: ${ri.checker_note ?? "See audit log."} Maker must resubmit.` : ri.governance_status === "Instructed" ? "Finance instruction issued — awaiting settlement reconciliation." : ri.governance_status === "Completed" ? "Nothing — payment fully reconciled." : ri.governance_status === "Checker Approved" ? "Nothing from governance — ready for finance to instruct." : ri.governance_status}`);
    lines.push(`Has settlement been reconciled? ${ri.governance_status === "Completed" ? "YES — settlement reconciled, job financially closed." : "NO — " + ri.governance_status + "."}`);
  }

  return lines.join("\n");
}
