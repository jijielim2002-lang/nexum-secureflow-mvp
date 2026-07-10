// ─── Payment Holding & Controlled Release Library ─────────────────────────────
// Types, helpers, and status maps for the payment holding workflow.
//
// COMPLIANCE NOTE:
//   This module records workflow status only. No real funds are held or
//   transferred. Actual holding and release must go through an approved bank,
//   licensed payment partner, or designated account arrangement.

// ─── Types ────────────────────────────────────────────────────────────────────

export type HoldingStatus =
  | "Awaiting Payment"
  | "Proof Uploaded"
  | "Funds Received"
  | "Payment Secured"
  | "Release Eligible"
  | "Release Approved"
  | "Release Instructed"
  | "Released"
  | "Disputed"
  | "Refund Pending"
  | "Refunded"
  | "Cancelled";

export type ReleaseStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Instructed"
  | "Completed"
  | "Rejected"
  | "Cancelled";

export type ReleaseType =
  | "Deposit Release"
  | "Balance Release"
  | "Full Payment Release"
  | "Partial Release"
  | "Refund"
  | "Other";

export interface HeldPaymentRow {
  id:                        string;
  job_reference:             string;
  payment_obligation_id:     string | null;
  payer_company_id:          string | null;
  payee_company_id:          string | null;
  holding_account_id:        string | null;
  amount:                    number;
  currency:                  string;
  holding_status:            HoldingStatus;
  payment_type:              string | null;   // 'Deposit' | 'Balance' | 'Full Payment'
  payment_reference:         string | null;
  payment_proof_document_id: string | null;
  funds_received_at:         string | null;
  secured_at:                string | null;
  release_eligible_at:       string | null;
  release_approved_at:       string | null;
  release_approved_by:       string | null;
  release_instructed_at:     string | null;
  released_at:               string | null;
  release_note:              string | null;
  dispute_case_id:           string | null;
  created_at:                string;
  updated_at:                string;
}

export interface ReleaseInstructionRow {
  id:               string;
  job_reference:    string;
  held_payment_id:  string | null;
  payee_company_id: string | null;
  amount:           number;
  currency:         string;
  release_type:     ReleaseType;
  release_status:   ReleaseStatus;
  approval_reason:  string | null;
  approved_by:      string | null;
  approved_at:      string | null;
  instructed_by:    string | null;
  instructed_at:    string | null;
  completed_at:     string | null;
  rejection_reason: string | null;
  created_at:       string;
  updated_at:       string;
}

export interface PaymentHoldingAccountRow {
  id:               string;
  account_name:     string;
  account_type:     string;
  currency:         string;
  bank_name:        string | null;
  account_reference: string | null;
  status:           "Active" | "Inactive" | "Pilot Only";
  remarks:          string | null;
  created_at:       string;
  updated_at:       string;
}

// ─── Status badge styles ──────────────────────────────────────────────────────

export const HOLDING_STATUS_BADGE: Record<string, string> = {
  "Awaiting Payment":   "bg-slate-700/50 text-slate-400 border-slate-700",
  "Proof Uploaded":     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Funds Received":     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Payment Secured":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Release Eligible":   "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Release Approved":   "bg-blue-500/15 text-blue-300 border-blue-400/40",
  "Release Instructed": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Released":           "bg-emerald-600/20 text-emerald-300 border-emerald-500/40",
  "Disputed":           "bg-red-500/15 text-red-400 border-red-500/30",
  "Refund Pending":     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Refunded":           "bg-slate-600/40 text-slate-400 border-slate-600",
  "Cancelled":          "bg-slate-800/60 text-slate-600 border-slate-800",
};

export const RELEASE_STATUS_BADGE: Record<string, string> = {
  "Draft":            "bg-slate-700/50 text-slate-500 border-slate-700",
  "Pending Approval": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Approved":         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Instructed":       "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Completed":        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Rejected":         "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":        "bg-slate-700/50 text-slate-500 border-slate-700",
};

// ─── Status helpers ───────────────────────────────────────────────────────────

/** True if provider may proceed with job execution */
export function paymentSecuredForExecution(hp: HeldPaymentRow): boolean {
  return (
    hp.holding_status === "Payment Secured" ||
    hp.holding_status === "Release Eligible" ||
    hp.holding_status === "Release Approved" ||
    hp.holding_status === "Release Instructed" ||
    hp.holding_status === "Released"
  );
}

/** True if a release instruction can be created for this held payment */
export function isReleaseEligible(hp: HeldPaymentRow): boolean {
  return hp.holding_status === "Release Eligible";
}

/** True if release is actively blocked by dispute */
export function isReleaseBlocked(hp: HeldPaymentRow): boolean {
  return hp.holding_status === "Disputed" || hp.holding_status === "Refund Pending";
}

/** Format amount with currency */
export function fmtHeldAmount(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

/** Determine the release type based on payment type */
export function releaseTypeForPayment(paymentType: string | null): ReleaseType {
  switch (paymentType) {
    case "Full Payment": return "Full Payment Release";
    case "Balance":      return "Balance Release";
    default:             return "Deposit Release";
  }
}

// ─── Nexum Brain context builder ──────────────────────────────────────────────

export function buildHoldingBrainContext(
  heldPayments: HeldPaymentRow[],
  releaseInstructions: ReleaseInstructionRow[],
): string {
  if (heldPayments.length === 0) {
    return "No payment holding records found for this job.";
  }

  const lines: string[] = ["=== Payment Holding Status ==="];

  for (const hp of heldPayments) {
    const secured    = paymentSecuredForExecution(hp);
    const blocked    = isReleaseBlocked(hp);
    const relInstr   = releaseInstructions.find((r) => r.held_payment_id === hp.id);

    lines.push(`\n[${hp.payment_type ?? "Payment"}] ${fmtHeldAmount(hp.amount, hp.currency)}`);
    lines.push(`  Status: ${hp.holding_status}`);
    lines.push(`  Payment Secured: ${secured ? "YES — provider may proceed" : "NOT YET"}`);
    lines.push(`  Release Eligible: ${hp.release_eligible_at ? "YES" : "NO"}`);
    lines.push(`  Release Blocked: ${blocked ? "YES — dispute active" : "NO"}`);
    if (hp.dispute_case_id) lines.push(`  Dispute Case ID: ${hp.dispute_case_id}`);
    if (relInstr) {
      lines.push(`  Release Instruction: ${relInstr.release_type} — ${relInstr.release_status}`);
    }
  }

  return lines.join("\n");
}
