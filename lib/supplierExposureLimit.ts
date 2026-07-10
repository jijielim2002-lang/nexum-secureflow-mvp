// ─── Supplier Exposure Limit v1 ───────────────────────────────────────────────
// Risk-based advance guidance derived from Nexum workflow records only.
// NOT credit approval. NOT "safe to pay" certification.
// NOT a guarantee of supplier performance or creditworthiness.

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExposureStatus =
  | "Within Limit"
  | "Near Limit"
  | "Exceeds Limit"
  | "Blocked / Review Required";

export interface ExposureLimitInput {
  // Supplier trust context
  supplierGrade:      string;   // A | B | C | D | Watchlist | Blocked
  supplierStatus:     string;   // New | Known | Verified | Watchlist | Blocked
  supplierTrustScore: number | null;

  // Milestone / evidence history
  verifiedMilestones:  number;
  rejectedMilestones:  number;
  disputedFlows:       number;
  completedFlows:      number;
  totalFlows:          number;

  // Current state
  currentActiveExposure: number;  // sum of open advance amounts
  averageCargoValue:     number | null;
  currency:              string;

  // Buyer context
  buyerPaymentScore: number | null; // 0–100 (70 = default)

  // Risk context
  cargoRiskLevel:   string | null; // Low | Medium | High | Critical
  customsRiskLevel: string | null;
  countryRisk:      string | null; // Low | Medium | High | Critical
}

export interface ExposureLimitResult {
  recommendedMaxAdvancePercentage: number;   // 0–50
  recommendedMaxAdvanceAmount:     number | null;
  exposureStatus:                  ExposureStatus;
  riskLevel:                       string;
  recommendedReleaseModel:         string;
  rationale:                       string;
  adjustments:                     string[];
}

// ── Status badge maps ──────────────────────────────────────────────────────────

export const EXPOSURE_STATUS_BADGE: Record<ExposureStatus, string> = {
  "Within Limit":          "bg-emerald-900/40 text-emerald-300 border border-emerald-500/30",
  "Near Limit":            "bg-yellow-900/40 text-yellow-300 border border-yellow-500/30",
  "Exceeds Limit":         "bg-red-900/40 text-red-300 border border-red-500/30",
  "Blocked / Review Required": "bg-slate-900/60 text-slate-400 border border-slate-600",
};

export const EXPOSURE_STATUS_ICON: Record<ExposureStatus, string> = {
  "Within Limit":          "✓",
  "Near Limit":            "⚠",
  "Exceeds Limit":         "✗",
  "Blocked / Review Required": "🚫",
};

export const EXPOSURE_BAR_COLOR: Record<ExposureStatus, string> = {
  "Within Limit":          "bg-emerald-500",
  "Near Limit":            "bg-yellow-500",
  "Exceeds Limit":         "bg-red-500",
  "Blocked / Review Required": "bg-slate-600",
};

// ── Audit actions ─────────────────────────────────────────────────────────────

export const EXPOSURE_AUDIT_ACTIONS = {
  limit_calculated:         "supplier_exposure_limit_calculated",
  limit_exceeded:           "supplier_exposure_limit_exceeded",
  override_requested:       "supplier_advance_override_requested",
  override_approved:        "supplier_advance_override_approved",
  override_rejected:        "supplier_advance_override_rejected",
} as const;

// ── Compliance wording ─────────────────────────────────────────────────────────

export const EXPOSURE_COMPLIANCE_WORDING = {
  basis:           "Recommended exposure limit — risk-based advance guidance derived from Nexum workflow records only.",
  not_credit:      "This is not credit approval. Nexum does not guarantee supplier performance or creditworthiness.",
  not_safe:        "A within-limit result does not mean this advance is safe. Admin confirmation is always required.",
  override:        "Admin override required. Any advance exceeding the recommended limit must be approved by an admin.",
  blocked:         "Supplier is Blocked — advance not recommended. Requires explicit admin override.",
  watchlist:       "Supplier is on Watchlist — reduced advance limit applies. Enhanced due diligence required.",
  no_auto_release: "No funds are released automatically. Manual release instruction required.",
  risk_guidance:   "Recommended precaution — adjust advance based on current exposure and supplier workflow history.",
} as const;

// ── Calculation engine ────────────────────────────────────────────────────────

export function calculateExposureLimit(input: ExposureLimitInput): ExposureLimitResult {
  const adjustments: string[] = [];

  // 1. Base percentage from supplier grade
  const BASE_PCT: Record<string, number> = {
    A:         50,
    B:         40,
    C:         30,
    D:         20,
    Watchlist: 10,
    Blocked:   0,
  };

  let pct = BASE_PCT[input.supplierGrade] ?? 30;
  adjustments.push(`Base: ${pct}% (Grade ${input.supplierGrade})`);

  // 2. Downward adjustments

  // Active disputes
  if (input.disputedFlows > 0) {
    const cut = Math.min(10, input.disputedFlows * 5);
    pct -= cut;
    adjustments.push(`-${cut}pp: ${input.disputedFlows} disputed flow(s)`);
  }

  // Rejected milestone evidence
  if (input.rejectedMilestones > 0) {
    const cut = Math.min(10, input.rejectedMilestones * 5);
    pct -= cut;
    adjustments.push(`-${cut}pp: ${input.rejectedMilestones} rejected milestone evidence item(s)`);
  }

  // Buyer payment score
  if (input.buyerPaymentScore !== null) {
    if (input.buyerPaymentScore < 60) {
      pct -= 10;
      adjustments.push(`-10pp: buyer payment score below 60`);
    } else if (input.buyerPaymentScore < 75) {
      pct -= 5;
      adjustments.push(`-5pp: buyer payment score below 75`);
    }
  }

  // New supplier
  if (input.supplierStatus === "New") {
    pct -= 10;
    adjustments.push("-10pp: new supplier — no prior Nexum workflow history");
  }

  // Cargo/customs/country risk
  const riskDeduction = (r: string | null, label: string) => {
    if (r === "Critical") { pct -= 10; adjustments.push(`-10pp: ${label} is Critical`); }
    else if (r === "High") { pct -= 5;  adjustments.push(`-5pp: ${label} is High`); }
  };
  riskDeduction(input.cargoRiskLevel,   "cargo risk");
  riskDeduction(input.customsRiskLevel, "customs risk");
  riskDeduction(input.countryRisk,      "country risk");

  // 3. Upward adjustments

  // Repeated successful flows, no disputes
  if (input.completedFlows >= 3 && input.disputedFlows === 0) {
    pct += 5;
    adjustments.push(`+5pp: ≥3 completed flows with no disputes`);
  } else if (input.completedFlows >= 1 && input.disputedFlows === 0) {
    pct += 2;
    adjustments.push(`+2pp: at least 1 completed flow with no disputes`);
  }

  // Supplier Verified
  if (input.supplierStatus === "Verified") {
    pct += 5;
    adjustments.push("+5pp: supplier status Verified");
  }

  // All milestones verified, none rejected
  if (input.verifiedMilestones > 0 && input.rejectedMilestones === 0 && input.totalFlows > 0) {
    pct += 5;
    adjustments.push("+5pp: all milestone evidence verified, none rejected");
  }

  // Buyer payment score excellent
  if (input.buyerPaymentScore !== null && input.buyerPaymentScore > 90) {
    pct += 5;
    adjustments.push("+5pp: buyer payment score > 90");
  }

  // Blocked hard-cap
  if (input.supplierGrade === "Blocked" || input.supplierStatus === "Blocked") {
    pct = 0;
    adjustments.push("Hard cap: 0% — supplier Blocked");
  }

  // Watchlist cap
  if (input.supplierGrade === "Watchlist" || input.supplierStatus === "Watchlist") {
    pct = Math.min(pct, 10);
    adjustments.push("Cap: max 10% — supplier on Watchlist");
  }

  // Final clamp
  pct = Math.max(0, Math.min(50, Math.round(pct)));

  // 4. Max amount
  const recommendedMaxAdvanceAmount = input.averageCargoValue !== null && input.averageCargoValue > 0
    ? Math.round(input.averageCargoValue * pct / 100)
    : null;

  // 5. Exposure status
  let exposureStatus: ExposureStatus;
  if (input.supplierGrade === "Blocked" || input.supplierStatus === "Blocked") {
    exposureStatus = "Blocked / Review Required";
  } else if (recommendedMaxAdvanceAmount !== null && recommendedMaxAdvanceAmount > 0) {
    const ratio = input.currentActiveExposure / recommendedMaxAdvanceAmount;
    if (ratio <= 0.80)      exposureStatus = "Within Limit";
    else if (ratio <= 1.00) exposureStatus = "Near Limit";
    else                    exposureStatus = "Exceeds Limit";
  } else if (pct === 0) {
    exposureStatus = "Blocked / Review Required";
  } else {
    // No cargo value baseline — compare raw exposure vs zero
    exposureStatus = input.currentActiveExposure > 0 ? "Near Limit" : "Within Limit";
  }

  // Override: if exceeds limit or blocked/watchlist with active exposure
  if ((input.supplierGrade === "Watchlist" || input.supplierStatus === "Watchlist") && input.currentActiveExposure > 0) {
    if (exposureStatus === "Within Limit") exposureStatus = "Near Limit";
  }

  // 6. Risk level
  let riskLevel: string;
  if (exposureStatus === "Blocked / Review Required")    riskLevel = "Critical";
  else if (exposureStatus === "Exceeds Limit")           riskLevel = "High";
  else if (exposureStatus === "Near Limit")              riskLevel = "Medium";
  else if (input.supplierGrade === "A" || input.supplierGrade === "B") riskLevel = "Low";
  else                                                   riskLevel = "Medium";

  // 7. Recommended release model
  let recommendedReleaseModel: string;
  if (pct === 0 || input.supplierGrade === "Blocked") {
    recommendedReleaseModel = "Do Not Proceed — Admin Override Required";
  } else if (pct <= 10 || input.supplierGrade === "Watchlist") {
    recommendedReleaseModel = "Milestone Release — Strict Evidence, Reduced Advance";
  } else if (pct <= 20 || input.supplierGrade === "D") {
    recommendedReleaseModel = "Milestone Release — Strict Evidence Required";
  } else if (pct <= 30) {
    recommendedReleaseModel = "Milestone Release — Standard";
  } else {
    recommendedReleaseModel = "Milestone Release — Standard Evidence";
  }

  // 8. Rationale summary
  const rationale = [
    `Recommended exposure limit: ${pct}% (${
      recommendedMaxAdvanceAmount != null
        ? `${input.currency} ${recommendedMaxAdvanceAmount.toLocaleString()}`
        : "amount TBD — cargo value not set"
    }).`,
    `Current active exposure: ${input.currency} ${input.currentActiveExposure.toLocaleString()}.`,
    `Status: ${exposureStatus}.`,
    adjustments.join(" · "),
    EXPOSURE_COMPLIANCE_WORDING.basis,
    EXPOSURE_COMPLIANCE_WORDING.not_credit,
  ].join(" ");

  return {
    recommendedMaxAdvancePercentage: pct,
    recommendedMaxAdvanceAmount,
    exposureStatus,
    riskLevel,
    recommendedReleaseModel,
    rationale,
    adjustments,
  };
}

// ── DB row type ───────────────────────────────────────────────────────────────

export interface SupplierExposureLimitRow {
  id:                              string;
  supplier_id:                     string | null;
  buyer_company_id:                string | null;
  supplier_name:                   string | null;
  buyer_name:                      string | null;
  currency:                        string;
  recommended_max_advance_amount:  number | null;
  recommended_max_advance_percentage: number | null;
  current_active_exposure:         number;
  total_historical_exposure:       number;
  open_protection_flows:           number;
  active_disputes:                 number;
  supplier_trust_score:            number | null;
  supplier_grade:                  string | null;
  buyer_payment_score:             number | null;
  risk_level:                      string;
  recommended_release_model:       string | null;
  exposure_status:                 ExposureStatus;
  rationale:                       string | null;
  advance_override_requested:      boolean;
  advance_override_reason:         string | null;
  advance_override_approved_at:    string | null;
  advance_override_admin_note:     string | null;
  last_calculated_at:              string | null;
  created_at:                      string;
  updated_at:                      string;
}
