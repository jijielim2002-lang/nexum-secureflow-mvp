// ─── Types ────────────────────────────────────────────────────────────────────

export type PackStatus = "Draft" | "Generated" | "Shared" | "Expired";

/** Stored in credit_packs.credit_summary (JSONB) */
export interface CreditSummaryData {
  // Offer fields
  companyName:          string | null;
  productType:          string;
  recommendedAmount:    number | null;
  offerAmount:          number | null;
  currency:             string;
  tenure:               number | null;
  estimatedFee:         number | null;
  repaymentSource:      string | null;
  offerConditions:      string[];
  offerRiskNotes:       string[];
  // Readiness
  readinessScore:       number | null;
  readinessStatus:      string | null;
  assessmentType:       string | null;
  keyStrengths:         string[];
  keyRisks:             string[];
  requiredConditions:   string[];
  // Company intel
  overallTrustScore:    number | null;
  paymentBehaviorScore: number | null;
  operationalReliabilityScore: number | null;
  riskLevel:            string | null;
  trend:                string | null;
  financingReadiness:   string | null;
  completedJobs:        number | null;
  criticalExceptions:   number | null;
}

/** Stored in credit_packs.evidence_summary (JSONB) */
export interface EvidenceSummaryData {
  // Job
  jobReference:       string | null;
  jobValue:           number | null;
  jobCurrency:        string | null;
  jobStatus:          string | null;
  paymentStatus:      string | null;
  customer:           string | null;
  serviceProvider:    string | null;
  serviceType:        string | null;
  route:              string | null;
  commodity:          string | null;
  // Documents
  verifiedDocTypes:        string[];
  extractionAvgConfidence: number | null;
  missingDocTypes:         string[];
  // Shipment
  trackingStatus:   string | null;
  delayDays:        number;
  eta:              string | null;
  blNumber:         string | null;
  awbNumber:        string | null;
  containerNumber:  string | null;
  vesselName:       string | null;
  flightNumber:     string | null;
  dataSource:       string | null;
  // Payment ledger
  paymentObRows:       Array<{ type: string; amount: number; currency: string; status: string; dueDate: string | null }>;
  totalOutstanding:    number;
  overdueCount:        number;
  verifiedObligations: number;
}

/** Stored in credit_packs.risk_summary (JSONB) */
export interface RiskSummaryData {
  openExceptions:       number;
  criticalExceptions:   number;
  overdueObligations:   number;
  shipmentDelay:        number;
  exceptionTypes:       string[];
  keyRisks:             string[];
  requiredConditions:   string[];
  offerRiskNotes:       string[];
  supplyDisruptionRisk: string | null;
  marginPercentage:     number | null;
}

/** Full credit_packs row */
export interface CreditPackRow {
  id:                    string;
  offer_id:              string | null;
  assessment_id:         string | null;
  job_reference:         string | null;
  company_id:            string | null;
  pack_status:           PackStatus;
  pack_title:            string | null;
  executive_summary:     string | null;
  credit_summary:        CreditSummaryData | null;
  evidence_summary:      EvidenceSummaryData | null;
  risk_summary:          RiskSummaryData | null;
  recommended_conditions: string | null;
  generated_by:          string | null;
  generated_at:          string | null;
  created_at:            string;
  updated_at:            string;
}

/** Lightweight row for list/command-center */
export interface CreditPackSummaryRow {
  id:              string;
  offer_id:        string | null;
  assessment_id:   string | null;
  job_reference:   string | null;
  company_id:      string | null;
  pack_status:     PackStatus;
  pack_title:      string | null;
  generated_at:    string | null;
  created_at:      string;
  // Extracted scalars from view
  company_name:    string | null;
  product_type:    string | null;
  offer_amount:    number | null;
  currency:        string | null;
  readiness_status: string | null;
  readiness_score: number | null;
  risk_level:      string | null;
  open_exceptions:      number | null;
  critical_exceptions:  number | null;
  overdue_obligations:  number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PACK_STATUS_BADGE: Record<PackStatus, string> = {
  Draft:     "border-slate-700 bg-slate-800 text-slate-400",
  Generated: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Shared:    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Expired:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

export const CREDIT_PACK_DISCLAIMER =
  "This credit pack is generated for information and decision-support purposes only. " +
  "It is not a loan approval, credit offer, guarantee, or disbursement commitment. " +
  "All figures are based on Nexum SecureFlow internal records at the time of generation. " +
  "Final credit decisions remain subject to the capital partner's own assessment and approval process.";

export const STANDARD_DOC_TYPES = [
  "Commercial Invoice",
  "Bill of Lading",
  "Airway Bill",
  "Packing List",
  "Proof of Delivery",
  "Payment Proof",
  "Purchase Order",
  "Letter of Credit",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildExecutiveSummary(cs: CreditSummaryData, es: EvidenceSummaryData, rs: RiskSummaryData): string {
  const parts: string[] = [];

  parts.push(
    `${cs.companyName ?? "This company"} has been assessed as ${cs.readinessStatus ?? "—"} ` +
    `for ${cs.productType} financing with a capital readiness score of ${cs.readinessScore ?? "—"}/100.`
  );

  if (cs.offerAmount != null) {
    parts.push(
      `The simulated offer amount is ${cs.currency} ${cs.offerAmount.toLocaleString("en-MY")}` +
      (cs.tenure != null ? ` over ${cs.tenure} days` : "") +
      (cs.estimatedFee != null ? `, with an estimated fee of ${cs.currency} ${cs.estimatedFee.toLocaleString("en-MY")}` : "") +
      "."
    );
  }

  if (cs.repaymentSource) {
    parts.push(`Repayment source: ${cs.repaymentSource}.`);
  }

  if (cs.keyStrengths.length > 0) {
    parts.push(`${cs.keyStrengths.length} key strength${cs.keyStrengths.length > 1 ? "s" : ""} identified.`);
  }

  if (rs.openExceptions > 0 || rs.overdueObligations > 0) {
    const flags: string[] = [];
    if (rs.criticalExceptions > 0) flags.push(`${rs.criticalExceptions} critical exception${rs.criticalExceptions > 1 ? "s" : ""}`);
    if (rs.overdueObligations > 0) flags.push(`${rs.overdueObligations} overdue obligation${rs.overdueObligations > 1 ? "s" : ""}`);
    parts.push(`Risk flags: ${flags.join(", ")} require attention before proceeding.`);
  } else {
    parts.push("No material risk flags identified at time of generation.");
  }

  return parts.join(" ");
}

export function buildShareSummary(pack: CreditPackRow): string {
  const cs = pack.credit_summary;
  const rs = pack.risk_summary;
  if (!cs) return "Credit pack data unavailable.";

  const lines: string[] = [
    "NEXUM SECUREFLOW — CREDIT PACK SUMMARY",
    "═".repeat(40),
    `Company:          ${cs.companyName ?? "—"}`,
    `Product:          ${cs.productType}`,
    `Offer Amount:     ${cs.currency} ${cs.offerAmount?.toLocaleString("en-MY") ?? "—"}`,
    `Tenure:           ${cs.tenure != null ? `${cs.tenure} days` : "—"}`,
    `Estimated Fee:    ${cs.currency} ${cs.estimatedFee?.toLocaleString("en-MY") ?? "—"}`,
    `Readiness:        ${cs.readinessStatus ?? "—"} (Score: ${cs.readinessScore ?? "—"}/100)`,
    `Risk Level:       ${cs.riskLevel ?? "—"}`,
    `Repayment Source: ${cs.repaymentSource ?? "—"}`,
    "",
  ];

  if (cs.keyStrengths.length > 0) {
    lines.push("Key Strengths:");
    cs.keyStrengths.forEach((s) => lines.push(`  • ${s}`));
    lines.push("");
  }

  if (cs.requiredConditions.length > 0) {
    lines.push("Required Conditions:");
    cs.requiredConditions.forEach((c) => lines.push(`  • ${c}`));
    lines.push("");
  }

  if (rs && (rs.openExceptions > 0 || rs.overdueObligations > 0)) {
    lines.push("Risk Flags:");
    if (rs.criticalExceptions > 0) lines.push(`  ⚠ ${rs.criticalExceptions} critical exception(s)`);
    if (rs.overdueObligations  > 0) lines.push(`  ⚠ ${rs.overdueObligations} overdue obligation(s)`);
    if (rs.shipmentDelay       > 0) lines.push(`  ⚠ ${rs.shipmentDelay} day shipment delay`);
    lines.push("");
  }

  lines.push("─".repeat(40));
  lines.push("⚠ " + CREDIT_PACK_DISCLAIMER);
  lines.push(`Generated: ${pack.generated_at ? new Date(pack.generated_at).toLocaleString("en-MY") : "—"}`);

  return lines.join("\n");
}
