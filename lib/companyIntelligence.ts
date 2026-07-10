import { supabase } from "./supabaseClient";
import { insertAuditLog } from "./auditLog";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinancingReadiness = "Not Ready" | "Monitor" | "Eligible" | "Priority";
export type RiskLevel          = "Low" | "Medium" | "High" | "Critical";
export type Trend              = "Improving" | "Stable" | "Deteriorating";

export interface CompanyIntelligenceRow {
  id:                            string;
  company_id:                    string;
  company_name:                  string | null;
  company_type:                  string | null;
  total_jobs:                    number;
  completed_jobs:                number;
  active_jobs:                   number;
  disputed_jobs:                 number;
  open_exceptions:               number;
  critical_exceptions:           number;
  avg_payment_confirmation_days: number | null;
  avg_execution_completion_days: number | null;
  on_time_completion_rate:       number | null;
  document_completeness_score:   number | null;
  payment_behavior_score:        number | null;
  operational_reliability_score: number | null;
  overall_trust_score:           number | null;
  financing_readiness:           FinancingReadiness;
  risk_level:                    RiskLevel;
  trend:                         Trend;
  recommended_terms:             string | null;
  last_calculated_at:            string | null;
  created_at:                    string;
  updated_at:                    string;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

export const RISK_BADGE: Record<RiskLevel, string> = {
  Low:      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Medium:   "border-amber-500/30  bg-amber-500/10  text-amber-400",
  High:     "border-red-500/30    bg-red-500/10    text-red-400",
  Critical: "border-red-700/50    bg-red-800/25    text-red-300 font-bold",
};

export const FINANCING_BADGE: Record<FinancingReadiness, string> = {
  Priority:  "border-purple-500/40 bg-purple-500/15 text-purple-300 font-semibold",
  Eligible:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Monitor:   "border-amber-500/30  bg-amber-500/10  text-amber-400",
  "Not Ready": "border-red-500/30  bg-red-500/10    text-red-400",
};

export const TREND_ICON: Record<Trend, string> = {
  Improving:    "↑",
  Stable:       "→",
  Deteriorating: "↓",
};

export const TREND_COLOR: Record<Trend, string> = {
  Improving:    "text-emerald-400",
  Stable:       "text-slate-400",
  Deteriorating: "text-red-400",
};

// ─── Score helpers ────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function deriveRiskLevel(score: number, criticalExceptions: number): RiskLevel {
  if (score < 40)                              return "Critical";
  if (score < 60 || criticalExceptions > 0)   return "High";
  if (score < 80)                              return "Medium";
  return "Low";
}

function deriveFinancingReadiness(
  score: number,
  completedJobs: number,
  criticalExceptions: number,
): FinancingReadiness {
  if (criticalExceptions > 0 || score < 55) return "Not Ready";
  if (score >= 85 && completedJobs >= 3)    return "Priority";
  if (score >= 75)                          return "Eligible";
  return "Monitor";
}

function deriveRecommendedTerms(readiness: FinancingReadiness): string {
  switch (readiness) {
    case "Priority":
      return "Preferred rates. Up to 90-day payment terms. Priority service allocation.";
    case "Eligible":
      return "Standard rates. Up to 60-day payment terms. Regular service queue.";
    case "Monitor":
      return "Upfront deposit required. 30-day payment terms. Enhanced monitoring on all jobs.";
    case "Not Ready":
      return "Full upfront payment required. No credit terms. Elevated document scrutiny.";
  }
}

// ─── Main calculation ─────────────────────────────────────────────────────────

export async function calculateCompanyIntelligence(
  companyId:   string,
  companyName: string,
  companyType: string,
  actorId?:    string,
  actorName?:  string,
): Promise<{ data?: CompanyIntelligenceRow; error?: string }> {

  // 1. Fetch all jobs for this company
  const { data: jobs, error: jobErr } = await supabase
    .from("secured_jobs")
    .select("job_reference, job_status, payment_status, created_at, updated_at")
    .or(`service_provider_company_id.eq.${companyId},customer_company_id.eq.${companyId}`);

  if (jobErr) return { error: jobErr.message };

  const allJobs   = jobs ?? [];
  const jobRefs   = allJobs.map((j) => j.job_reference as string);

  const totalJobs     = allJobs.length;
  const completedJobs = allJobs.filter((j) => j.job_status === "Completed").length;
  const activeJobs    = allJobs.filter((j) => j.job_status !== "Completed" && j.job_status !== "Cancelled").length;
  const disputedJobs  = allJobs.filter((j) => j.job_status === "Disputed" || j.payment_status === "Disputed").length;

  // 2. Fetch exceptions
  let exceptions: Array<{ severity: string; status: string; exception_type: string }> = [];
  if (jobRefs.length > 0) {
    const { data: exData } = await supabase
      .from("job_exceptions")
      .select("severity, status, exception_type")
      .in("job_reference", jobRefs);
    exceptions = exData ?? [];
  }

  const activeExceptions    = exceptions.filter((e) => e.status !== "Resolved" && e.status !== "Closed");
  const openExceptions      = activeExceptions.length;
  const criticalExceptions  = activeExceptions.filter((e) => e.severity === "Critical").length;
  const paymentDisputes     = activeExceptions.filter((e) => e.exception_type === "Customer Dispute" || e.exception_type === "Payment Issue").length;
  const providerDelays      = activeExceptions.filter((e) => e.exception_type === "Provider Delay").length;
  const missingDocExceptions = activeExceptions.filter((e) => e.exception_type === "Missing Document").length;
  const highSeverityOpen    = activeExceptions.filter((e) => e.severity === "High" || e.severity === "Critical").length;

  // 3. Fetch documents
  let documents: Array<{ document_type: string; job_reference: string }> = [];
  if (jobRefs.length > 0) {
    const { data: docData } = await supabase
      .from("documents")
      .select("document_type, job_reference")
      .in("job_reference", jobRefs);
    documents = docData ?? [];
  }

  const criticalDocTypes = new Set(["Commercial Invoice", "Bill of Lading", "Payment Slip", "Packing List"]);
  const jobsWithCriticalDocs = new Set(
    documents
      .filter((d) => criticalDocTypes.has(d.document_type))
      .map((d) => d.job_reference),
  );

  // 4. Compute payment behavior score
  //    Base 70, +5 per fully-paid completed job (cap 100), -10 per dispute, -5 per payment issue
  const fullyPaidCompleted = allJobs.filter(
    (j) => j.payment_status === "Fully Paid" && j.job_status === "Completed",
  ).length;
  const paymentBehaviorScore = clamp(
    70 + fullyPaidCompleted * 5 - paymentDisputes * 10,
  );

  // 5. Compute operational reliability score
  //    Base 70, +5 per completed job (cap 100), -10 per provider delay, -5 per high/critical open exception
  const operationalReliabilityScore = clamp(
    70 + completedJobs * 5 - providerDelays * 10 - highSeverityOpen * 5,
  );

  // 6. Compute document completeness score
  //    Base 70, +5 per job that has critical docs, -5 per missing-doc exception
  const docScore = clamp(
    70 + jobsWithCriticalDocs.size * 5 - missingDocExceptions * 5,
  );

  // 7. Overall trust
  const overallTrustScore = Math.round(
    (paymentBehaviorScore + operationalReliabilityScore + docScore) / 3,
  );

  // 8. Derived fields
  const riskLevel          = deriveRiskLevel(overallTrustScore, criticalExceptions);
  const financingReadiness = deriveFinancingReadiness(overallTrustScore, completedJobs, criticalExceptions);
  const recommendedTerms   = deriveRecommendedTerms(financingReadiness);

  // 9. Trend: compare against previous stored score (if any)
  const { data: existing } = await supabase
    .from("company_intelligence_profiles")
    .select("overall_trust_score")
    .eq("company_id", companyId)
    .maybeSingle();

  let trend: Trend = "Stable";
  if (existing?.overall_trust_score != null) {
    const delta = overallTrustScore - (existing.overall_trust_score as number);
    if (delta >= 5)       trend = "Improving";
    else if (delta <= -5) trend = "Deteriorating";
  }

  // 10. On-time completion rate (simple: completed / total if total > 0)
  const onTimeCompletionRate = totalJobs > 0
    ? Math.round((completedJobs / totalJobs) * 100)
    : null;

  const now = new Date().toISOString();

  // 11. Upsert
  const payload = {
    company_id:                    companyId,
    company_name:                  companyName,
    company_type:                  companyType,
    total_jobs:                    totalJobs,
    completed_jobs:                completedJobs,
    active_jobs:                   activeJobs,
    disputed_jobs:                 disputedJobs,
    open_exceptions:               openExceptions,
    critical_exceptions:           criticalExceptions,
    avg_payment_confirmation_days: null,
    avg_execution_completion_days: null,
    on_time_completion_rate:       onTimeCompletionRate,
    document_completeness_score:   docScore,
    payment_behavior_score:        paymentBehaviorScore,
    operational_reliability_score: operationalReliabilityScore,
    overall_trust_score:           overallTrustScore,
    financing_readiness:           financingReadiness,
    risk_level:                    riskLevel,
    trend,
    recommended_terms:             recommendedTerms,
    last_calculated_at:            now,
    updated_at:                    now,
  };

  const { data: upserted, error: upsertErr } = await supabase
    .from("company_intelligence_profiles")
    .upsert(payload, { onConflict: "company_id" })
    .select()
    .single();

  if (upsertErr) return { error: upsertErr.message };

  // 12. Audit log — fire-and-forget; no job_reference context so we log against company
  if (actorId || actorName) {
    insertAuditLog({
      job_reference: `COMPANY:${companyId}`,
      actor_role:    "admin",
      actor_name:    actorName ?? "Nexum Admin",
      action:        "company_intelligence_recalculated",
      description:   `Company intelligence recalculated for ${companyName}. Overall trust score: ${overallTrustScore}. Risk: ${riskLevel}. Financing: ${financingReadiness}.`,
      metadata:      { companyId, overallTrustScore, riskLevel, financingReadiness, trend },
    }).catch(() => {});
  }

  return { data: upserted as CompanyIntelligenceRow };
}
