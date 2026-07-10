import type { CapitalReadinessRow } from "./capitalReadiness";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinancingProductType =
  | "Provider Receivable Financing"
  | "Customer Trade Credit"
  | "Supplier Deposit Support"
  | "Working Capital"
  | "Membership Upgrade Financing"
  | "Other";

export type OfferStatus = "Draft" | "Simulated" | "Interested" | "Rejected" | "Expired";

export const FINANCING_PRODUCT_TYPES: FinancingProductType[] = [
  "Provider Receivable Financing",
  "Customer Trade Credit",
  "Supplier Deposit Support",
  "Working Capital",
  "Membership Upgrade Financing",
  "Other",
];

export const OFFER_STATUSES: OfferStatus[] = [
  "Draft", "Simulated", "Interested", "Rejected", "Expired",
];

export const OFFER_STATUS_CONFIG: Record<OfferStatus, { badge: string; dot: string }> = {
  Draft:      { badge: "border-slate-700 bg-slate-800/60 text-slate-400",         dot: "bg-slate-500" },
  Simulated:  { badge: "border-blue-500/30 bg-blue-500/10 text-blue-400",         dot: "bg-blue-400" },
  Interested: { badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  Rejected:   { badge: "border-red-500/30 bg-red-500/10 text-red-400",            dot: "bg-red-500" },
  Expired:    { badge: "border-slate-700 bg-slate-900/60 text-slate-600",          dot: "bg-slate-700" },
};

export const PRODUCT_ICON: Record<FinancingProductType, string> = {
  "Provider Receivable Financing":  "💰",
  "Customer Trade Credit":           "🏦",
  "Supplier Deposit Support":        "📦",
  "Working Capital":                 "🔄",
  "Membership Upgrade Financing":    "⭐",
  "Other":                           "📋",
};

// Monthly indicative rates per product type
export const MONTHLY_RATES: Record<FinancingProductType, number> = {
  "Provider Receivable Financing":  0.015,
  "Customer Trade Credit":           0.020,
  "Supplier Deposit Support":        0.013,
  "Working Capital":                 0.025,
  "Membership Upgrade Financing":    0.010,
  "Other":                           0.020,
};

export const REPAYMENT_SOURCES: Record<FinancingProductType, string> = {
  "Provider Receivable Financing":  "Proceeds from verified customer invoices upon job completion and POD acceptance.",
  "Customer Trade Credit":           "Monthly repayment from customer operating cash flow over agreed tenure.",
  "Supplier Deposit Support":        "Deposit return or balance collection from confirmed customer upon delivery.",
  "Working Capital":                 "Operating cash flow from recurring secured trade jobs on the Nexum platform.",
  "Membership Upgrade Financing":    "Monthly membership fee deduction from active Nexum membership.",
  "Other":                           "Agreed repayment schedule as per financing terms.",
};

export interface SimulatedFinancingOffer {
  id:                  string;
  assessment_id:       string | null;
  job_reference:       string | null;
  company_id:          string | null;
  company_name:        string | null;
  product_type:        FinancingProductType;
  offer_status:        OfferStatus;
  offer_amount:        number;
  currency:            string;
  tenure_days:         number | null;
  estimated_fee:       number | null;
  estimated_rate_note: string | null;
  repayment_source:    string | null;
  required_conditions: string | null;
  risk_notes:          string | null;
  generated_by:        string | null;
  generated_at:        string;
  expires_at:          string | null;
  created_at:          string;
  updated_at:          string;
}

// ─── Disclaimer (always shown) ────────────────────────────────────────────────

export const FINANCING_DISCLAIMER =
  "This is a simulated financing offer for internal assessment only. It is not a loan approval, " +
  "disbursement commitment, or regulated financial offer. No money will be disbursed. " +
  "All figures are indicative and subject to full credit review before any real financing is extended.";

// ─── Assessment type → product type map ──────────────────────────────────────

const PRODUCT_TYPE_MAP: Record<string, FinancingProductType> = {
  "Customer Trade Credit":         "Customer Trade Credit",
  "Provider Receivable Financing": "Provider Receivable Financing",
  "Supplier Deposit Support":      "Supplier Deposit Support",
  "Working Capital":               "Working Capital",
  "Membership Upgrade":            "Membership Upgrade Financing",
  "Other":                         "Other",
};

// ─── Offer generation from assessment ────────────────────────────────────────

export interface GeneratedOfferPayload {
  assessment_id:       string;
  job_reference:       string | null;
  company_id:          string | null;
  company_name:        string | null;
  product_type:        FinancingProductType;
  offer_status:        OfferStatus;
  offer_amount:        number;
  currency:            string;
  tenure_days:         number | null;
  estimated_fee:       number | null;
  estimated_rate_note: string | null;
  repayment_source:    string | null;
  required_conditions: string | null;
  risk_notes:          string | null;
  generated_by:        string;
  generated_at:        string;
  expires_at:          string;
}

export function generateOfferFromAssessment(
  assessment: CapitalReadinessRow,
  actorId: string,
): GeneratedOfferPayload | null {
  // Only generate for Eligible or Priority
  if (!["Eligible", "Priority"].includes(assessment.readiness_status)) return null;
  // Need a positive amount
  if (!assessment.max_recommended_amount || assessment.max_recommended_amount <= 0) return null;

  const productType  = PRODUCT_TYPE_MAP[assessment.assessment_type] ?? "Other";
  const offerAmount  = Math.round(Number(assessment.max_recommended_amount));
  const currency     = assessment.currency;
  const tenureDays   = assessment.suggested_tenure_days ?? 45;
  const monthlyRate  = MONTHLY_RATES[productType];
  const months       = tenureDays / 30;
  const estimatedFee = Math.round(offerAmount * monthlyRate * months);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const rateNote = assessment.suggested_pricing_note
    ?? `Indicative rate: ${(monthlyRate * 100).toFixed(1)}% per month. Final rate subject to full credit review.`;

  return {
    assessment_id:       assessment.id,
    job_reference:       assessment.job_reference,
    company_id:          assessment.company_id,
    company_name:        assessment.company_name,
    product_type:        productType,
    offer_status:        "Simulated",
    offer_amount:        offerAmount,
    currency,
    tenure_days:         tenureDays,
    estimated_fee:       estimatedFee,
    estimated_rate_note: rateNote,
    repayment_source:    REPAYMENT_SOURCES[productType],
    required_conditions: assessment.required_conditions,
    risk_notes:          assessment.key_risks,
    generated_by:        actorId,
    generated_at:        new Date().toISOString(),
    expires_at:          expiresAt.toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isOfferExpired(offer: SimulatedFinancingOffer): boolean {
  if (!offer.expires_at) return false;
  return new Date(offer.expires_at) < new Date();
}

export function effectiveOfferStatus(offer: SimulatedFinancingOffer): OfferStatus {
  if (offer.offer_status === "Expired") return "Expired";
  if (offer.offer_status !== "Rejected" && isOfferExpired(offer)) return "Expired";
  return offer.offer_status;
}

export function fmtOfferAmount(offer: SimulatedFinancingOffer): string {
  return `${offer.currency} ${Number(offer.offer_amount).toLocaleString("en-MY", { minimumFractionDigits: 0 })}`;
}
