// =============================================================================
// lib/financeabilityScore.ts
// Job-Level Financeability Score Engine — types, scoring rules, product
// recommendation, pricing bands, and UI helpers.
//
// No Supabase or React imports — safe in API routes and server code.
// =============================================================================

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoreType =
  | "Secured Job"
  | "Procurement Order"
  | "Supplier Protection"
  | "Financing Opportunity"
  | "Release Against POD"
  | "Other";

export type FinanceabilityGrade = "A" | "B" | "C" | "D" | "Not Suitable";

export type FinanceabilityStatus =
  | "Strong"
  | "Reviewable"
  | "Caution"
  | "Not Suitable"
  | "Manual Review Required";

export type FinanceabilityPricingBand =
  | "Low"
  | "Standard"
  | "High"
  | "Manual Review"
  | "No Pricing";

export interface JobFinanceabilityScore {
  id:                       string;
  job_reference:            string | null;
  procurement_reference:    string | null;
  financing_opportunity_id: string | null;
  working_capital_need_id:  string | null;
  company_id:               string | null;
  company_name:             string | null;
  score_type:               ScoreType;
  financeability_score:     number;
  financeability_grade:     FinanceabilityGrade;
  financeability_status:    FinanceabilityStatus;
  recommended_product:      string | null;
  recommended_amount:       number | null;
  currency:                 string;
  suggested_tenure_days:    number | null;
  repayment_source:         string | null;
  repayment_trigger:        string | null;
  key_strengths:            string[] | null;
  key_risks:                string[] | null;
  required_conditions:      string[] | null;
  evidence_summary:         Record<string, unknown> | null;
  pricing_band:             string | null;
  recommended_fee_rate:     number | null;
  calculated_by_system:     boolean;
  calculated_at:            string;
  reviewed_by:              string | null;
  reviewed_at:              string | null;
  review_note:              string | null;
  created_at:               string;
  updated_at:               string;
}

export type JobFinanceabilityScoreInput = Omit<
  JobFinanceabilityScore,
  "id" | "created_at" | "updated_at" | "reviewed_by" | "reviewed_at" | "review_note"
>;

// ─── Scoring context ──────────────────────────────────────────────────────────
//
// Caller builds this from DB data; scoring functions are pure.

export interface FinanceabilityScoreContext {
  // ── Score scope ──────────────────────────────────────────────────────────
  scoreType?:                          ScoreType;
  riskLevel?:                          "Low" | "Medium" | "High" | "Critical";
  currency?:                           string;

  // ── Positive: payment & reconciliation ───────────────────────────────────
  /** Payment is secured and tracked under Nexum workflow */
  isPaymentSecuredUnderNexum?:         boolean;
  /** All payment obligations are verified (no pending/mismatched) */
  isPaymentReconciliationMatched?:     boolean;

  // ── Positive: documentation ───────────────────────────────────────────────
  /** Accepted job terms snapshot exists */
  hasTermsSnapshot?:                   boolean;
  /** Key documents are uploaded and verified (>0 verified docs) */
  hasVerifiedDocuments?:               boolean;
  /** Evidence pack submitted for this job */
  hasEvidencePack?:                    boolean;

  // ── Positive: dispute / delivery ─────────────────────────────────────────
  /** No open disputes — set true when hasOpenDispute is false */
  noOpenDispute?:                      boolean;
  /** Delivery confirmed or POD uploaded and accepted */
  isDeliveryConfirmedOrPODUploaded?:   boolean;

  // ── Positive: repayment ───────────────────────────────────────────────────
  /** Repayment source is identifiable and credible */
  isRepaymentSourceClear?:             boolean;

  // ── Positive: counterparty grades ────────────────────────────────────────
  /** Customer payment behavior grade is A or B */
  customerGradeAorB?:                  boolean;
  /** Provider performance/reliability grade is A or B */
  providerGradeAorB?:                  boolean;
  /** Supplier trust grade is A or B */
  supplierGradeAorB?:                  boolean;
  /** A supplier is involved in this transaction */
  hasSupplier?:                        boolean;

  // ── Positive: trade documentation completeness ───────────────────────────
  /** Incoterm is specified */
  hasIncoterm?:                        boolean;
  /** HS Code is populated */
  hasHsCode?:                          boolean;
  /** Procurement readiness gate status is "Ready" */
  isProcurementReadinessReady?:        boolean;

  // ── Negative: disputes & risks ───────────────────────────────────────────
  /** Open dispute is active on this job/order */
  hasOpenDispute?:                     boolean;
  /** Critical open operational risk exists */
  hasCriticalOperationalRisk?:         boolean;
  /** Release is blocked by an active liability review */
  isReleaseBlockedByLiabilityReview?:  boolean;

  // ── Negative: counterparty flags ─────────────────────────────────────────
  /** Supplier is on Watchlist or Blocked */
  supplierOnWatchlistOrBlocked?:       boolean;
  /** Customer or provider is on Watchlist */
  isCustomerOrProviderOnWatchlist?:    boolean;

  // ── Negative: reconciliation & documents ─────────────────────────────────
  /** Payment obligation has a reconciliation mismatch */
  isPaymentReconciliationMismatched?:  boolean;
  /** Unresolved procurement discrepancy at High or Critical severity */
  hasHighCriticalProcurementDiscrepancy?: boolean;
  /** Active claim reserve exists (not yet released) */
  hasActiveClaimReserve?:              boolean;

  // ── Negative: trade documentation gaps ───────────────────────────────────
  /** HS Code missing on a DDP job or job value >= 50,000 base currency */
  isHsCodeMissingForDdpOrHighValue?:   boolean;
  /** FX rate missing for multi-currency exposure */
  isFxRateMissingForMultiCurrency?:    boolean;

  // ── Negative: repayment & cash-flow ──────────────────────────────────────
  /** Repayment date cannot be determined */
  isRepaymentDateUnclear?:             boolean;
  /** Cash-flow gap confidence is below 60% */
  isCashflowGapConfidenceLow?:         boolean;

  // ── Amount context ────────────────────────────────────────────────────────
  /** Amount from linked financing opportunity */
  financingOpportunityAmount?:         number | null;
  /** Working capital need gap amount (base currency) */
  workingCapitalGapAmount?:            number | null;
  /** Payment secured under Nexum (job value or obligation total) */
  paymentSecuredAmount?:               number | null;
  /** Release eligible amount from net settlement */
  releaseEligibleAmount?:              number | null;
  /** Net settlement release eligible */
  netSettlementReleaseEligible?:       number | null;
  /** Estimated gap days from working capital need */
  estimatedGapDays?:                   number | null;

  // ── Product detection hints ───────────────────────────────────────────────
  hasPODUploaded?:                     boolean;
  hasSupplierAdvanceGap?:              boolean;
  hasSupplierBalanceGap?:              boolean;
  hasCarrierVendorGap?:                boolean;
  hasDutyTaxGap?:                      boolean;
  hasInvoiceReceivable?:               boolean;
  hasPOAndFundingNeeded?:              boolean;
  opportunityType?:                    string | null;
  needType?:                           string | null;

  // ── Repayment context ─────────────────────────────────────────────────────
  repaymentSource?:                    string | null;
  repaymentTrigger?:                   string | null;
}

// ─── Core scoring ─────────────────────────────────────────────────────────────

export function scoreJob(ctx: FinanceabilityScoreContext): number {
  let score = 50;

  // ── Positive factors ────────────────────────────────────────────────────
  if (ctx.isPaymentSecuredUnderNexum)        score += 15;
  if (ctx.isPaymentReconciliationMatched)    score += 10;
  if (ctx.hasTermsSnapshot)                  score += 10;
  if (ctx.hasVerifiedDocuments)              score += 10;
  if (ctx.noOpenDispute)                     score += 10; // only if no dispute (separate from -25 penalty)
  if (ctx.isDeliveryConfirmedOrPODUploaded)  score += 10;
  if (ctx.isRepaymentSourceClear)            score += 10;
  if (ctx.customerGradeAorB)                 score += 10;
  if (ctx.providerGradeAorB)                 score += 10;
  if (ctx.hasSupplier && ctx.supplierGradeAorB) score += 10;
  if (ctx.hasIncoterm && ctx.hasHsCode)      score += 5;
  if (ctx.isProcurementReadinessReady)       score += 5;
  if (ctx.hasEvidencePack)                   score += 5;

  // ── Negative factors ────────────────────────────────────────────────────
  if (ctx.hasOpenDispute)                       score -= 25;
  if (ctx.hasCriticalOperationalRisk)           score -= 25;
  if (ctx.isReleaseBlockedByLiabilityReview)    score -= 20;
  if (ctx.supplierOnWatchlistOrBlocked)         score -= 20;
  if (ctx.isCustomerOrProviderOnWatchlist)      score -= 20;
  if (ctx.isPaymentReconciliationMismatched)    score -= 15;
  if (ctx.hasHighCriticalProcurementDiscrepancy) score -= 15;
  if (ctx.hasActiveClaimReserve)                score -= 15;
  if (ctx.isHsCodeMissingForDdpOrHighValue)     score -= 10;
  if (!ctx.hasIncoterm)                         score -= 10;
  if (ctx.isFxRateMissingForMultiCurrency)      score -= 10;
  if (ctx.isRepaymentDateUnclear)               score -= 10;
  if (ctx.isCashflowGapConfidenceLow)           score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Grade ────────────────────────────────────────────────────────────────────

export function getGrade(score: number): FinanceabilityGrade {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "Not Suitable";
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getStatus(score: number, ctx: FinanceabilityScoreContext): FinanceabilityStatus {
  // Override: manual review required for critical flags
  if (
    ctx.hasOpenDispute ||
    ctx.hasCriticalOperationalRisk ||
    ctx.supplierOnWatchlistOrBlocked ||
    ctx.hasHighCriticalProcurementDiscrepancy
  ) {
    return "Manual Review Required";
  }
  if (score >= 85) return "Strong";
  if (score >= 65) return "Reviewable";
  if (score >= 50) return "Caution";
  return "Not Suitable";
}

// ─── Recommended product ──────────────────────────────────────────────────────

export function recommendProduct(ctx: FinanceabilityScoreContext): string | null {
  // 1. If linked opportunity type — use it directly
  if (ctx.opportunityType) return ctx.opportunityType;

  // 2. If need type — map to opportunity type
  if (ctx.needType) {
    const needMap: Record<string, string> = {
      "Supplier Advance Gap":         "Supplier Advance Financing",
      "Supplier Balance Gap":         "Supplier Balance Financing",
      "Duty / Tax Gap":               "Duty / Tax Financing",
      "Logistics Fee Gap":            "Logistics Working Capital",
      "Carrier / Vendor Payment Gap": "Carrier / Vendor Payment Financing",
      "Inventory Funding Gap":        "Inventory Financing",
      "Receivables Gap":              "Invoice Financing",
      "Release Delay Gap":            "Release Delay Bridge",
      "Claim Reserve Gap":            "Claim Reserve Bridge",
      "FX Timing Gap":                "FX Timing Bridge",
      "Other":                        "Other",
    };
    if (needMap[ctx.needType]) return needMap[ctx.needType];
  }

  // 3. Contextual hints
  if (ctx.hasPODUploaded || ctx.isDeliveryConfirmedOrPODUploaded) {
    return "Release-Against-POD Financing";
  }
  if (ctx.hasSupplierAdvanceGap)  return "Supplier Advance Financing";
  if (ctx.hasSupplierBalanceGap)  return "Supplier Balance Financing";
  if (ctx.hasCarrierVendorGap)    return "Carrier / Vendor Payment Financing";
  if (ctx.hasDutyTaxGap)          return "Duty / Tax Financing";
  if (ctx.hasInvoiceReceivable)   return "Invoice Financing";
  if (ctx.hasPOAndFundingNeeded)  return "Purchase Order Financing";

  // 4. Score type fallback
  switch (ctx.scoreType) {
    case "Release Against POD":    return "Release-Against-POD Financing";
    case "Supplier Protection":    return "Supplier Advance Financing";
    case "Procurement Order":      return "Purchase Order Financing";
    case "Financing Opportunity":  return "Working Capital";
    default:                       return "Logistics Working Capital";
  }
}

// ─── Recommended amount ───────────────────────────────────────────────────────

export function recommendAmount(ctx: FinanceabilityScoreContext, score: number): number | null {
  const grade = getGrade(score);
  if (grade === "Not Suitable") return 0;

  // Take the minimum of available amounts
  const candidates = [
    ctx.financingOpportunityAmount,
    ctx.workingCapitalGapAmount,
    ctx.paymentSecuredAmount,
    ctx.releaseEligibleAmount,
    ctx.netSettlementReleaseEligible,
  ].filter((v): v is number => v != null && v > 0);

  if (candidates.length === 0) return null;
  let amount = Math.min(...candidates);

  // Discount for high risk
  if (ctx.riskLevel === "High")     amount = Math.round(amount * 0.7);   // -30%
  if (ctx.riskLevel === "Critical") amount = Math.round(amount * 0.5);   // -50%

  return amount > 0 ? amount : null;
}

// ─── Suggested tenure ─────────────────────────────────────────────────────────

export function suggestTenure(ctx: FinanceabilityScoreContext, product: string | null): number | null {
  if (ctx.estimatedGapDays != null && ctx.estimatedGapDays > 0) return ctx.estimatedGapDays;

  const tenureMap: Record<string, number> = {
    "Supplier Advance Financing":          60,
    "Supplier Balance Financing":          30,
    "Logistics Working Capital":           21,
    "Carrier / Vendor Payment Financing":  21,
    "Duty / Tax Financing":                30,
    "Invoice Financing":                   60,
    "Purchase Order Financing":            90,
    "Inventory Financing":                120,
    "Release-Against-POD Financing":        7,
    "Release Delay Bridge":               21,
    "Claim Reserve Bridge":               60,
    "FX Timing Bridge":                   14,
    "Working Capital":                    45,
    "Other":                              45,
  };
  return product ? (tenureMap[product] ?? 45) : 45;
}

// ─── Pricing band ─────────────────────────────────────────────────────────────

export function getPricingBand(grade: FinanceabilityGrade): FinanceabilityPricingBand {
  switch (grade) {
    case "A":           return "Low";
    case "B":           return "Standard";
    case "C":           return "High";
    case "D":           return "Manual Review";
    case "Not Suitable": return "No Pricing";
  }
}

// ─── Recommended fee rate ─────────────────────────────────────────────────────
// Returns % per 30 days. null = not suitable.

export function getRecommendedFeeRate(grade: FinanceabilityGrade): number | null {
  switch (grade) {
    case "A":           return 1.25;  // 1.0–1.5% per 30d midpoint
    case "B":           return 2.00;  // 1.5–2.5% per 30d midpoint
    case "C":           return 3.00;  // 2.5–4.0% per 30d
    case "D":           return null;  // Manual Review — no standard rate
    case "Not Suitable": return null;
  }
}

// ─── Key strengths ────────────────────────────────────────────────────────────

export function buildKeyStrengths(ctx: FinanceabilityScoreContext): string[] {
  const s: string[] = [];
  if (ctx.isPaymentSecuredUnderNexum)        s.push("Payment secured under Nexum workflow.");
  if (ctx.isPaymentReconciliationMatched)    s.push("Payment obligations fully reconciled.");
  if (ctx.hasTermsSnapshot)                  s.push("Accepted job terms snapshot exists.");
  if (ctx.hasVerifiedDocuments)              s.push("Key trade documents verified.");
  if (ctx.noOpenDispute)                     s.push("No open disputes — clean payment track.");
  if (ctx.isDeliveryConfirmedOrPODUploaded)  s.push("Delivery confirmed / POD uploaded.");
  if (ctx.isRepaymentSourceClear)            s.push("Clear repayment source identified.");
  if (ctx.customerGradeAorB)                 s.push("Customer payment behavior grade A/B.");
  if (ctx.providerGradeAorB)                 s.push("Provider performance grade A/B.");
  if (ctx.hasSupplier && ctx.supplierGradeAorB) s.push("Supplier trust grade A/B — trusted counterparty.");
  if (ctx.hasIncoterm && ctx.hasHsCode)      s.push("Incoterm and HS Code both complete.");
  if (ctx.isProcurementReadinessReady)       s.push("Procurement readiness gate passed.");
  if (ctx.hasEvidencePack)                   s.push("Evidence pack submitted.");
  return s;
}

// ─── Key risks ────────────────────────────────────────────────────────────────

export function buildKeyRisks(ctx: FinanceabilityScoreContext): string[] {
  const r: string[] = [];
  if (ctx.hasOpenDispute)                       r.push("Open dispute — payment release may be blocked.");
  if (ctx.hasCriticalOperationalRisk)           r.push("Critical operational risk open — requires immediate attention.");
  if (ctx.isReleaseBlockedByLiabilityReview)    r.push("Release blocked by active liability review.");
  if (ctx.supplierOnWatchlistOrBlocked)         r.push("Supplier on Watchlist or Blocked — heightened due diligence required.");
  if (ctx.isCustomerOrProviderOnWatchlist)      r.push("Customer or provider on Watchlist.");
  if (ctx.isPaymentReconciliationMismatched)    r.push("Payment reconciliation mismatch detected.");
  if (ctx.hasHighCriticalProcurementDiscrepancy) r.push("High/Critical procurement discrepancy unresolved.");
  if (ctx.hasActiveClaimReserve)                r.push("Active claim reserve — may reduce net release amount.");
  if (ctx.isHsCodeMissingForDdpOrHighValue)     r.push("HS Code missing for DDP/high-value job — customs risk.");
  if (!ctx.hasIncoterm)                         r.push("Incoterm not specified — trade risk allocation unclear.");
  if (ctx.isFxRateMissingForMultiCurrency)      r.push("FX rate missing — multi-currency exposure unquantified.");
  if (ctx.isRepaymentDateUnclear)               r.push("Repayment date unclear.");
  if (ctx.isCashflowGapConfidenceLow)           r.push("Cash-flow gap confidence below 60% — projection uncertain.");
  return r;
}

// ─── Required conditions ──────────────────────────────────────────────────────

export function buildRequiredConditions(ctx: FinanceabilityScoreContext): string[] {
  const c: string[] = [];
  if (ctx.hasOpenDispute)                       c.push("Resolve open dispute before simulation can proceed.");
  if (ctx.isReleaseBlockedByLiabilityReview)    c.push("Resolve liability review to unblock release.");
  if (ctx.supplierOnWatchlistOrBlocked)         c.push("Update supplier status to Known or Verified, or obtain admin override.");
  if (ctx.isCustomerOrProviderOnWatchlist)      c.push("Remove customer/provider from Watchlist or obtain admin approval.");
  if (ctx.isPaymentReconciliationMismatched)    c.push("Reconcile payment obligations before finalising score.");
  if (ctx.hasHighCriticalProcurementDiscrepancy) c.push("Resolve High/Critical procurement discrepancy.");
  if (ctx.hasActiveClaimReserve)                c.push("Release or settle claim reserve before simulation.");
  if (ctx.isHsCodeMissingForDdpOrHighValue)     c.push("Provide HS Code and customs classification for DDP/high-value job.");
  if (!ctx.hasIncoterm)                         c.push("Confirm Incoterm on the job record.");
  if (ctx.isFxRateMissingForMultiCurrency)      c.push("Provide agreed FX rate for multi-currency transaction.");
  if (ctx.isRepaymentDateUnclear)               c.push("Clarify expected repayment date.");
  if (ctx.isCashflowGapConfidenceLow)           c.push("Refresh cash-flow projection with higher confidence data.");
  if (!ctx.hasVerifiedDocuments)                c.push("Upload and verify key trade documents (invoice, BL/AWB, delivery note).");
  if (!ctx.hasTermsSnapshot)                    c.push("Accept job terms snapshot to establish contractual baseline.");
  return c;
}

// ─── Evidence summary ─────────────────────────────────────────────────────────

export function buildEvidenceSummary(ctx: FinanceabilityScoreContext): Record<string, unknown> {
  return {
    payment_secured:          ctx.isPaymentSecuredUnderNexum   ?? false,
    reconciliation_matched:   ctx.isPaymentReconciliationMatched ?? false,
    terms_snapshot:           ctx.hasTermsSnapshot             ?? false,
    verified_documents:       ctx.hasVerifiedDocuments         ?? false,
    evidence_pack:            ctx.hasEvidencePack              ?? false,
    delivery_confirmed:       ctx.isDeliveryConfirmedOrPODUploaded ?? false,
    no_open_dispute:          ctx.noOpenDispute                ?? false,
    customer_grade_ab:        ctx.customerGradeAorB            ?? false,
    provider_grade_ab:        ctx.providerGradeAorB            ?? false,
    supplier_grade_ab:        ctx.supplierGradeAorB            ?? null,
    incoterm_complete:        ctx.hasIncoterm                  ?? false,
    hs_code_complete:         ctx.hasHsCode                    ?? false,
    procurement_ready:        ctx.isProcurementReadinessReady  ?? null,
  };
}

// ─── Product → simulated_financing_offers.product_type mapping ───────────────

export function mapProductToOfferType(product: string | null): string {
  const map: Record<string, string> = {
    "Supplier Advance Financing":         "Supplier Deposit Support",
    "Supplier Balance Financing":         "Supplier Deposit Support",
    "Logistics Working Capital":          "Provider Receivable Financing",
    "Carrier / Vendor Payment Financing": "Provider Receivable Financing",
    "Duty / Tax Financing":               "Working Capital",
    "Invoice Financing":                  "Provider Receivable Financing",
    "Purchase Order Financing":           "Customer Trade Credit",
    "Inventory Financing":                "Working Capital",
    "Release-Against-POD Financing":      "Provider Receivable Financing",
    "Release Delay Bridge":               "Provider Receivable Financing",
    "Claim Reserve Bridge":               "Working Capital",
    "FX Timing Bridge":                   "Working Capital",
    "Working Capital":                    "Working Capital",
  };
  return product ? (map[product] ?? "Working Capital") : "Working Capital";
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export const SCORE_TYPE_ICONS: Record<ScoreType, string> = {
  "Secured Job":          "🏦",
  "Procurement Order":    "🛒",
  "Supplier Protection":  "🛡",
  "Financing Opportunity":"💡",
  "Release Against POD":  "✅",
  "Other":                "📋",
};

export const GRADE_STYLES: Record<FinanceabilityGrade, string> = {
  "A":           "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "B":           "bg-blue-500/15    text-blue-400    border-blue-500/30",
  "C":           "bg-amber-500/15   text-amber-400   border-amber-500/30",
  "D":           "bg-orange-500/15  text-orange-400  border-orange-500/30",
  "Not Suitable":"bg-red-500/15     text-red-400     border-red-500/30",
};

export const STATUS_STYLES: Record<FinanceabilityStatus, string> = {
  "Strong":                "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Reviewable":            "bg-blue-500/15    text-blue-400    border-blue-500/30",
  "Caution":               "bg-amber-500/15   text-amber-400   border-amber-500/30",
  "Not Suitable":          "bg-red-500/15     text-red-400     border-red-500/30",
  "Manual Review Required":"bg-orange-500/15  text-orange-400  border-orange-500/30",
};

export const SCORE_TYPE_STYLES: Record<ScoreType, string> = {
  "Secured Job":          "bg-blue-500/15    text-blue-400    border-blue-500/30",
  "Procurement Order":    "bg-violet-500/15  text-violet-400  border-violet-500/30",
  "Supplier Protection":  "bg-cyan-500/15    text-cyan-400    border-cyan-500/30",
  "Financing Opportunity":"bg-amber-500/15   text-amber-400   border-amber-500/30",
  "Release Against POD":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Other":                "bg-slate-600/40   text-slate-400   border-slate-600/60",
};

export const ALL_SCORE_TYPES: ScoreType[] = [
  "Secured Job",
  "Procurement Order",
  "Supplier Protection",
  "Financing Opportunity",
  "Release Against POD",
  "Other",
];

export const ALL_GRADES: FinanceabilityGrade[] = ["A", "B", "C", "D", "Not Suitable"];

export const ALL_STATUSES: FinanceabilityStatus[] = [
  "Strong",
  "Reviewable",
  "Caution",
  "Not Suitable",
  "Manual Review Required",
];

export function scoreColor(score: number | null): string {
  if (score == null) return "text-slate-500";
  if (score >= 85)   return "text-emerald-400";
  if (score >= 75)   return "text-blue-400";
  if (score >= 65)   return "text-cyan-400";
  if (score >= 50)   return "text-amber-400";
  return "text-red-400";
}

export function formatScore(score: number | null): string {
  if (score == null) return "—";
  return `${score}/100`;
}

export function formatRecommendedAmount(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  if (amount === 0)   return "Not suitable";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)}`;
}
