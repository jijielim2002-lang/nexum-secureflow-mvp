// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessStatus          = "Invited" | "Active" | "Revoked" | "Expired";
export type PartnerInterestStatus = "Interested" | "Need More Info" | "Declined";

export interface CapitalPartnerAccessRow {
  id:                         string;
  capital_partner_company_id: string | null;
  financing_offer_id:         string | null;
  job_reference:              string | null;
  company_id:                 string | null;
  access_status:              AccessStatus;
  access_expires_at:          string | null;
  created_by:                 string | null;
  created_at:                 string;
}

// Joined shape used on the admin management page
export interface CapitalPartnerAccessJoined extends CapitalPartnerAccessRow {
  company_name:                string | null; // the target company (deal company)
  partner_company_name:        string | null; // the capital partner's company
  product_type:                string | null;
  offer_status:                string | null;
  offer_amount:                number | null;
  currency:                    string | null;
  partner_interest_status:     PartnerInterestStatus | null;
  partner_viewed_at:           string | null;
}

// Shape used in the capital partner dashboard / list
export interface CapitalOpportunityRow {
  access_id:                    string;
  capital_partner_company_id:   string | null;
  financing_offer_id:           string | null;
  job_reference:                string | null;
  company_id:                   string | null;
  access_status:                AccessStatus;
  access_expires_at:            string | null;
  shared_at:                    string;

  product_type:                 string;
  offer_status:                 string;
  offer_amount:                 number;
  currency:                     string;
  tenure_days:                  number | null;
  estimated_fee:                number | null;
  repayment_source:             string | null;
  conditions:                   string | null;
  risk_notes:                   string | null;
  expires_at:                   string | null;
  generated_at:                 string;
  partner_interest_status:      PartnerInterestStatus | null;
  partner_interest_note:        string | null;
  partner_viewed_at:            string | null;
  company_name:                 string | null;

  overall_trust_score:          number | null;
  risk_level:                   string | null;
  trend:                        string | null;
  payment_behavior_score:       number | null;
  operational_reliability_score: number | null;
  financing_readiness:          string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAPITAL_PARTNER_DISCLAIMER =
  "This portal provides decision-support information only. Final credit decision, " +
  "legal documentation, and disbursement remain subject to the capital partner's own approval process. " +
  "All data shown is sourced from Nexum SecureFlow internal records and is confidential.";

export const ACCESS_STATUS_BADGE: Record<AccessStatus, string> = {
  Invited: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Active:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Revoked: "border-red-500/30 bg-red-500/10 text-red-400",
  Expired: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

export const PARTNER_INTEREST_BADGE: Record<PartnerInterestStatus, string> = {
  Interested:       "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "Need More Info": "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Declined:         "border-red-500/30 bg-red-500/10 text-red-400",
};

export const PARTNER_INTEREST_ICON: Record<PartnerInterestStatus, string> = {
  Interested:       "★",
  "Need More Info": "?",
  Declined:         "✕",
};

export const RISK_LEVEL_BADGE: Record<string, string> = {
  Low:      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Medium:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  High:     "border-red-500/30 bg-red-500/10 text-red-400",
  Critical: "border-red-700/50 bg-red-900/30 text-red-300 font-bold",
};

export const TREND_BADGE: Record<string, string> = {
  Improving:    "text-emerald-400",
  Stable:       "text-slate-400",
  Deteriorating: "text-red-400",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isAccessActive(row: { access_status: AccessStatus; access_expires_at: string | null }): boolean {
  if (row.access_status === "Revoked" || row.access_status === "Expired") return false;
  if (row.access_expires_at && row.access_expires_at < new Date().toISOString()) return false;
  return true;
}

export function effectiveAccessStatus(row: { access_status: AccessStatus; access_expires_at: string | null }): AccessStatus {
  if (row.access_status === "Revoked") return "Revoked";
  if (row.access_expires_at && row.access_expires_at < new Date().toISOString()) return "Expired";
  return row.access_status;
}

export function isOfferExpired(row: { offer_status: string; expires_at: string | null }): boolean {
  if (row.offer_status === "Rejected" || row.offer_status === "Expired") return true;
  if (row.expires_at && row.expires_at < new Date().toISOString().split("T")[0]) return true;
  return false;
}
