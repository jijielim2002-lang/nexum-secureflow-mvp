// ─── Delivery Confirmation Library ────────────────────────────────────────────
// Types, helpers, and working-hours calculator for the delivery receipt
// confirmation layer. No real payment disbursement occurs here.

export type DeliveryConfirmationStatus =
  | "Not Required"
  | "Pending Customer Confirmation"
  | "Confirmed by Customer"
  | "Auto Confirmed"
  | "Disputed";

export type DeliveryConfirmationRowStatus =
  | "Pending"
  | "Confirmed"
  | "Auto Confirmed"
  | "Disputed"
  | "Expired";

export interface DeliveryConfirmationRow {
  id:               string;
  job_reference:    string;
  customer_company_id: string | null;
  provider_company_id: string | null;
  pod_document_id:  string | null;
  status:           DeliveryConfirmationRowStatus;
  requested_at:     string;
  due_at:           string;
  responded_at:     string | null;
  responded_by:     string | null;
  response_note:    string | null;
  dispute_reason:   string | null;
  auto_confirmed_at: string | null;
  created_at:       string;
  updated_at:       string;
}

// ─── Working Hours Calculator ─────────────────────────────────────────────────
// "48 working hours" = skip weekends. We treat Mon–Fri as working days.
// Time is added in calendar hours but skipping over weekends.

/**
 * Add N working hours to a starting Date.
 * Skips Saturday (6) and Sunday (0).
 * Assumes working day = 24h (trade finance context — global time zones).
 * Returns a new Date.
 */
export function addWorkingHours(start: Date, hours: number): Date {
  const result = new Date(start.getTime());
  let remaining = hours;

  while (remaining > 0) {
    result.setHours(result.getHours() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      remaining--;
    }
  }

  return result;
}

/**
 * Calculate due_at for a new delivery confirmation.
 * Default: 48 working hours from now.
 */
export function calcDueAt(from: Date = new Date(), workingHours = 48): Date {
  return addWorkingHours(from, workingHours);
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function isOverdue(row: DeliveryConfirmationRow): boolean {
  return row.status === "Pending" && new Date(row.due_at) < new Date();
}

export function isDueSoon(row: DeliveryConfirmationRow, withinHours = 6): boolean {
  if (row.status !== "Pending") return false;
  const due = new Date(row.due_at);
  const now = new Date();
  const diffHours = (due.getTime() - now.getTime()) / 3_600_000;
  return diffHours > 0 && diffHours <= withinHours;
}

export function hoursRemaining(row: DeliveryConfirmationRow): number {
  return (new Date(row.due_at).getTime() - Date.now()) / 3_600_000;
}

export function fmtCountdown(row: DeliveryConfirmationRow): string {
  const hrs = hoursRemaining(row);
  if (hrs <= 0) return "Overdue";
  if (hrs < 1) return `${Math.floor(hrs * 60)} min remaining`;
  if (hrs < 24) return `${Math.floor(hrs)}h remaining`;
  return `${Math.floor(hrs / 24)}d ${Math.floor(hrs % 24)}h remaining`;
}

// ─── Payment path helpers ─────────────────────────────────────────────────────

export function isFullPaymentJob(paymentTerms: string, requiredDeposit: number | null, jobValue: number): boolean {
  return (
    paymentTerms.toLowerCase().includes("full payment") ||
    (requiredDeposit !== null && requiredDeposit >= jobValue)
  );
}

/**
 * After delivery is confirmed (by customer or auto), determine the next
 * payment_status and job_status transitions.
 */
export function postConfirmationUpdate(
  isFullPay: boolean,
): {
  payment_status?: string;
  job_status: string;
  current_milestone: string;
} {
  if (isFullPay) {
    return {
      job_status:        "Completed",
      current_milestone: "Job Closed",
    };
  }
  // Partial: receipt is confirmed → balance becomes payable.
  // "Receipt Confirmed" is the canonical milestone; payment_status drives the
  // upload banner on the customer page.
  return {
    payment_status:    "Balance Pending",
    job_status:        "Delivery Confirmed",
    current_milestone: "Receipt Confirmed",
  };
}

// ─── Status badge styling ─────────────────────────────────────────────────────

export const DC_STATUS_BADGE: Record<string, string> = {
  "Pending":                       "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Confirmed":                     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Auto Confirmed":                 "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Disputed":                      "bg-red-500/15 text-red-400 border-red-500/30",
  "Expired":                       "bg-slate-700/50 text-slate-400 border-slate-700",
  "Not Required":                  "bg-slate-700/50 text-slate-400 border-slate-700",
  "Pending Customer Confirmation": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Confirmed by Customer":         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};
