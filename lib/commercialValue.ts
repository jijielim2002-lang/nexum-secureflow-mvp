// ─── Commercial Value Breakdown ───────────────────────────────────────────────
// Types, constants, helpers, and audit actions for structured job value.
//
// UI wording (per spec):
//   Cargo Value        = value of goods / risk exposure
//   Logistics Fee      = service provider charge
//   Total Secured Amount = amount controlled under Nexum workflow

// ─── Incoterms ────────────────────────────────────────────────────────────────

export const INCOTERM_LIST = [
  "EXW", "FCA", "FAS", "FOB",
  "CFR", "CIF", "CPT", "CIP",
  "DAP", "DPU", "DDP",
] as const;

export type Incoterm = typeof INCOTERM_LIST[number];

export interface IncotermInfo {
  value:       Incoterm;
  label:       string;
  riskBearer:  "Customer" | "Provider" | "Split";
  note:        string;
  ddpWarning?: boolean; // DDP means seller bears duty/tax — triggers duty_tax alert
}

export const INCOTERMS: IncotermInfo[] = [
  { value: "EXW", label: "EXW — Ex Works",                    riskBearer: "Customer", note: "All logistics/customs risk on customer from seller's premises." },
  { value: "FCA", label: "FCA — Free Carrier",                riskBearer: "Split",    note: "Risk transfers at named carrier. Common in air & road freight." },
  { value: "FAS", label: "FAS — Free Alongside Ship",         riskBearer: "Split",    note: "Risk transfers at ship's side at port of shipment." },
  { value: "FOB", label: "FOB — Free On Board",               riskBearer: "Split",    note: "Risk transfers once goods loaded on vessel. Most common sea term." },
  { value: "CFR", label: "CFR — Cost & Freight",              riskBearer: "Customer", note: "Seller pays freight; risk in transit on customer." },
  { value: "CIF", label: "CIF — Cost, Insurance & Freight",   riskBearer: "Customer", note: "Seller pays freight & minimum insurance; risk in transit on customer." },
  { value: "CPT", label: "CPT — Carriage Paid To",            riskBearer: "Customer", note: "Risk transfers at first carrier; seller pays to destination." },
  { value: "CIP", label: "CIP — Carriage & Insurance Paid",   riskBearer: "Customer", note: "Seller pays full insurance cover; risk transfers at first carrier." },
  { value: "DAP", label: "DAP — Delivered At Place",          riskBearer: "Provider", note: "Seller/provider bears all risk to destination; customer handles customs." },
  { value: "DPU", label: "DPU — Delivered At Place Unloaded", riskBearer: "Provider", note: "Seller/provider bears all risk including unloading at destination." },
  { value: "DDP", label: "DDP — Delivered Duty Paid",         riskBearer: "Provider", note: "Seller bears ALL costs including duty/tax. Highest seller obligation.", ddpWarning: true },
];

export const INCOTERM_MAP: Record<string, IncotermInfo> = Object.fromEntries(
  INCOTERMS.map((i) => [i.value, i]),
);

// ─── Payment Purpose ─────────────────────────────────────────────────────────

export const PAYMENT_PURPOSE_VALUES = [
  "Cargo / Supplier Payment",
  "Logistics Fee",
  "Duty / Tax",
  "Insurance",
  "Additional Charges",
  "Nexum Service Fee",
  "Refund",
  "Other",
] as const;

export type PaymentPurpose = typeof PAYMENT_PURPOSE_VALUES[number];

export const PAYMENT_PURPOSE_COLOR: Record<PaymentPurpose, string> = {
  "Cargo / Supplier Payment": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Logistics Fee":            "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Duty / Tax":               "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Insurance":                "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Additional Charges":       "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Nexum Service Fee":        "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "Refund":                   "bg-red-500/15 text-red-400 border-red-500/30",
  "Other":                    "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export const PAYMENT_PURPOSE_ICON: Record<PaymentPurpose, string> = {
  "Cargo / Supplier Payment": "📦",
  "Logistics Fee":            "🚛",
  "Duty / Tax":               "🏛",
  "Insurance":                "🛡",
  "Additional Charges":       "➕",
  "Nexum Service Fee":        "⬡",
  "Refund":                   "↩",
  "Other":                    "·",
};

// ─── Currency options ─────────────────────────────────────────────────────────

export const CURRENCY_OPTIONS = [
  { value: "RM",  label: "RM — Malaysian Ringgit",  symbol: "RM" },
  { value: "USD", label: "USD — US Dollar",           symbol: "$" },
  { value: "SGD", label: "SGD — Singapore Dollar",   symbol: "S$" },
  { value: "EUR", label: "EUR — Euro",                symbol: "€" },
  { value: "GBP", label: "GBP — British Pound",       symbol: "£" },
  { value: "CNY", label: "CNY — Chinese Yuan",        symbol: "¥" },
  { value: "AUD", label: "AUD — Australian Dollar",  symbol: "A$" },
  { value: "JPY", label: "JPY — Japanese Yen",        symbol: "¥" },
  { value: "THB", label: "THB — Thai Baht",           symbol: "฿" },
  { value: "IDR", label: "IDR — Indonesian Rupiah",  symbol: "Rp" },
  { value: "PHP", label: "PHP — Philippine Peso",    symbol: "₱" },
  { value: "VND", label: "VND — Vietnamese Dong",    symbol: "₫" },
] as const;

// ─── Breakdown interface ─────────────────────────────────────────────────────

export interface CommercialValueBreakdown {
  incoterm?:                    string | null;
  // Cargo
  cargo_value_amount?:          number | null;
  cargo_value_currency?:        string;
  cargo_value_fx_rate_to_base?: number | null;
  cargo_value_base_amount?:     number | null;
  // Logistics
  logistics_fee_amount?:        number | null;
  logistics_fee_currency?:      string;
  // Duty / Tax
  duty_tax_estimate_amount?:    number | null;
  duty_tax_currency?:           string;
  // Insurance
  insurance_cost_amount?:       number | null;
  insurance_cost_currency?:     string;
  // Additional
  additional_charges_amount?:   number | null;
  additional_charges_currency?: string;
  // Total
  total_secured_amount?:        number | null;
  total_secured_currency?:      string;
  base_currency?:               string;
  // Legacy
  job_value?:                   number | null;
  currency?:                    string;
  // ── Secured component selection ──────────────────────────────────────────
  // null / undefined treated as default: logistics_fee = true, others = false.
  // Only components marked true are included in Total Secured Amount and
  // in payment_obligations.  Cargo Value is NEVER auto-included.
  secure_logistics_fee?:          boolean | null;
  secure_cargo_supplier_payment?: boolean | null;
  secure_duty_tax?:               boolean | null;
  secure_insurance?:              boolean | null;
  secure_additional_charges?:     boolean | null;
}

// ─── UI Wording ───────────────────────────────────────────────────────────────

export const CV_LABEL = {
  cargo_value:        "Cargo Value",
  logistics_fee:      "Logistics Fee",
  duty_tax:           "Duty / Tax Estimate",
  insurance:          "Insurance Cost",
  additional_charges: "Additional Charges",
  total_secured:      "Total Secured Amount",
} as const;

export const CV_DESC = {
  cargo_value:        "Value of goods / risk exposure. Used for customs, insurance, and trade reference. Not automatically a payment obligation.",
  logistics_fee:      "Service provider charge. This is the primary amount secured under Nexum workflow.",
  total_secured:      "Total amount controlled under Nexum SecureFlow workflow. Includes whichever components are agreed as payment obligations.",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtCV(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || amount === 0) return "—";
  const c = currency ?? "RM";
  return `${c} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)}`;
}

export function fmtFxRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `1 : ${rate.toFixed(4)}`;
}

/**
 * Compute the total secured amount from breakdown components.
 * Uses base-currency amounts for cargo (via fx rate) if cargo currency differs from base.
 */
export function computeTotalSecuredAmount(
  cv: CommercialValueBreakdown,
  baseCurrency = "RM",
): number {
  const logistics  = cv.logistics_fee_amount ?? 0;
  const duty       = cv.duty_tax_estimate_amount ?? 0;
  const insurance  = cv.insurance_cost_amount ?? 0;
  const additional = cv.additional_charges_amount ?? 0;

  let cargoBase = 0;
  if (cv.cargo_value_amount) {
    const cargoCurrency = cv.cargo_value_currency ?? baseCurrency;
    if (cargoCurrency === baseCurrency) {
      cargoBase = cv.cargo_value_amount;
    } else if (cv.cargo_value_fx_rate_to_base) {
      cargoBase = cv.cargo_value_amount * cv.cargo_value_fx_rate_to_base;
    } else if (cv.cargo_value_base_amount) {
      cargoBase = cv.cargo_value_base_amount;
    }
    // If no fx rate provided, cargo is excluded from auto-computation
  }

  return logistics + duty + insurance + additional + cargoBase;
}

// ─── Secured-scope result ────────────────────────────────────────────────────

export interface SecuredScopeComponent {
  label:    string;
  amount:   number;
  currency: string;
}

export interface SecuredScopeResult {
  /** Numeric total — 0 when multi-currency without FX, or no components selected. */
  amount:          number;
  /** null when multi-currency and FX is not fully resolvable. */
  currency:        string | null;
  isMultiCurrency: boolean;
  currencies:      string[];
  components:      SecuredScopeComponent[];
  /** Human-readable note for display. */
  note:            string;
  /** True when there are multiple currencies and full FX conversion was not possible. */
  requiresFxNote:  boolean;
}

/**
 * Compute which value components are placed under Nexum workflow based on
 * `secure_*` flags and return a structured scope result.
 *
 * Defaults: secure_logistics_fee = true (all others false).
 * Multi-currency: sums in base_currency when FX rate is available; otherwise
 * sets `requiresFxNote = true` so the UI can warn the admin.
 *
 * This function never auto-converts FX unless `cargo_value_fx_rate_to_base`
 * (or `cargo_value_base_amount`) is explicitly provided.
 */
export function computeSecuredScope(cv: CommercialValueBreakdown): SecuredScopeResult {
  const base = cv.base_currency ?? cv.currency ?? "USD";

  // Resolve flags — null/undefined → default value
  const secureLogistics  = cv.secure_logistics_fee          !== false; // default true
  const secureCargo      = cv.secure_cargo_supplier_payment === true;  // default false
  const secureDutyTax    = cv.secure_duty_tax               === true;  // default false
  const secureInsurance  = cv.secure_insurance              === true;  // default false
  const secureAdditional = cv.secure_additional_charges     === true;  // default false

  const components: SecuredScopeComponent[] = [];

  if (secureLogistics && (cv.logistics_fee_amount ?? 0) > 0) {
    components.push({
      label:    "Logistics Fee",
      amount:   cv.logistics_fee_amount!,
      currency: cv.logistics_fee_currency ?? base,
    });
  }
  if (secureCargo && (cv.cargo_value_amount ?? 0) > 0) {
    components.push({
      label:    "Cargo / Supplier Payment",
      amount:   cv.cargo_value_amount!,
      currency: cv.cargo_value_currency ?? base,
    });
  }
  if (secureDutyTax && (cv.duty_tax_estimate_amount ?? 0) > 0) {
    components.push({
      label:    "Duty / Tax",
      amount:   cv.duty_tax_estimate_amount!,
      currency: cv.duty_tax_currency ?? base,
    });
  }
  if (secureInsurance && (cv.insurance_cost_amount ?? 0) > 0) {
    components.push({
      label:    "Insurance",
      amount:   cv.insurance_cost_amount!,
      currency: cv.insurance_cost_currency ?? base,
    });
  }
  if (secureAdditional && (cv.additional_charges_amount ?? 0) > 0) {
    components.push({
      label:    "Additional Charges",
      amount:   cv.additional_charges_amount!,
      currency: cv.additional_charges_currency ?? base,
    });
  }

  if (components.length === 0) {
    return {
      amount: 0, currency: null, isMultiCurrency: false,
      currencies: [], components, requiresFxNote: false,
      note: "No components selected as secured payment obligations.",
    };
  }

  const currencies = [...new Set(components.map((c) => c.currency))];
  const isMultiCurrency = currencies.length > 1;

  if (!isMultiCurrency) {
    const total = components.reduce((s, c) => s + c.amount, 0);
    return {
      amount: total,
      currency: currencies[0],
      isMultiCurrency: false,
      currencies,
      components,
      requiresFxNote: false,
      note: `Secured: ${components.map((c) => c.label).join(" + ")} (${currencies[0]})`,
    };
  }

  // Multi-currency: try to convert everything to base
  let total = 0;
  let canConvert = true;
  for (const c of components) {
    if (c.currency === base) {
      total += c.amount;
    } else if (
      c.label === "Cargo / Supplier Payment" &&
      (cv.cargo_value_fx_rate_to_base ?? cv.cargo_value_base_amount)
    ) {
      const baseAmt = cv.cargo_value_base_amount
        ?? c.amount * cv.cargo_value_fx_rate_to_base!;
      total += baseAmt;
    } else {
      canConvert = false;
      break;
    }
  }

  if (canConvert) {
    return {
      amount: total,
      currency: base,
      isMultiCurrency: true,
      currencies,
      components,
      requiresFxNote: false,
      note: `Multi-currency — total converted to ${base} using provided FX rates.`,
    };
  }

  return {
    amount: 0,
    currency: null,
    isMultiCurrency: true,
    currencies,
    components,
    requiresFxNote: true,
    note: `Multi-currency secured amount. Currencies: ${currencies.join(", ")}. ` +
          `Provide FX rate to ${base} to calculate a single total.`,
  };
}

/**
 * True when a job has any commercial value breakdown populated.
 */
export function hasCommercialValueData(cv: CommercialValueBreakdown): boolean {
  return !!(
    cv.cargo_value_amount ||
    cv.logistics_fee_amount ||
    cv.duty_tax_estimate_amount ||
    cv.insurance_cost_amount ||
    cv.additional_charges_amount ||
    cv.total_secured_amount
  );
}

/**
 * Returns alert text if DDP incoterm is used but duty/tax estimate is missing.
 */
export function ddpDutyAlert(cv: CommercialValueBreakdown): string | null {
  if (cv.incoterm === "DDP" && !cv.duty_tax_estimate_amount) {
    return "DDP incoterm selected but duty/tax estimate is missing. Under DDP, the service provider is responsible for all duty/tax costs.";
  }
  return null;
}

/**
 * Build a summary line for display e.g. "RM 5,000 logistics | USD 50,000 cargo | DDP"
 */
export function buildCVSummaryLine(cv: CommercialValueBreakdown): string {
  const parts: string[] = [];
  if (cv.logistics_fee_amount)     parts.push(`${fmtCV(cv.logistics_fee_amount, cv.logistics_fee_currency)} logistics`);
  if (cv.cargo_value_amount)       parts.push(`${fmtCV(cv.cargo_value_amount, cv.cargo_value_currency)} cargo`);
  if (cv.duty_tax_estimate_amount) parts.push(`${fmtCV(cv.duty_tax_estimate_amount, cv.duty_tax_currency)} duty/tax`);
  if (cv.incoterm)                 parts.push(cv.incoterm);
  return parts.length ? parts.join(" · ") : "No commercial value breakdown";
}

// ─── Audit actions ────────────────────────────────────────────────────────────

export const CV_AUDIT_ACTIONS = {
  breakdown_added:          "commercial_value_breakdown_added",
  cargo_value_updated:      "cargo_value_updated",
  logistics_fee_updated:    "logistics_fee_updated",
  total_secured_updated:    "total_secured_amount_updated",
  payment_purpose_added:    "payment_purpose_added",
  fx_rate_updated:          "fx_rate_updated",
} as const;

export type CvAuditAction = typeof CV_AUDIT_ACTIONS[keyof typeof CV_AUDIT_ACTIONS];

// ─── Nexum Brain context helpers ──────────────────────────────────────────────

/** Summarise commercial value for Nexum Brain context injection. */
export function cvBrainSummary(cv: CommercialValueBreakdown): string {
  const lines: string[] = [];
  if (cv.incoterm)                 lines.push(`Incoterm: ${cv.incoterm}`);
  if (cv.cargo_value_amount)       lines.push(`Cargo Value: ${fmtCV(cv.cargo_value_amount, cv.cargo_value_currency)}`);
  if (cv.cargo_value_fx_rate_to_base) lines.push(`Cargo FX Rate to ${cv.base_currency ?? "RM"}: ${cv.cargo_value_fx_rate_to_base}`);
  if (cv.logistics_fee_amount)     lines.push(`Logistics Fee: ${fmtCV(cv.logistics_fee_amount, cv.logistics_fee_currency)}`);
  if (cv.duty_tax_estimate_amount) lines.push(`Duty/Tax Estimate: ${fmtCV(cv.duty_tax_estimate_amount, cv.duty_tax_currency)}`);
  if (cv.insurance_cost_amount)    lines.push(`Insurance Cost: ${fmtCV(cv.insurance_cost_amount, cv.insurance_cost_currency)}`);
  if (cv.additional_charges_amount) lines.push(`Additional Charges: ${fmtCV(cv.additional_charges_amount, cv.additional_charges_currency)}`);
  if (cv.total_secured_amount)     lines.push(`Total Secured: ${fmtCV(cv.total_secured_amount, cv.total_secured_currency)}`);
  if (cv.base_currency)            lines.push(`Base Currency: ${cv.base_currency}`);
  return lines.join("\n");
}
