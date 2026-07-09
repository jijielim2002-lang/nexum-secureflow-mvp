// ─── HS Code & Customs Classification ────────────────────────────────────────
// Types, constants, helpers, and audit actions for HS Code support.
//
// Compliance wording (per spec):
//   "duty/tax estimate"
//   "customs review required"
//   "HS Code subject to verification"
//   Do NOT provide legal/customs advice.

// ─── Customs Risk Level ───────────────────────────────────────────────────────

export const CUSTOMS_RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;
export type CustomsRiskLevel = typeof CUSTOMS_RISK_LEVELS[number];

export const CUSTOMS_RISK_COLOR: Record<CustomsRiskLevel, string> = {
  Low:      "text-emerald-400 border-emerald-500/30 bg-emerald-950/20",
  Medium:   "text-amber-400   border-amber-500/30   bg-amber-950/20",
  High:     "text-orange-400  border-orange-500/30  bg-orange-950/20",
  Critical: "text-red-400     border-red-500/30     bg-red-950/20",
};

export const CUSTOMS_RISK_BADGE: Record<CustomsRiskLevel, string> = {
  Low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium:   "bg-amber-500/15   text-amber-400   border-amber-500/30",
  High:     "bg-orange-500/15  text-orange-400  border-orange-500/30",
  Critical: "bg-red-500/15     text-red-400     border-red-500/30",
};

// ─── HS Code Source ───────────────────────────────────────────────────────────

export const HS_CODE_SOURCES = ["Manual", "Document Extracted", "Verified"] as const;
export type HsCodeSource = typeof HS_CODE_SOURCES[number];

export const HS_SOURCE_BADGE: Record<HsCodeSource, string> = {
  "Manual":              "bg-slate-700/50 text-slate-400 border-slate-600",
  "Document Extracted":  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Verified":            "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export const HS_SOURCE_ICON: Record<HsCodeSource, string> = {
  "Manual":             "✏",
  "Document Extracted": "📄",
  "Verified":           "✓",
};

// ─── Commodity Categories ─────────────────────────────────────────────────────

export const COMMODITY_CATEGORIES = [
  "Electronics & Technology",
  "Machinery & Equipment",
  "Chemicals & Pharmaceuticals",
  "Food & Beverages",
  "Textiles & Apparel",
  "Automotive & Transport",
  "Raw Materials & Commodities",
  "Medical Devices & Health",
  "Plastics & Rubber",
  "Metals & Metal Products",
  "Furniture & Home Goods",
  "Agriculture & Forestry",
  "Energy & Fuels",
  "Aerospace & Defence",
  "Other",
] as const;

export type CommodityCategory = typeof COMMODITY_CATEGORIES[number];

// ─── HS Code Interface ────────────────────────────────────────────────────────

export interface HsCodeBreakdown {
  hs_code?:               string | null;
  hs_code_description?:   string | null;
  hs_code_source?:        string | null;
  commodity_category?:    string | null;
  permit_required?:       boolean | null;
  permit_note?:           string | null;
  customs_risk_level?:    string | null;
  duty_rate_estimate?:    number | null;
  tax_rate_estimate?:     number | null;
}

// ─── Duty / Tax Estimate Calculator ──────────────────────────────────────────

export interface DutyTaxEstimate {
  duty_amount:     number | null;
  tax_amount:      number | null;
  total_duties:    number | null;
  base_used:       number;
  currency:        string;
  is_estimate:     true;
}

/**
 * Compute duty and tax estimate amounts from cargo base value and rates.
 * Duty = cargo_base * duty_rate / 100
 * Tax  = (cargo_base + duty) * tax_rate / 100
 * Returns null amounts if rates or base are missing.
 */
export function computeDutyTaxEstimate(
  cargoBaseAmount:  number | null | undefined,
  dutyRate:         number | null | undefined,
  taxRate:          number | null | undefined,
  currency         = "RM",
): DutyTaxEstimate {
  const base = cargoBaseAmount ?? 0;
  const duty = base > 0 && dutyRate != null && dutyRate > 0
    ? base * dutyRate / 100
    : null;
  const tax = base > 0 && taxRate != null && taxRate > 0
    ? (base + (duty ?? 0)) * taxRate / 100
    : null;
  return {
    duty_amount:  duty,
    tax_amount:   tax,
    total_duties: duty != null || tax != null ? (duty ?? 0) + (tax ?? 0) : null,
    base_used:    base,
    currency,
    is_estimate:  true,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtHsCode(code: string | null | undefined): string {
  if (!code) return "—";
  // Normalise: insert dots at standard positions if not present (6-digit HS)
  const clean = code.replace(/\./g, "").replace(/\s/g, "");
  if (clean.length === 6) return `${clean.slice(0, 4)}.${clean.slice(4)}`;
  if (clean.length === 8) return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6)}`;
  return code; // return as-is if non-standard length
}

export function fmtRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${rate.toFixed(2)}%`;
}

export function fmtAmount(amount: number | null | undefined, currency = "RM"): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)}`;
}

// ─── Alert helpers ────────────────────────────────────────────────────────────

/**
 * Returns a compliance alert if DDP is selected but HS code or duty/tax rate is missing.
 */
export function ddpCustomsAlert(cv: { incoterm?: string | null; duty_rate_estimate?: number | null }, hs: HsCodeBreakdown): string | null {
  if (cv.incoterm !== "DDP") return null;
  const missing: string[] = [];
  if (!hs.hs_code)                    missing.push("HS Code");
  if (!cv.duty_rate_estimate)         missing.push("Duty Rate Estimate");
  if (missing.length === 0)           return null;
  return `DDP incoterm — customs responsibility is on the provider. Missing: ${missing.join(", ")}. Customs review required before execution.`;
}

/**
 * Returns a permit alert if permit_required is true but permit_note is missing.
 */
export function permitAlert(hs: HsCodeBreakdown): string | null {
  if (!hs.permit_required) return null;
  if (!hs.permit_note) return "Permit/license required for this commodity. Permit details not yet documented.";
  return `Permit required: ${hs.permit_note}`;
}

/**
 * Returns extraction verification notice when hs_code came from document but not yet verified.
 */
export function extractionVerificationNotice(hs: HsCodeBreakdown): string | null {
  if (hs.hs_code_source !== "Document Extracted") return null;
  return "HS Code extracted from document — admin verification required. HS Code is subject to verification before use in customs declarations.";
}

// ─── Audit actions ────────────────────────────────────────────────────────────

export const HS_AUDIT_ACTIONS = {
  hs_code_added:                   "hs_code_added",
  hs_code_updated:                 "hs_code_updated",
  hs_code_extracted_from_document: "hs_code_extracted_from_document",
  hs_code_verified:                "hs_code_verified",
  customs_risk_updated:            "customs_risk_updated",
  permit_requirement_updated:      "permit_requirement_updated",
} as const;

export type HsAuditAction = typeof HS_AUDIT_ACTIONS[keyof typeof HS_AUDIT_ACTIONS];

// ─── Compliance wording ───────────────────────────────────────────────────────

export const HS_COMPLIANCE_WORDING = {
  estimate_only:    "Duty/tax amounts shown are estimates only based on declared rates. Actual amounts may vary. Customs review required before execution.",
  hs_unverified:    "HS Code is subject to verification. Nexum does not provide customs classification advice.",
  permit_notice:    "Permit/license requirement flagged — verify with relevant authority before shipment.",
  ddp_review:       "DDP incoterm requires provider to bear all customs costs. Nexum does not provide customs clearance services. Engage a licensed customs broker.",
  no_customs_api:   "Duty rates are manually entered estimates. Nexum is not connected to any live customs tariff database.",
} as const;

// ─── Summary line builder ─────────────────────────────────────────────────────

export function buildHsSummaryLine(hs: HsCodeBreakdown): string {
  const parts: string[] = [];
  if (hs.hs_code)             parts.push(`HS ${fmtHsCode(hs.hs_code)}`);
  if (hs.commodity_category)  parts.push(hs.commodity_category);
  if (hs.permit_required)     parts.push("Permit Req.");
  if (hs.customs_risk_level && hs.customs_risk_level !== "Medium") parts.push(`${hs.customs_risk_level} Customs Risk`);
  return parts.length ? parts.join(" · ") : "No HS Code entered";
}

// ─── Nexum Brain context builder ─────────────────────────────────────────────

export function hsBrainSummary(hs: HsCodeBreakdown): string {
  const lines: string[] = [];
  if (hs.hs_code)              lines.push(`HS Code: ${fmtHsCode(hs.hs_code)} (${hs.hs_code_source ?? "Manual"})`);
  if (hs.hs_code_description)  lines.push(`Description: ${hs.hs_code_description}`);
  if (hs.commodity_category)   lines.push(`Category: ${hs.commodity_category}`);
  if (hs.permit_required)      lines.push(`Permit Required: Yes — ${hs.permit_note ?? "details not documented"}`);
  if (hs.customs_risk_level)   lines.push(`Customs Risk: ${hs.customs_risk_level}`);
  if (hs.duty_rate_estimate)   lines.push(`Duty Rate Estimate: ${fmtRate(hs.duty_rate_estimate)}`);
  if (hs.tax_rate_estimate)    lines.push(`Tax Rate Estimate: ${fmtRate(hs.tax_rate_estimate)}`);
  return lines.join("\n");
}
