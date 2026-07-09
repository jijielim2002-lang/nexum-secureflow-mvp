// ─── lib/providerBenchmark.ts — Provider Performance Benchmarking v1 ─────────
//
// COMPLIANCE NOTE:
//   Benchmark scores are internal operational metrics derived from platform data.
//   They are NOT a certification, financial rating, or legal guarantee of
//   provider performance. Nexum does not guarantee provider selection outcomes.

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReliabilityGrade = "A" | "B" | "C" | "D" | "Watchlist";

export interface ProviderBenchmarkRow {
  id:                                      string;
  provider_company_id:                     string;
  provider_name:                           string | null;

  total_jobs:                              number;
  completed_jobs:                          number;
  active_jobs:                             number;

  average_quote_amount:                    number | null;
  average_deposit_percentage:              number | null;

  average_payment_secured_time_hours:      number | null;
  average_execution_time_hours:            number | null;
  average_pod_upload_time_hours:           number | null;
  average_delivery_confirmation_time_hours: number | null;
  average_release_cycle_time_hours:        number | null;

  on_time_delivery_rate:                   number | null;
  pod_uploaded_rate:                       number | null;
  dispute_rate:                            number | null;
  claim_rate:                              number | null;

  document_quality_score:                  number | null;
  tracking_update_score:                   number | null;
  payment_release_success_rate:            number | null;

  overall_provider_score:                  number | null;
  reliability_grade:                       ReliabilityGrade;
  benchmark_note:                          string | null;

  last_calculated_at:                      string | null;
  created_at:                              string;
  updated_at:                              string;
}

// ── Score weights ─────────────────────────────────────────────────────────────

export const BENCHMARK_WEIGHTS = {
  on_time_delivery:   0.25,
  pod_uploaded:       0.15,
  dispute_inverse:    0.20,  // uses (100 - dispute_rate)
  document_quality:   0.15,
  tracking_update:    0.10,
  payment_release:    0.15,
} as const;

// ── Grade thresholds ──────────────────────────────────────────────────────────

export function computeReliabilityGrade(
  score: number,
  disputeRate: number | null,
  hasCriticalExceptions = false,
): ReliabilityGrade {
  const highDispute = (disputeRate ?? 0) > 30;
  if (score < 45 || highDispute || hasCriticalExceptions) return "Watchlist";
  if (score < 60) return "D";
  if (score < 75) return "C";
  if (score < 85) return "B";
  return "A";
}

export function computeOverallScore(b: {
  on_time_delivery_rate:       number | null;
  pod_uploaded_rate:           number | null;
  dispute_rate:                number | null;
  document_quality_score:      number | null;
  tracking_update_score:       number | null;
  payment_release_success_rate: number | null;
}): number {
  const onTime   = b.on_time_delivery_rate       ?? 50;
  const pod      = b.pod_uploaded_rate            ?? 50;
  const dispute  = b.dispute_rate                ?? 0;
  const docQual  = b.document_quality_score      ?? 50;
  const tracking = b.tracking_update_score       ?? 50;
  const release  = b.payment_release_success_rate ?? 50;

  const score =
    onTime   * BENCHMARK_WEIGHTS.on_time_delivery +
    pod      * BENCHMARK_WEIGHTS.pod_uploaded +
    Math.max(0, 100 - dispute) * BENCHMARK_WEIGHTS.dispute_inverse +
    docQual  * BENCHMARK_WEIGHTS.document_quality +
    tracking * BENCHMARK_WEIGHTS.tracking_update +
    release  * BENCHMARK_WEIGHTS.payment_release;

  return Math.round(score * 10) / 10;
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function gradeColor(grade: ReliabilityGrade): string {
  const map: Record<ReliabilityGrade, string> = {
    "A":         "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    "B":         "text-blue-400 border-blue-500/30 bg-blue-500/10",
    "C":         "text-amber-400 border-amber-500/30 bg-amber-500/10",
    "D":         "text-orange-400 border-orange-500/30 bg-orange-500/10",
    "Watchlist": "text-red-400 border-red-500/30 bg-red-500/10",
  };
  return map[grade] ?? "text-slate-400 border-slate-700 bg-slate-800/50";
}

export function gradeLabel(grade: ReliabilityGrade): string {
  const map: Record<ReliabilityGrade, string> = {
    "A":         "Grade A — Excellent",
    "B":         "Grade B — Good",
    "C":         "Grade C — Acceptable",
    "D":         "Grade D — Poor",
    "Watchlist": "⚠ Watchlist",
  };
  return map[grade] ?? grade;
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-slate-500";
  if (score >= 85) return "text-emerald-400";
  if (score >= 75) return "text-blue-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 45) return "text-orange-400";
  return "text-red-400";
}

export function fmtRate(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export function fmtScore(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(1);
}

export function fmtHours(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 24) return `${v.toFixed(1)}h`;
  return `${(v / 24).toFixed(1)}d`;
}

// ── Nexum Recommendation ──────────────────────────────────────────────────────

export type NexumRecommendation =
  | { type: "best_value";        label: "Best Value";               color: "emerald" }
  | { type: "settlement_ready";  label: "Settlement-Ready";         color: "blue"    }
  | { type: "cheapest_risk";     label: "Cheapest — Elevated Risk"; color: "amber"   }
  | { type: "visibility_risk";   label: "Visibility Risk";          color: "orange"  }
  | { type: "watchlist_warning"; label: "Watchlist Provider";       color: "red"     }
  | null;

export interface QuoteWithBenchmark {
  quotation_reference:        string;
  provider_company_id:        string | null;
  provider_name:              string;
  quoted_amount:              number;
  required_deposit:           number;
  currency:                   string;
  incoterm:                   string | null;
  payment_terms:              string | null;
  validity_until:             string | null;
  benchmark:                  ProviderBenchmarkRow | null;
}

export function computeNexumRecommendation(
  q: QuoteWithBenchmark,
  allQuotes: QuoteWithBenchmark[],
): NexumRecommendation {
  const b = q.benchmark;
  const grade = b?.reliability_grade;

  // Watchlist always flagged first
  if (grade === "Watchlist" || grade === "D") {
    return { type: "watchlist_warning", label: "Watchlist Provider", color: "red" };
  }

  // Find cheapest quote amount
  const minAmount = Math.min(...allQuotes.map((x) => x.quoted_amount));
  const isCheapest = q.quoted_amount === minAmount;
  const within10pct = q.quoted_amount <= minAmount * 1.10;

  // Cheapest but high dispute rate
  if (isCheapest && b && (b.dispute_rate ?? 0) > 20) {
    return { type: "cheapest_risk", label: "Cheapest — Elevated Risk", color: "amber" };
  }

  // Visibility risk: low tracking score
  if (b && (b.tracking_update_score ?? 100) < 40) {
    return { type: "visibility_risk", label: "Visibility Risk", color: "orange" };
  }

  // Best value: grade A/B + within 10% of cheapest
  if ((grade === "A" || grade === "B") && within10pct) {
    return { type: "best_value", label: "Best Value", color: "emerald" };
  }

  // Settlement-ready: strong release success + has payout profile
  if (b && (b.payment_release_success_rate ?? 0) >= 85) {
    return { type: "settlement_ready", label: "Settlement-Ready", color: "blue" };
  }

  return null;
}

export const RECOMMENDATION_COLORS: Record<NonNullable<NexumRecommendation>["color"], string> = {
  emerald: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  blue:    "text-blue-400 border-blue-500/30 bg-blue-500/10",
  amber:   "text-amber-400 border-amber-500/30 bg-amber-500/10",
  orange:  "text-orange-400 border-orange-500/30 bg-orange-500/10",
  red:     "text-red-400 border-red-500/30 bg-red-500/10",
};

// ── Audit actions ──────────────────────────────────────────────────────────────

export const BENCHMARK_AUDIT_ACTIONS = {
  calculated:             "provider_benchmark_calculated",
  grade_changed:          "provider_grade_changed",
  recommendation_generated: "rfq_provider_recommendation_generated",
} as const;
