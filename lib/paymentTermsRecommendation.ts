// ─── lib/paymentTermsRecommendation.ts — Payment Terms Recommendation Engine ──
//
// COMPLIANCE NOTE:
//   All outputs are decision-support recommendations only.
//   Nexum does not automatically enforce payment terms, guarantee credit approval,
//   or make legally binding determinations. Final terms are agreed by the parties.

// ── Types ─────────────────────────────────────────────────────────────────────

export type PTRType =
  | "Full Payment Before Execution"
  | "Deposit + Balance"
  | "Milestone Release"
  | "Higher Deposit Required"
  | "Standard Terms"
  | "Low-Risk Flexible Terms"
  | "Manual Review Required";

export type PTRRiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface PTRInput {
  // Identity (for storage reference — not used in logic)
  customerCompanyId?:   string;
  providerCompanyId?:   string;
  jobReference?:        string;
  quotationReference?:  string;
  rfqReference?:        string;

  // Customer benchmark data
  customerGrade?:              string | null;  // "A"|"B"|"C"|"D"|"Watchlist"
  customerScore?:              number | null;
  customerDisputeRate?:        number | null;
  customerOverdueRate?:        number | null;
  customerPaymentDisputeRate?: number | null;
  customerAutoConfirmRate?:    number | null;

  // Provider benchmark data
  providerGrade?:              string | null;
  providerScore?:              number | null;
  providerDisputeRate?:        number | null;
  providerTrackingScore?:      number | null;

  // Trade parameters
  jobValue?:     number | null;
  currency?:     string;
  incoterm?:     string | null;
  serviceType?:  string | null;

  // Risk indicators (from TIP / BCP)
  routeRiskLevel?:      string | null;
  paymentRiskLevel?:    string | null;
  documentRiskLevel?:   string | null;
  overallTradeRisk?:    string | null;
  supplyDisruptionRisk?: string | null;
  inventoryUrgency?:    string | null;

  // Configurable threshold (default 100,000)
  highValueThreshold?:  number;
  veryHighValueThreshold?: number;
}

export interface PTROutput {
  recommendation_type:                        PTRType;
  recommended_deposit_percentage:             number;
  recommended_deposit_amount:                 number | null;
  recommended_balance_amount:                 number | null;
  recommended_release_condition:              string;
  recommended_delivery_confirmation_window_hours: number;
  risk_level:                                 PTRRiskLevel;
  rationale:                                  string;
  key_risk_factors:                           string[];
}

export interface PaymentTermsRecommendationRow {
  id:                                         string;
  job_reference:                              string | null;
  quotation_reference:                        string | null;
  rfq_reference:                              string | null;
  customer_company_id:                        string | null;
  provider_company_id:                        string | null;
  recommendation_type:                        PTRType;
  recommended_deposit_percentage:             number | null;
  recommended_deposit_amount:                 number | null;
  recommended_balance_amount:                 number | null;
  recommended_release_condition:              string | null;
  recommended_delivery_confirmation_window_hours: number | null;
  risk_level:                                 PTRRiskLevel;
  rationale:                                  string | null;
  key_risk_factors:                           string[];
  customer_score:                             number | null;
  provider_score:                             number | null;
  incoterm:                                   string | null;
  job_value:                                  number | null;
  currency:                                   string;
  was_accepted:                               boolean | null;
  was_overridden:                             boolean;
  override_reason:                            string | null;
  override_by_role:                           string | null;
  override_by_name:                           string | null;
  overridden_at:                              string | null;
  created_by_system:                          boolean;
  created_at:                                 string;
}

// ── Incoterm release conditions ───────────────────────────────────────────────

const INCOTERM_RELEASE_CONDITION: Record<string, string> = {
  EXW: "Cargo pickup and handover confirmed by customer before final balance release.",
  FCA: "Cargo handover to nominated carrier confirmed before final release.",
  FOB: "Bill of Lading issued and verified by Nexum before final balance release.",
  CFR: "Bill of Lading verified and cargo confirmed shipped before final release.",
  CIF: "Bill of Lading verified, cargo insured, and shipment confirmed before final release.",
  CPT: "Carrier receipt confirmed and cargo insured before final release.",
  CIP: "Carrier receipt, cargo insured, confirmed. Final release on delivery confirmation.",
  DAP: "Delivery confirmed at named destination before final balance release.",
  DPU: "Delivery and unloading confirmed at named place before final release.",
  DDP: "Delivery confirmed and duty/tax clearance verified before final balance release.",
};

function incotermReleaseCondition(incoterm: string | null | undefined): string {
  if (!incoterm) return "Delivery confirmed and all obligations fulfilled before final release.";
  const upper = incoterm.toUpperCase().trim();
  return INCOTERM_RELEASE_CONDITION[upper] ??
    "Delivery confirmed and all documentation verified before final balance release.";
}

// ── Delivery confirmation window by incoterm ──────────────────────────────────

function incotermConfirmWindowHours(incoterm: string | null | undefined): number {
  if (!incoterm) return 48;
  const upper = incoterm.toUpperCase().trim();
  // DAP/DDP/DPU: destination delivery — 48h
  // EXW/FCA/FOB: origin — 24h (pickup)
  if (["EXW", "FCA", "FOB"].includes(upper)) return 24;
  if (["DAP", "DPU", "DDP"].includes(upper)) return 48;
  return 48;
}

// ── Risk level helpers ─────────────────────────────────────────────────────────

function isHigh(v: string | null | undefined): boolean {
  return v === "High" || v === "Critical";
}

function isCritical(v: string | null | undefined): boolean {
  return v === "Critical";
}

// ── Core recommendation engine ─────────────────────────────────────────────────

export function generateRecommendation(input: PTRInput): PTROutput {
  const {
    customerGrade, customerScore, customerDisputeRate, customerOverdueRate,
    customerPaymentDisputeRate, customerAutoConfirmRate,
    providerGrade, providerScore, providerDisputeRate, providerTrackingScore,
    jobValue, currency = "RM", incoterm, serviceType,
    routeRiskLevel, paymentRiskLevel, documentRiskLevel, overallTradeRisk,
    supplyDisruptionRisk, inventoryUrgency,
    highValueThreshold = 100_000,
    veryHighValueThreshold = 500_000,
  } = input;

  const riskFactors: string[] = [];
  let depositPct = 30; // default base
  let confirmWindow = incotermConfirmWindowHours(incoterm);
  let releaseCondition = incotermReleaseCondition(incoterm);
  // Use string internally to avoid TypeScript narrowing preventing valid comparisons
  let type: string = "Standard Terms";
  let riskLevel: string = "Medium";
  let manualReviewRequired = false;

  // ── Step 1: Base deposit from customer grade ─────────────────────────────────
  const gradeDepositMap: Record<string, number> = {
    A: 20, B: 25, C: 30, D: 50, Watchlist: 100,
  };
  if (customerGrade && gradeDepositMap[customerGrade] !== undefined) {
    depositPct = gradeDepositMap[customerGrade];
  }

  // ── Step 2: Watchlist / D — force full payment ───────────────────────────────
  if (customerGrade === "Watchlist") {
    depositPct = 100;
    type = "Full Payment Before Execution";
    riskLevel = "Critical";
    riskFactors.push("Customer is on Watchlist");
  } else if (customerGrade === "D") {
    depositPct = Math.max(depositPct, 50);
    type = "Higher Deposit Required";
    riskLevel = "High";
    riskFactors.push("Customer grade D — poor payment history");
  }

  // ── Step 3: Dispute / overdue risk adjustments ───────────────────────────────
  const custDispute    = customerDisputeRate ?? 0;
  const custOverdue    = customerOverdueRate ?? 0;
  const custPayDispute = customerPaymentDisputeRate ?? 0;

  if (custPayDispute > 20 || custOverdue > 20) {
    depositPct = Math.max(depositPct, 100);
    type = "Full Payment Before Execution";
    riskLevel = "Critical";
    riskFactors.push(`High payment dispute/overdue rate (disputes: ${custPayDispute.toFixed(1)}%, overdue: ${custOverdue.toFixed(1)}%)`);
  } else if (custPayDispute > 10 || custOverdue > 10) {
    depositPct = Math.max(depositPct, 50);
    if (type === "Standard Terms" || type === "Low-Risk Flexible Terms") type = "Higher Deposit Required";
    riskLevel = riskLevel === "Low" ? "Medium" : riskLevel;
    riskFactors.push(`Elevated payment dispute/overdue rate (disputes: ${custPayDispute.toFixed(1)}%, overdue: ${custOverdue.toFixed(1)}%)`);
  }

  if (custDispute > 20 && depositPct < 100) {
    depositPct = Math.max(depositPct, 50);
    if (type === "Standard Terms") type = "Higher Deposit Required";
    riskLevel = riskLevel === "Low" ? "Medium" : riskLevel;
    riskFactors.push(`High overall dispute rate (${custDispute.toFixed(1)}%)`);
  }

  // ── Step 4: Trade risk adjustments ───────────────────────────────────────────
  if (isCritical(overallTradeRisk)) {
    depositPct = Math.max(depositPct, 50);
    riskLevel = "Critical";
    riskFactors.push("Critical overall trade risk");
    manualReviewRequired = true;
  } else if (isHigh(overallTradeRisk)) {
    depositPct = Math.max(depositPct, 40);
    riskLevel = riskLevel === "Low" || riskLevel === "Medium" ? "High" : riskLevel;
    riskFactors.push("High overall trade risk");
  }

  if (isHigh(routeRiskLevel)) {
    depositPct = Math.min(100, depositPct + 10);
    riskLevel = riskLevel === "Low" || riskLevel === "Medium" ? "High" : riskLevel;
    riskFactors.push("High route/logistics risk");
    releaseCondition = `${releaseCondition} Shipment tracking and route risk review required.`;
  }

  if (isHigh(paymentRiskLevel)) {
    depositPct = Math.min(100, depositPct + 10);
    riskLevel = riskLevel === "Low" || riskLevel === "Medium" ? "High" : riskLevel;
    riskFactors.push("High payment risk indicator");
  }

  if (isHigh(documentRiskLevel)) {
    riskFactors.push("High document risk — verification required before release");
    releaseCondition = `${releaseCondition} All documents must be verified before balance release.`;
  }

  // ── Step 5: Job value adjustments ────────────────────────────────────────────
  if (jobValue != null) {
    if (jobValue >= veryHighValueThreshold) {
      depositPct = Math.min(100, depositPct + 20);
      manualReviewRequired = true;
      riskLevel = riskLevel === "Low" ? "Medium" : riskLevel;
      riskFactors.push(`Very high job value (${currency} ${jobValue.toLocaleString()}) — admin review required`);
    } else if (jobValue >= highValueThreshold) {
      depositPct = Math.min(100, depositPct + 10);
      manualReviewRequired = true;
      riskLevel = riskLevel === "Low" ? "Medium" : riskLevel;
      riskFactors.push(`High job value (${currency} ${jobValue.toLocaleString()}) — admin review recommended`);
    }
  }

  // ── Step 6: Provider grade adjustments ───────────────────────────────────────
  if (providerGrade === "Watchlist" || providerGrade === "D") {
    if (type !== "Full Payment Before Execution") {
      type = "Milestone Release";
    }
    riskFactors.push(`Provider grade ${providerGrade} — tighter milestone releases recommended for customer protection`);
    releaseCondition = `Staged/milestone release: funds released only after each verified delivery milestone. ${releaseCondition}`;
  }

  if ((providerTrackingScore ?? 100) < 40) {
    riskFactors.push("Provider has low cargo tracking visibility");
  }

  // ── Step 7: Incoterm-specific flags ──────────────────────────────────────────
  const incotermUpper = (incoterm ?? "").toUpperCase().trim();
  if (incotermUpper === "DDP") {
    riskFactors.push("DDP incoterm — duty/tax clearance must be confirmed before final release");
    releaseCondition = `${releaseCondition} Duty and tax clearance certificate required.`;
  }

  // ── Step 8: Auto-confirmation pattern ────────────────────────────────────────
  if ((customerAutoConfirmRate ?? 0) > 40 && type !== "Full Payment Before Execution") {
    riskFactors.push(`Customer frequently does not respond to delivery confirmation (auto-confirm: ${(customerAutoConfirmRate ?? 0).toFixed(0)}%) — confirm delivery window is appropriate`);
    confirmWindow = 72; // extend window for unresponsive customers
  }

  // ── Step 9: Supply disruption / inventory urgency ─────────────────────────────
  if (isCritical(supplyDisruptionRisk) || inventoryUrgency === "Critical") {
    riskFactors.push("Critical supply disruption / inventory urgency — expedited terms required");
    confirmWindow = Math.min(confirmWindow, 24); // tighter window when urgent
  }

  // ── Step 10: Finalize recommendation type ────────────────────────────────────
  if (manualReviewRequired && type !== "Full Payment Before Execution") {
    type = "Manual Review Required";
  } else if (depositPct >= 100 && type !== "Full Payment Before Execution") {
    type = "Full Payment Before Execution";
  } else if (depositPct >= 50 && type === "Standard Terms") {
    type = "Higher Deposit Required";
  } else if (depositPct > 30 && type === "Standard Terms") {
    type = "Deposit + Balance";
  }

  // Low-risk flexible terms: both parties grade A/B, no risk factors, low value
  const allRiskLow =
    riskFactors.length === 0 &&
    (customerGrade === "A" || customerGrade === "B") &&
    (providerGrade === "A" || providerGrade === "B" || providerGrade == null) &&
    !isHigh(overallTradeRisk) && !isHigh(routeRiskLevel) &&
    (jobValue == null || jobValue < highValueThreshold);

  if (allRiskLow) {
    type = "Low-Risk Flexible Terms";
    depositPct = 20;
    riskLevel = "Low";
  }

  // ── Step 11: Determine final risk level if not set by critical paths ──────────
  if (riskFactors.length === 0 && riskLevel === "Medium") {
    riskLevel = "Low";
  } else if (riskFactors.length >= 3 && riskLevel === "Medium") {
    riskLevel = "High";
  }

  // ── Step 12: Compute amounts ─────────────────────────────────────────────────
  const depositAmount  = jobValue != null ? (jobValue * depositPct) / 100 : null;
  const balanceAmount  = depositAmount != null && jobValue != null
    ? jobValue - depositAmount
    : null;

  // ── Step 13: Build rationale ──────────────────────────────────────────────────
  const rationaleLines: string[] = [];

  if (customerGrade) {
    rationaleLines.push(
      `Customer benchmark grade ${customerGrade}${customerScore != null ? ` (score: ${customerScore.toFixed(1)})` : ""} → base deposit ${gradeDepositMap[customerGrade] ?? 30}%.`
    );
  }

  if (riskFactors.length > 0) {
    rationaleLines.push(`Risk adjustments applied: ${riskFactors.slice(0, 3).join("; ")}.`);
  }

  if (incoterm) {
    rationaleLines.push(`Incoterm ${incoterm.toUpperCase()}: ${releaseCondition.split(".")[0]}.`);
  }

  rationaleLines.push(
    `Final recommendation: ${type} (${depositPct}% deposit${depositPct < 100 ? ", balance on delivery confirmation" : ""}).`
  );

  if (type === "Manual Review Required") {
    rationaleLines.push("Admin manual review is required before executing this job.");
  }

  return {
    recommendation_type:                        type as PTRType,
    recommended_deposit_percentage:             depositPct,
    recommended_deposit_amount:                 depositAmount,
    recommended_balance_amount:                 balanceAmount,
    recommended_release_condition:              releaseCondition,
    recommended_delivery_confirmation_window_hours: confirmWindow,
    risk_level:                                 riskLevel as PTRRiskLevel,
    rationale:                                  rationaleLines.join(" "),
    key_risk_factors:                           riskFactors,
  };
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function ptrTypeColor(type: PTRType): string {
  const map: Record<PTRType, string> = {
    "Low-Risk Flexible Terms":       "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    "Standard Terms":                "text-blue-400 border-blue-500/30 bg-blue-500/10",
    "Deposit + Balance":             "text-blue-400 border-blue-500/30 bg-blue-500/10",
    "Higher Deposit Required":       "text-amber-400 border-amber-500/30 bg-amber-500/10",
    "Milestone Release":             "text-purple-400 border-purple-500/30 bg-purple-500/10",
    "Full Payment Before Execution": "text-red-400 border-red-500/30 bg-red-500/10",
    "Manual Review Required":        "text-orange-400 border-orange-500/30 bg-orange-500/10",
  };
  return map[type] ?? "text-slate-400 border-slate-700 bg-slate-800/50";
}

export function ptrRiskColor(risk: PTRRiskLevel): string {
  const map: Record<PTRRiskLevel, string> = {
    Low:      "text-emerald-400",
    Medium:   "text-blue-400",
    High:     "text-amber-400",
    Critical: "text-red-400",
  };
  return map[risk];
}

export function ptrTypeIcon(type: PTRType): string {
  const map: Record<PTRType, string> = {
    "Low-Risk Flexible Terms":       "✓",
    "Standard Terms":                "📋",
    "Deposit + Balance":             "💰",
    "Higher Deposit Required":       "⚠",
    "Milestone Release":             "🔄",
    "Full Payment Before Execution": "🔒",
    "Manual Review Required":        "🔍",
  };
  return map[type] ?? "•";
}

export function fmtPtrAmt(v: number | null | undefined, currency = "RM"): string {
  if (v == null) return "—";
  return `${currency} ${v.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Audit actions ──────────────────────────────────────────────────────────────

export const PTR_AUDIT_ACTIONS = {
  generated:  "payment_terms_recommendation_generated",
  accepted:   "payment_terms_recommendation_accepted",
  overridden: "payment_terms_recommendation_overridden",
} as const;
