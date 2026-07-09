// ─── lib/customerBenchmark.ts — Customer / Buyer Performance Benchmarking v1 ──
//
// COMPLIANCE NOTE:
//   Benchmark scores are internal operational metrics derived from platform data.
//   They are NOT a credit rating, financial approval, or legal guarantee.
//   Nexum does not guarantee customer selection or credit decisions.

// ── Types ─────────────────────────────────────────────────────────────────────

export type CustomerGrade = "A" | "B" | "C" | "D" | "Watchlist";

export interface CustomerBenchmarkRow {
  id:                                       string;
  customer_company_id:                      string;
  customer_name:                            string | null;

  total_jobs:                               number;
  completed_jobs:                           number;
  active_jobs:                              number;

  average_job_value:                        number | null;
  total_secured_value:                      number | null;

  average_payment_proof_upload_time_hours:  number | null;
  average_payment_reconciliation_time_hours: number | null;
  average_delivery_confirmation_time_hours: number | null;

  auto_confirmation_rate:                   number | null;
  dispute_rate:                             number | null;
  payment_dispute_rate:                     number | null;
  overdue_payment_rate:                     number | null;

  document_completeness_score:              number | null;
  payment_behavior_score:                   number | null;
  receipt_confirmation_score:               number | null;
  communication_responsiveness_score:       number | null;

  overall_customer_score:                   number | null;
  customer_grade:                           CustomerGrade;

  recommended_payment_terms:                string | null;
  recommended_deposit_percentage:           number | null;
  risk_note:                                string | null;

  last_calculated_at:                       string | null;
  created_at:                               string;
  updated_at:                               string;
}

// ── Score weights ─────────────────────────────────────────────────────────────

export const CUSTOMER_BENCHMARK_WEIGHTS = {
  payment_behavior:             0.40,
  receipt_confirmation:         0.20,
  document_completeness:        0.20,
  communication_responsiveness: 0.20,
} as const;

// ── Score computation ─────────────────────────────────────────────────────────

export function computeCustomerOverallScore(b: {
  payment_behavior_score:             number | null;
  receipt_confirmation_score:         number | null;
  document_completeness_score:        number | null;
  communication_responsiveness_score: number | null;
}): number {
  const pb = b.payment_behavior_score             ?? 70;
  const rc = b.receipt_confirmation_score         ?? 70;
  const dc = b.document_completeness_score        ?? 50;
  const cr = b.communication_responsiveness_score ?? 70;

  const raw =
    pb * CUSTOMER_BENCHMARK_WEIGHTS.payment_behavior +
    rc * CUSTOMER_BENCHMARK_WEIGHTS.receipt_confirmation +
    dc * CUSTOMER_BENCHMARK_WEIGHTS.document_completeness +
    cr * CUSTOMER_BENCHMARK_WEIGHTS.communication_responsiveness;

  return Math.round(raw * 10) / 10;
}

// ── Grade thresholds ──────────────────────────────────────────────────────────

export function computeCustomerGrade(
  score:        number,
  disputeRate:  number | null,
  overdueRate:  number | null,
): CustomerGrade {
  const dr = disputeRate ?? 0;
  const or = overdueRate ?? 0;

  // Force Watchlist on critical thresholds regardless of score
  if (score < 45 || dr > 30 || or > 30) return "Watchlist";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "Watchlist";
}

// ── Recommended deposit % ─────────────────────────────────────────────────────

export function recommendedDepositPct(grade: CustomerGrade): number {
  const map: Record<CustomerGrade, number> = {
    "A":         20,
    "B":         25,
    "C":         30,
    "D":         50,
    "Watchlist": 100,
  };
  return map[grade];
}

export function recommendedPaymentTerms(grade: CustomerGrade): string {
  const map: Record<CustomerGrade, string> = {
    "A":         "Net 30 after delivery — lower deposit eligible (20%)",
    "B":         "Standard deposit (25%) with balance payable on delivery confirmation",
    "C":         "Standard deposit required (30%) per Nexum standard terms",
    "D":         "Elevated deposit (50%) required before execution. Monitor closely.",
    "Watchlist": "Full payment required before execution. Do not extend credit. Escalate to admin.",
  };
  return map[grade];
}

// ── Nexum Customer Recommendation ─────────────────────────────────────────────

export type CustomerRecommendationType =
  | "reliable"
  | "low_response"
  | "higher_protection"
  | "watchlist_warning";

export type CustomerRecommendation =
  | { type: CustomerRecommendationType; label: string; color: string }
  | null;

export function computeCustomerRecommendation(b: {
  overall_customer_score:   number | null;
  customer_grade:           CustomerGrade;
  dispute_rate:             number | null;
  payment_dispute_rate:     number | null;
  overdue_payment_rate:     number | null;
  auto_confirmation_rate:   number | null;
}): CustomerRecommendation {
  const grade = b.customer_grade;
  const dr    = b.dispute_rate          ?? 0;
  const pdr   = b.payment_dispute_rate  ?? 0;
  const or    = b.overdue_payment_rate  ?? 0;
  const acr   = b.auto_confirmation_rate ?? 0;

  if (grade === "Watchlist") {
    return {
      type:  "watchlist_warning",
      label: "Watchlist — Full Payment Before Execution",
      color: "text-red-400 bg-red-950/40 border-red-700/40",
    };
  }

  if (pdr > 15 || or > 15 || dr > 20) {
    return {
      type:  "higher_protection",
      label: "Higher Payment Protection Recommended",
      color: "text-amber-400 bg-amber-950/40 border-amber-700/40",
    };
  }

  if ((grade === "A" || grade === "B") && or === 0 && pdr === 0) {
    return {
      type:  "reliable",
      label: "Reliable Customer",
      color: "text-emerald-400 bg-emerald-950/40 border-emerald-700/40",
    };
  }

  if (acr > 30 && dr < 10) {
    return {
      type:  "low_response",
      label: "Low Response — Low Dispute",
      color: "text-blue-400 bg-blue-950/40 border-blue-700/40",
    };
  }

  return null;
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function customerGradeColor(grade: CustomerGrade | string): string {
  const map: Record<string, string> = {
    "A":         "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    "B":         "text-blue-400 border-blue-500/30 bg-blue-500/10",
    "C":         "text-amber-400 border-amber-500/30 bg-amber-500/10",
    "D":         "text-orange-400 border-orange-500/30 bg-orange-500/10",
    "Watchlist": "text-red-400 border-red-500/30 bg-red-500/10",
  };
  return map[grade] ?? "text-slate-400 border-slate-700 bg-slate-800/50";
}

export function customerGradeLabel(grade: CustomerGrade | string): string {
  const map: Record<string, string> = {
    "A":         "Grade A — Excellent",
    "B":         "Grade B — Good",
    "C":         "Grade C — Moderate",
    "D":         "Grade D — Poor",
    "Watchlist": "⚠ Watchlist — High Risk",
  };
  return map[grade] ?? grade;
}

export function customerScoreColor(score: number | null | undefined): string {
  if (score == null) return "text-slate-500";
  if (score >= 85) return "text-emerald-400";
  if (score >= 75) return "text-blue-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 45) return "text-orange-400";
  return "text-red-400";
}

export function fmtCustRate(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export function fmtCustScore(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(1);
}

export function fmtCustHours(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 24) return `${v.toFixed(1)}h`;
  return `${(v / 24).toFixed(1)}d`;
}

export function fmtCustValue(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `RM ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `RM ${(v / 1_000).toFixed(0)}k`;
  return `RM ${v.toFixed(0)}`;
}

// ── Audit actions ──────────────────────────────────────────────────────────────

export const CUSTOMER_BENCHMARK_AUDIT_ACTIONS = {
  calculated:         "customer_benchmark_calculated",
  grade_changed:      "customer_grade_changed",
  terms_recommended:  "customer_payment_terms_recommended",
} as const;
