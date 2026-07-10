// =============================================================================
// lib/financingOpportunity.ts
// Financing Opportunity Engine — types, classification rules, financeability
// scoring, pricing bands, and UI helpers.
//
// No Supabase or React imports — safe in API routes and server code.
// =============================================================================

import type { WorkingCapitalNeed, NeedType } from "@/lib/workingCapital";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpportunityType =
  | "Supplier Advance Financing"
  | "Supplier Balance Financing"
  | "Logistics Working Capital"
  | "Carrier / Vendor Payment Financing"
  | "Duty / Tax Financing"
  | "Invoice Financing"
  | "Purchase Order Financing"
  | "Inventory Financing"
  | "Release-Against-POD Financing"
  | "Release Delay Bridge"
  | "Claim Reserve Bridge"
  | "FX Timing Bridge"
  | "Other";

export type OpportunityStatus =
  | "Detected"
  | "Under Review"
  | "Ready for Simulation"
  | "Simulation Created"
  | "Shared with Capital Partner"
  | "Not Suitable"
  | "Dismissed"
  | "Closed";

export type OpportunityRiskLevel = "Low" | "Medium" | "High" | "Critical";

export type PricingBand =
  | "Strong opportunity"
  | "Reviewable opportunity"
  | "High caution"
  | "Not suitable";

export interface FinancingOpportunity {
  id:                      string;
  opportunity_reference:   string;
  working_capital_need_id: string | null;
  company_id:              string | null;
  company_name:            string | null;
  company_role:            string | null;
  job_reference:           string | null;
  procurement_reference:   string | null;
  supplier_id:             string | null;
  opportunity_type:        OpportunityType;
  opportunity_status:      OpportunityStatus;
  requested_amount:        number | null;
  currency:                string;
  base_currency:           string;
  base_amount:             number | null;
  suggested_tenure_days:   number | null;
  expected_repayment_date: string | null;
  repayment_source:        string | null;
  repayment_trigger:       string | null;
  recommended_security:    string | null;
  supporting_evidence:     Record<string, unknown> | null;
  risk_level:              OpportunityRiskLevel;
  financeability_score:    number | null;
  confidence_score:        number | null;
  pricing_band:            string | null;
  recommended_fee_rate:    number | null;
  rationale:               string | null;
  next_action:             string | null;
  financing_offer_id:      string | null;
  reviewed_by:             string | null;
  reviewed_at:             string | null;
  review_note:             string | null;
  created_at:              string;
  updated_at:              string;
}

export type FinancingOpportunityInput = Omit<
  FinancingOpportunity,
  "id" | "created_at" | "updated_at" | "reviewed_by" | "reviewed_at" | "review_note" | "financing_offer_id"
> & { opportunity_reference: string };

// ─── Scoring context ──────────────────────────────────────────────────────────

export interface FinanceabilityContext {
  /** Payment is secured and tracked under Nexum workflow */
  isPaymentSecuredUnderNexum?: boolean;
  /** All required documents verified */
  hasVerifiedDocuments?:       boolean;
  /** No open disputes on this job/order */
  noOpenDispute?:              boolean;
  /** Repayment source is identifiable and credible */
  repaymentSourceClear?:       boolean;
  /** Customer / provider / supplier benchmark grade is A or B */
  counterpartyGradeAorB?:      boolean;
  /** Accepted job terms snapshot exists */
  hasTermsSnapshot?:           boolean;
  /** Evidence pack exists for this job */
  hasEvidencePack?:            boolean;
  /** Open dispute is active (negates noOpenDispute) */
  hasOpenDispute?:             boolean;
  /** Risk level is Critical */
  isCriticalRisk?:             boolean;
  /** Counterparty (supplier / customer / provider) on watchlist */
  counterpartyOnWatchlist?:    boolean;
  /** Unresolved document discrepancy */
  hasDocumentDiscrepancy?:     boolean;
  /** HS Code or duty/tax missing on DDP job */
  missingHsOrDutyOnDdp?:       boolean;
  /** FX rate missing for multi-currency exposure */
  missingFxRate?:              boolean;
  /** Repayment date is unclear */
  repaymentDateUnclear?:       boolean;
}

// ─── Reference generator ─────────────────────────────────────────────────────

export function generateOpportunityReference(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FOP-${date}-${rand}`;
}

// ─── Need type → Opportunity type mapping ────────────────────────────────────

export const NEED_TO_OPPORTUNITY_TYPES: Record<NeedType, OpportunityType[]> = {
  "Supplier Advance Gap":          ["Supplier Advance Financing"],
  "Supplier Balance Gap":          ["Supplier Balance Financing"],
  "Duty / Tax Gap":                ["Duty / Tax Financing"],
  "Logistics Fee Gap":             ["Logistics Working Capital"],
  "Carrier / Vendor Payment Gap":  ["Carrier / Vendor Payment Financing"],
  "Inventory Funding Gap":         ["Inventory Financing", "Purchase Order Financing"],
  "Receivables Gap":               ["Invoice Financing"],
  "Release Delay Gap":             ["Release Delay Bridge", "Release-Against-POD Financing"],
  "Claim Reserve Gap":             ["Claim Reserve Bridge"],
  "FX Timing Gap":                 ["FX Timing Bridge"],
  "Other":                         ["Other"],
};

// ─── Opportunity type → repayment source and trigger ─────────────────────────

interface RepaymentProfile {
  source:   string;
  trigger:  string;
  security: string;
}

export const REPAYMENT_PROFILES: Record<OpportunityType, RepaymentProfile> = {
  "Supplier Advance Financing": {
    source:   "Buyer sale proceeds / inventory sale / future customer collection",
    trigger:  "Goods arrival confirmation or supplier milestone completion",
    security: "Supplier milestone evidence, Commercial Invoice, Purchase Order",
  },
  "Supplier Balance Financing": {
    source:   "Goods arrival / confirmed buyer order / customer collection",
    trigger:  "BL/AWB release or delivery confirmation",
    security: "Commercial Invoice, BL/AWB, buyer PO confirmation",
  },
  "Logistics Working Capital": {
    source:   "Customer payment under Nexum workflow / release after POD and customer confirmation",
    trigger:  "POD uploaded and customer delivery confirmation",
    security: "Secured job terms, POD, Nexum payment holding record",
  },
  "Carrier / Vendor Payment Financing": {
    source:   "Customer payment / Nexum release / verified receivable",
    trigger:  "Nexum release instruction upon delivery confirmation",
    security: "Verified invoice from carrier/haulier, Nexum job record",
  },
  "Duty / Tax Financing": {
    source:   "Sale of goods / customer collection / release after customs clearance",
    trigger:  "Customs clearance completion and goods release",
    security: "HS Code classification, duty/tax estimate, import permit (if required)",
  },
  "Invoice Financing": {
    source:   "Invoice / customer receivable",
    trigger:  "Invoice due date or customer payment confirmation",
    security: "Verified commercial invoice, signed delivery note",
  },
  "Purchase Order Financing": {
    source:   "Buyer payment after delivery fulfillment",
    trigger:  "Buyer acceptance of goods and payment release",
    security: "Confirmed buyer PO, supplier proforma invoice",
  },
  "Inventory Financing": {
    source:   "Inventory sale proceeds",
    trigger:  "Sale of goods to end buyer / conversion of inventory to cash",
    security: "Inventory report, warehouse receipt, goods valuation",
  },
  "Release-Against-POD Financing": {
    source:   "Confirmed Nexum release",
    trigger:  "Admin release instruction upon verified POD and customer confirmation",
    security: "POD, delivery confirmation, Nexum holding record",
  },
  "Release Delay Bridge": {
    source:   "Expected release instruction",
    trigger:  "Resolution of admin review / settlement process completion",
    security: "Payment proof, Nexum job record, net settlement statement",
  },
  "Claim Reserve Bridge": {
    source:   "Released claim reserve / insurance recovery / claim settlement outcome",
    trigger:  "Resolution of liability review or insurance claim settlement",
    security: "Claim reserve record, insurance policy, liability review outcome",
  },
  "FX Timing Bridge": {
    source:   "Receivable in foreign currency / hedged settlement",
    trigger:  "FX conversion at agreed rate on payment date",
    security: "Foreign currency invoice, FX rate agreement",
  },
  "Other": {
    source:   "To be determined based on specific transaction",
    trigger:  "Per agreed financing terms",
    security: "Per admin assessment",
  },
};

// ─── Tenure estimates by type ─────────────────────────────────────────────────

export const DEFAULT_TENURE_DAYS: Record<OpportunityType, number> = {
  "Supplier Advance Financing":       90,
  "Supplier Balance Financing":       60,
  "Logistics Working Capital":        45,
  "Carrier / Vendor Payment Financing": 30,
  "Duty / Tax Financing":             30,
  "Invoice Financing":                60,
  "Purchase Order Financing":         90,
  "Inventory Financing":              120,
  "Release-Against-POD Financing":    14,
  "Release Delay Bridge":             21,
  "Claim Reserve Bridge":             60,
  "FX Timing Bridge":                 14,
  "Other":                            45,
};

// ─── Financeability scoring ───────────────────────────────────────────────────

export function scoreFinanceability(ctx: FinanceabilityContext): number {
  let score = 50; // base

  if (ctx.isPaymentSecuredUnderNexum) score += 15;
  if (ctx.hasVerifiedDocuments)        score += 10;
  if (ctx.noOpenDispute && !ctx.hasOpenDispute) score += 10;
  if (ctx.repaymentSourceClear)        score += 10;
  if (ctx.counterpartyGradeAorB)       score += 10;
  if (ctx.hasTermsSnapshot)            score +=  5;
  if (ctx.hasEvidencePack)             score +=  5;

  if (ctx.hasOpenDispute)              score -= 20;
  if (ctx.isCriticalRisk)              score -= 20;
  if (ctx.counterpartyOnWatchlist)     score -= 15;
  if (ctx.hasDocumentDiscrepancy)      score -= 15;
  if (ctx.missingHsOrDutyOnDdp)        score -= 10;
  if (ctx.missingFxRate)               score -= 10;
  if (ctx.repaymentDateUnclear)        score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getPricingBand(financeabilityScore: number): PricingBand {
  if (financeabilityScore >= 80) return "Strong opportunity";
  if (financeabilityScore >= 65) return "Reviewable opportunity";
  if (financeabilityScore >= 50) return "High caution";
  return "Not suitable";
}

export function getRecommendedFeeRate(riskLevel: OpportunityRiskLevel): number | null {
  switch (riskLevel) {
    case "Low":      return 1.25; // midpoint of 1.0–1.5% per 30d
    case "Medium":   return 2.25; // midpoint of 1.5–3.0% per 30d
    case "High":     return 3.5;  // 3%+ per 30d
    case "Critical": return null; // not suitable
  }
}

export function riskLevelFromScore(financeabilityScore: number): OpportunityRiskLevel {
  if (financeabilityScore >= 80) return "Low";
  if (financeabilityScore >= 65) return "Medium";
  if (financeabilityScore >= 50) return "High";
  return "Critical";
}

// ─── Classification engine ────────────────────────────────────────────────────

export interface ClassifyParams {
  companyId:      string;
  companyName:    string;
  companyRole?:   string | null;
  fctx:           FinanceabilityContext;
}

/**
 * Given one WorkingCapitalNeed, produce one FinancingOpportunityInput per
 * mapped opportunity type.
 */
export function classifyFromNeed(
  need: Pick<WorkingCapitalNeed,
    "id" | "need_type" | "need_status" | "gap_amount" | "base_gap_amount" |
    "currency" | "base_currency" | "job_reference" | "procurement_reference" |
    "supplier_id" | "estimated_gap_days" | "repayment_source" | "risk_level" |
    "rationale" | "supporting_evidence" | "company_id" | "company_name" | "company_role"
  >,
  params: ClassifyParams,
): FinancingOpportunityInput[] {
  const opportunityTypes = NEED_TO_OPPORTUNITY_TYPES[need.need_type] ?? ["Other"];
  const results: FinancingOpportunityInput[] = [];

  for (const oppType of opportunityTypes) {
    const profile     = REPAYMENT_PROFILES[oppType];
    const tenureDays  = need.estimated_gap_days ?? DEFAULT_TENURE_DAYS[oppType];
    const amount      = need.base_gap_amount ?? need.gap_amount;
    const riskLevel   = need.risk_level as OpportunityRiskLevel;

    // Override financeability context with need risk level
    const fctx: FinanceabilityContext = {
      ...params.fctx,
      isCriticalRisk: riskLevel === "Critical",
    };

    const finScore    = scoreFinanceability(fctx);
    const pricingBand = getPricingBand(finScore);
    const feeRate     = getRecommendedFeeRate(riskLevelFromScore(finScore));
    const oppStatus   = pricingBand === "Not suitable" ? "Not Suitable" as OpportunityStatus : "Detected";

    results.push({
      opportunity_reference:   generateOpportunityReference(),
      working_capital_need_id: need.id,
      company_id:              params.companyId,
      company_name:            params.companyName,
      company_role:            params.companyRole ?? need.company_role,
      job_reference:           need.job_reference ?? null,
      procurement_reference:   need.procurement_reference ?? null,
      supplier_id:             need.supplier_id ?? null,
      opportunity_type:        oppType,
      opportunity_status:      oppStatus,
      requested_amount:        amount ?? null,
      currency:                need.currency ?? "RM",
      base_currency:           need.base_currency ?? "RM",
      base_amount:             need.base_gap_amount ?? null,
      suggested_tenure_days:   tenureDays,
      expected_repayment_date: null,
      repayment_source:        need.repayment_source ?? profile.source,
      repayment_trigger:       profile.trigger,
      recommended_security:    profile.security,
      supporting_evidence:     (need.supporting_evidence as Record<string, unknown> | null) ?? null,
      risk_level:              riskLevel,
      financeability_score:    finScore,
      confidence_score:        finScore,          // use financeability as base confidence
      pricing_band:            pricingBand,
      recommended_fee_rate:    feeRate,
      rationale:               buildRationale(need, oppType, finScore, pricingBand),
      next_action:             buildNextAction(oppStatus, pricingBand, oppType),
    });
  }

  return results;
}

function buildRationale(
  need:      { need_type: string; gap_amount: number | null; base_gap_amount: number | null; base_currency: string; currency: string; estimated_gap_days: number | null; rationale: string | null },
  oppType:   OpportunityType,
  finScore:  number,
  band:      PricingBand,
): string {
  const gapAmt = need.base_gap_amount ?? need.gap_amount;
  const cur    = need.base_currency ?? need.currency ?? "RM";
  const amtStr = gapAmt != null ? `${cur} ${gapAmt.toLocaleString()}` : "an unquantified amount";
  const dayStr = need.estimated_gap_days != null ? ` over ${need.estimated_gap_days} day(s)` : "";
  return `${oppType} identified from ${need.need_type}. Funding gap: ${amtStr}${dayStr}. ` +
         `Financeability score: ${finScore}/100 (${band}). ` +
         (need.rationale ? `Context: ${need.rationale}` : "");
}

function buildNextAction(status: OpportunityStatus, band: PricingBand, type: OpportunityType): string {
  if (status === "Not Suitable") {
    return `${type} not recommended at current financeability score. Admin may override after manual review.`;
  }
  if (band === "Strong opportunity") {
    return "Mark Ready for Simulation. Create financing simulation and share with capital partner if applicable.";
  }
  if (band === "Reviewable opportunity") {
    return "Mark Under Review. Verify repayment source and supporting documents before simulation.";
  }
  return "Mark Under Review. Resolve risk factors (disputes, missing documents, watchlist) before proceeding.";
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export const OPPORTUNITY_STATUS_STYLES: Record<OpportunityStatus, string> = {
  "Detected":                    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Under Review":                "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Ready for Simulation":        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Simulation Created":          "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Shared with Capital Partner": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Not Suitable":                "bg-slate-700/60 text-slate-500 border-slate-600",
  "Dismissed":                   "bg-slate-800 text-slate-600 border-slate-700",
  "Closed":                      "bg-slate-800/60 text-slate-600 border-slate-700/40",
};

export const OPPORTUNITY_RISK_STYLES: Record<OpportunityRiskLevel, string> = {
  Low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium:   "bg-amber-500/15  text-amber-400  border-amber-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Critical: "bg-red-500/15    text-red-400    border-red-500/30",
};

export const PRICING_BAND_STYLES: Record<PricingBand, string> = {
  "Strong opportunity":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Reviewable opportunity": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "High caution":          "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Not suitable":          "bg-red-500/15 text-red-400 border-red-500/30",
};

export const OPPORTUNITY_TYPE_ICONS: Record<OpportunityType, string> = {
  "Supplier Advance Financing":        "📦",
  "Supplier Balance Financing":        "📦",
  "Logistics Working Capital":         "🚚",
  "Carrier / Vendor Payment Financing": "⚓",
  "Duty / Tax Financing":              "🛃",
  "Invoice Financing":                 "📄",
  "Purchase Order Financing":          "🛒",
  "Inventory Financing":               "🏭",
  "Release-Against-POD Financing":     "✅",
  "Release Delay Bridge":              "🔒",
  "Claim Reserve Bridge":              "⚠",
  "FX Timing Bridge":                  "💱",
  "Other":                             "📋",
};

export const ALL_OPPORTUNITY_TYPES: OpportunityType[] = [
  "Supplier Advance Financing",
  "Supplier Balance Financing",
  "Logistics Working Capital",
  "Carrier / Vendor Payment Financing",
  "Duty / Tax Financing",
  "Invoice Financing",
  "Purchase Order Financing",
  "Inventory Financing",
  "Release-Against-POD Financing",
  "Release Delay Bridge",
  "Claim Reserve Bridge",
  "FX Timing Bridge",
  "Other",
];

export const ALL_OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  "Detected",
  "Under Review",
  "Ready for Simulation",
  "Simulation Created",
  "Shared with Capital Partner",
  "Not Suitable",
  "Dismissed",
  "Closed",
];

export const OPEN_OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  "Detected",
  "Under Review",
  "Ready for Simulation",
];

export function formatOpportunityAmount(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)}`;
}
