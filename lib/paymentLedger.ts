"use client";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ObligationType =
  | "Deposit" | "Balance" | "Full Payment"
  | "Additional Charges" | "Refund" | "Other";

export type ObligationStatus =
  | "Pending" | "Proof Uploaded" | "Verified"
  | "Overdue" | "Disputed" | "Waived";

export interface PaymentObligationRow {
  id:                 string;
  job_reference:      string;
  payer_company_id:   string | null;
  payee_company_id:   string | null;
  obligation_type:    ObligationType;
  amount:             number;
  currency:           string;
  due_date:           string | null;   // ISO date "YYYY-MM-DD"
  status:             ObligationStatus;
  proof_document_id:  string | null;
  verified_by:        string | null;
  verified_at:        string | null;
  remarks:            string | null;
  created_at:         string;
  updated_at:         string;
}

export interface PaymentLedgerEventRow {
  id:                    string;
  payment_obligation_id: string;
  job_reference:         string;
  event_type:            string | null;
  event_description:     string | null;
  amount:                number | null;
  currency:              string | null;
  actor_role:            string | null;
  actor_user_id:         string | null;
  created_at:            string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

/** Apply client-side aging: if due_date < today and not Verified/Waived → Overdue */
export function applyAging(obs: PaymentObligationRow[]): PaymentObligationRow[] {
  const today = new Date().toISOString().split("T")[0];
  return obs.map((o) => {
    if (
      o.due_date &&
      o.due_date < today &&
      o.status !== "Verified" &&
      o.status !== "Waived"
    ) {
      return { ...o, status: "Overdue" as ObligationStatus };
    }
    return o;
  });
}

/** Total outstanding (not Verified, not Waived) */
export function calcOutstanding(obs: PaymentObligationRow[]): number {
  return obs
    .filter((o) => o.status !== "Verified" && o.status !== "Waived")
    .reduce((s, o) => s + Number(o.amount), 0);
}

/** Whether the provider can proceed (deposit / full payment verified) */
export function canProviderProceed(obs: PaymentObligationRow[]): boolean {
  const fullPay = obs.find((o) => o.obligation_type === "Full Payment");
  if (fullPay) return fullPay.status === "Verified";
  const deposit = obs.find((o) => o.obligation_type === "Deposit");
  if (deposit) return deposit.status === "Verified";
  return false;
}

/** All non-waived obligations verified → fully paid */
export function isFullyPaid(obs: PaymentObligationRow[]): boolean {
  const effective = obs.filter((o) => o.status !== "Waived");
  return effective.length > 0 && effective.every((o) => o.status === "Verified");
}

// ─── Style maps ───────────────────────────────────────────────────────────────

export const STATUS_BADGE: Record<ObligationStatus, string> = {
  "Pending":        "border-slate-600 bg-slate-800/80 text-slate-500",
  "Proof Uploaded": "border-amber-500/40 bg-amber-500/15 text-amber-300",
  "Verified":       "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  "Overdue":        "border-red-500/40 bg-red-500/15 text-red-300",
  "Disputed":       "border-red-700/50 bg-red-800/25 text-red-300 font-bold",
  "Waived":         "border-slate-700 bg-slate-800/40 text-slate-600 line-through",
};

export const TYPE_ICON: Record<ObligationType, string> = {
  "Deposit":           "🔒",
  "Balance":           "⚖",
  "Full Payment":      "💰",
  "Additional Charges":"➕",
  "Refund":            "↩",
  "Other":             "📋",
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchObligations(jobReference: string): Promise<PaymentObligationRow[]> {
  const { data } = await supabase
    .from("payment_obligations")
    .select("*")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: true });
  return applyAging((data ?? []) as PaymentObligationRow[]);
}

export async function fetchLedgerEvents(
  obligationId: string
): Promise<PaymentLedgerEventRow[]> {
  const { data } = await supabase
    .from("payment_ledger_events")
    .select("*")
    .eq("payment_obligation_id", obligationId)
    .order("created_at", { ascending: false });
  return (data ?? []) as PaymentLedgerEventRow[];
}
