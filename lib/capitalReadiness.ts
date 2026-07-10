// ─── Types ────────────────────────────────────────────────────────────────────

export type AssessmentType =
  | "Customer Trade Credit"
  | "Provider Receivable Financing"
  | "Supplier Deposit Support"
  | "Working Capital"
  | "Membership Upgrade"
  | "Other";

export type ReadinessStatus = "Not Ready" | "Monitor" | "Eligible" | "Priority";

export const ASSESSMENT_TYPES: AssessmentType[] = [
  "Customer Trade Credit",
  "Provider Receivable Financing",
  "Supplier Deposit Support",
  "Working Capital",
  "Membership Upgrade",
  "Other",
];

export const STATUS_CONFIG: Record<
  ReadinessStatus,
  { badge: string; score: string; dot: string }
> = {
  Priority:  { badge: "border-purple-500/40 bg-purple-500/15 text-purple-300",   score: "text-purple-400", dot: "bg-purple-400" },
  Eligible:  { badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300", score: "text-emerald-400", dot: "bg-emerald-400" },
  Monitor:   { badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",       score: "text-amber-400",  dot: "bg-amber-400" },
  "Not Ready": { badge: "border-red-500/30 bg-red-500/10 text-red-400",           score: "text-red-400",   dot: "bg-red-500" },
};

export interface CapitalReadinessRow {
  id:                     string;
  job_reference:          string | null;
  company_id:             string | null;
  company_name:           string | null;
  assessment_type:        AssessmentType;
  readiness_status:       ReadinessStatus;
  readiness_score:        number;
  max_recommended_amount: number | null;
  currency:               string;
  suggested_tenure_days:  number | null;
  suggested_pricing_note: string | null;
  key_strengths:          string | null;
  key_risks:              string | null;
  required_conditions:    string | null;
  source_summary:         Record<string, unknown> | null;
  assessed_by:            string | null;
  assessed_at:            string;
  created_at:             string;
  updated_at:             string;
}

// ─── Scoring input ────────────────────────────────────────────────────────────

export interface CapitalScoringInput {
  assessmentType: AssessmentType;
  currency:       string;
  paymentObligations: Array<{
    status:          string;
    amount:          number;
    obligation_type: string;
    due_date:        string | null;
  }>;
  jobs: Array<{
    job_status:     string;
    payment_status: string;
    job_value:      number;
    created_at:     string;
  }>;
  companyIntelligence: {
    overall_trust_score:           number | null;
    payment_behavior_score:        number | null;
    operational_reliability_score: number | null;
    risk_level:                    string;
    trend:                         string;
    financing_readiness:           string;
  } | null;
  documents: Array<{ document_type: string }>;
  tip: {
    overall_trade_risk: string | null;
    route_risk_level:   string | null;
    payment_risk_level: string | null;
  } | null;
  shipment: { delay_days: number; tracking_status: string } | null;
  membership: { status: string; plan: string | null } | null;
  exceptions: Array<{ severity: string; status: string }>;
  businessContext: {
    margin_percentage:    number | null;
    inventory_days_cover: number | null;
    confirmed_order:      boolean | null;
    supply_disruption_risk: string;
  } | null;
}

export interface ScoringBreakdown {
  factor: string;
  delta:  number;
  reason: string;
}

export interface CapitalScoringResult {
  score:                number;
  readinessStatus:      ReadinessStatus;
  maxRecommendedAmount: number | null;
  suggestedTenureDays:  number | null;
  suggestedPricingNote: string | null;
  keyStrengths:         string[];
  keyRisks:             string[];
  requiredConditions:   string[];
  sourceSummary:        Record<string, unknown>;
  scoringBreakdown:     ScoringBreakdown[];
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

export function runCapitalReadinessScoring(input: CapitalScoringInput): CapitalScoringResult {
  let score = 50;
  const breakdown: ScoringBreakdown[] = [];
  const strengths:  string[] = [];
  const risks:      string[] = [];
  const conditions: string[] = [];

  function apply(delta: number, factor: string, reason: string) {
    score += delta;
    breakdown.push({ factor, delta, reason });
    if (delta > 0) strengths.push(reason);
    if (delta < 0) risks.push(reason);
  }

  // ── 1. Active membership ──────────────────────────────────────────────────
  if (input.membership?.status === "Active") {
    apply(+15, "membership",
      `Active ${input.membership.plan ?? "Nexum"} membership — verified partner relationship`);
  } else {
    conditions.push("Maintain an active Nexum membership before financing is considered.");
  }

  // ── 2. Completed jobs track record ────────────────────────────────────────
  const completedJobs = input.jobs.filter((j) => j.job_status === "Completed");
  if (completedJobs.length >= 3) {
    apply(+10, "completed_jobs",
      `${completedJobs.length} completed jobs on Nexum — strong operational track record`);
  } else if (completedJobs.length === 0) {
    conditions.push("Complete at least one secured job on the Nexum platform.");
  } else {
    conditions.push(
      `${completedJobs.length} completed job(s). Target ≥3 for Eligible status.`
    );
  }

  // ── 3. Payment obligations ────────────────────────────────────────────────
  const obs     = input.paymentObligations;
  const today   = new Date().toISOString().split("T")[0];
  const overdue = obs.filter(
    (o) => o.status === "Overdue" ||
           (o.status === "Pending" && o.due_date != null && o.due_date < today)
  );
  const disputed    = obs.filter((o) => o.status === "Disputed");
  const verified    = obs.filter((o) => o.status === "Verified");
  const allVerified = obs.length > 0 && obs.every((o) => ["Verified", "Waived"].includes(o.status));

  if (allVerified) {
    apply(+10, "payment_verification", "All payment obligations fully verified — zero outstanding");
  }
  if (overdue.length > 0) {
    apply(-15, "overdue_payment",
      `${overdue.length} overdue obligation(s) — payment reliability concern`);
    conditions.push("Clear all overdue payment obligations before financing.");
  }
  if (disputed.length > 0) {
    apply(-20, "disputed_payment",
      `${disputed.length} disputed payment(s) — payment integrity risk`);
    conditions.push("Resolve all payment disputes before financing is considered.");
  }

  // ── 4. Document completeness ──────────────────────────────────────────────
  const docTypes    = input.documents.map((d) => d.document_type.toLowerCase());
  const hasInvoice  = docTypes.some((d) => d.includes("invoice"));
  const hasBL       = docTypes.some((d) =>
    d.includes("bill of lading") || d.includes("airway bill") || d === "bl" || d.includes(" bl"));
  const hasPOD      = docTypes.some((d) =>
    d.includes("proof of delivery") || d.includes("pod") || d.includes("delivery note"));
  const hasPayProof = docTypes.some((d) =>
    d.includes("payment") || d.includes("deposit") || d.includes("receipt") || d.includes("proof"));
  const docScore    = [hasInvoice, hasBL, hasPOD, hasPayProof].filter(Boolean).length;

  if (docScore >= 3) {
    apply(+10, "documents",
      `Strong document completeness — ${docScore}/4 key document types on file`);
  } else if (docScore === 0) {
    conditions.push("Upload key trade documents: Invoice, Bill of Lading, Proof of Delivery, Payment Proof.");
  } else {
    const missing = [
      !hasInvoice  && "Invoice",
      !hasBL       && "Bill of Lading",
      !hasPOD      && "Proof of Delivery",
      !hasPayProof && "Payment Proof",
    ].filter(Boolean).join(", ");
    conditions.push(`Improve document completeness (${docScore}/4). Missing: ${missing}.`);
  }

  // ── 5. Company intelligence ───────────────────────────────────────────────
  const ci = input.companyIntelligence;
  if (ci) {
    const ts = ci.overall_trust_score;
    if (ts != null && ts >= 80) {
      apply(+10, "trust_score", `Company trust score ${ts}/100 — high reliability rating`);
    } else if (ts != null && ts < 60) {
      risks.push(`Company trust score ${ts}/100 — below 60 threshold, indicating reliability concerns.`);
    }
    if (ci.risk_level === "High") {
      apply(-20, "risk_level_high", "Company risk level: High — financing requires elevated scrutiny");
    } else if (ci.risk_level === "Critical") {
      apply(-30, "risk_level_critical", "Company risk level: Critical — financing not recommended currently");
      conditions.push("Reduce company risk level from Critical before financing.");
    }
  } else {
    conditions.push("Run Company Intelligence assessment to generate trust and risk scores.");
  }

  // ── 6. Open critical exceptions ───────────────────────────────────────────
  const openCritical = input.exceptions.filter(
    (e) => e.severity === "Critical" && !["Resolved", "Dismissed", "Closed"].includes(e.status)
  );
  if (openCritical.length === 0) {
    apply(+5, "exceptions", "No open critical exceptions — operational integrity confirmed");
  } else {
    risks.push(`${openCritical.length} open critical exception(s) unresolved.`);
    conditions.push("Resolve all critical exceptions before financing is unlocked.");
  }

  // ── 7. Margin percentage ──────────────────────────────────────────────────
  const marginPct = input.businessContext?.margin_percentage ?? null;
  if (marginPct != null && marginPct < 10) {
    apply(-10, "margin",
      `Business margin ${marginPct.toFixed(1)}% is below 10% — profitability risk`);
    conditions.push("Improve profit margin above 10% to qualify for higher financing tiers.");
  }

  // ── 8. Shipment delay severity ────────────────────────────────────────────
  const delayDays = input.shipment?.delay_days ?? 0;
  if (delayDays >= 10) {
    apply(-10, "shipment_delay",
      `Critical shipment delay: ${delayDays} days — operational execution risk`);
  }

  // ── Clamp & classify ──────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  let readinessStatus: ReadinessStatus;
  if      (score >= 85) readinessStatus = "Priority";
  else if (score >= 70) readinessStatus = "Eligible";
  else if (score >= 50) readinessStatus = "Monitor";
  else                  readinessStatus = "Not Ready";

  // ── Recommended amount ────────────────────────────────────────────────────
  let maxRecommendedAmount: number | null = null;
  let suggestedTenureDays:  number | null = null;
  let suggestedPricingNote: string | null = null;

  const avgCompletedValue =
    completedJobs.length > 0
      ? completedJobs.reduce((s, j) => s + Number(j.job_value), 0) / completedJobs.length
      : 0;
  const verifiedValue = verified.reduce((s, o) => s + Number(o.amount), 0);

  if (readinessStatus === "Eligible" || readinessStatus === "Priority") {
    switch (input.assessmentType) {
      case "Customer Trade Credit":
        maxRecommendedAmount = Math.round(avgCompletedValue * 1.5);
        suggestedTenureDays  = 60;
        suggestedPricingNote = "Subject to credit review. Indicative: 1.5–2.5% per month on outstanding balance.";
        break;
      case "Provider Receivable Financing":
        maxRecommendedAmount = Math.round(Math.max(verifiedValue, avgCompletedValue) * 0.8);
        suggestedTenureDays  = 45;
        suggestedPricingNote = "Receivable advance at 80% of verified trade value. Indicative: 1.2–2.0% per month.";
        break;
      case "Supplier Deposit Support": {
        const depositOb = obs.find((o) => o.obligation_type === "Deposit");
        maxRecommendedAmount = depositOb
          ? Math.round(Number(depositOb.amount) * 0.9)
          : Math.round(avgCompletedValue * 0.3);
        suggestedTenureDays  = 30;
        suggestedPricingNote = "Deposit bridge financing. Indicative: 1.0–1.8% per month.";
        break;
      }
      case "Working Capital":
        maxRecommendedAmount = Math.round(avgCompletedValue * 2);
        suggestedTenureDays  = 90;
        suggestedPricingNote = "Working capital revolving facility. Indicative: 1.5–3.0% per month.";
        break;
      case "Membership Upgrade":
        maxRecommendedAmount = null;
        suggestedTenureDays  = null;
        suggestedPricingNote = "Membership upgrade assessment — contact Nexum for custom terms.";
        break;
      default:
        maxRecommendedAmount = null;
        suggestedPricingNote = "Contact Nexum for custom financing terms.";
    }
  }

  // ── Source summary (stored in DB) ─────────────────────────────────────────
  const sourceSummary: Record<string, unknown> = {
    completed_jobs:            completedJobs.length,
    total_jobs:                input.jobs.length,
    verified_obligations:      verified.length,
    overdue_obligations:       overdue.length,
    disputed_obligations:      disputed.length,
    doc_completeness_score:    `${docScore}/4`,
    doc_types_found:           { invoice: hasInvoice, bl: hasBL, pod: hasPOD, payment_proof: hasPayProof },
    trust_score:               ci?.overall_trust_score ?? null,
    risk_level:                ci?.risk_level ?? "Unknown",
    membership_status:         input.membership?.status ?? "None",
    membership_plan:           input.membership?.plan ?? null,
    open_critical_exceptions:  openCritical.length,
    margin_pct:                marginPct,
    avg_completed_job_value:   avgCompletedValue,
    shipment_delay_days:       delayDays,
    scoring_breakdown:         breakdown,
  };

  return {
    score,
    readinessStatus,
    maxRecommendedAmount,
    suggestedTenureDays,
    suggestedPricingNote,
    keyStrengths:       strengths,
    keyRisks:           risks,
    requiredConditions: conditions,
    sourceSummary,
    scoringBreakdown:   breakdown,
  };
}
