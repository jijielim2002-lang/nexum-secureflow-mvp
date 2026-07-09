// =============================================================================
// lib/cashflow.ts
// Pure types, computation functions, and helpers for Company Cash Flow Overview.
// No Supabase or React imports — safe to use in API routes, pages, and components.
// =============================================================================

// ─── Types ────────────────────────────────────────────────────────────────────

export type CashflowType =
  | "Cash Inflow" | "Cash Outflow"
  | "Receivable"  | "Payable"
  | "Nexum Held Amount" | "Nexum Release Expected"
  | "Supplier Advance"  | "Supplier Balance"
  | "Logistics Fee"     | "Duty / Tax" | "Insurance"
  | "Inventory Cost"    | "Customer Collection"
  | "Carrier Payment"   | "Haulier Payment"
  | "Warehouse / Storage" | "Claim Reserve"
  | "Refund" | "Other";

export type CashflowDirection = "Inflow" | "Outflow" | "Neutral";

export type CashflowStatus =
  | "Expected" | "Pending" | "Secured"
  | "Paid"     | "Received" | "Overdue"
  | "Disputed" | "Cancelled";

export type CompanyRole =
  | "Importer" | "Exporter" | "Freight Forwarder"
  | "Logistics Provider" | "Supplier" | "Buyer"
  | "Capital Partner" | "Other";

export type CashflowRiskLevel = "Low" | "Medium" | "High" | "Critical";

export type CashflowSourceLabel =
  | "Nexum-controlled"
  | "External / self-reported"
  | "Projected";

export interface CashflowItem {
  id:                    string;
  company_id:            string;
  company_role:          CompanyRole | null;
  job_reference:         string | null;
  procurement_reference: string | null;
  supplier_id:           string | null;
  cashflow_type:         CashflowType;
  cashflow_direction:    CashflowDirection;
  amount:                number;
  currency:              string;
  base_currency:         string;
  fx_rate_to_base:       number | null;
  base_amount:           number | null;
  expected_date:         string | null;   // YYYY-MM-DD
  actual_date:           string | null;
  status:                CashflowStatus;
  source_type:           string | null;
  source_id:             string | null;
  description:           string | null;
  is_nexum_controlled:   boolean;
  is_external:           boolean;
  is_projected:          boolean;
  created_at:            string;
  updated_at:            string;
}

export interface CashflowSnapshot {
  id:                          string;
  company_id:                  string;
  snapshot_date:               string;
  period_start:                string | null;
  period_end:                  string | null;
  total_expected_inflow:       number;
  total_expected_outflow:      number;
  total_receivables:           number;
  total_payables:              number;
  total_nexum_held:            number;
  total_nexum_release_expected: number;
  total_overdue_receivables:   number;
  total_overdue_payables:      number;
  net_cash_position:           number;
  projected_funding_gap:       number;
  currency:                    string;
  risk_level:                  CashflowRiskLevel;
  cashflow_note:               string | null;
  created_at:                  string;
}

export interface CashflowRiskFlag {
  code:        string;
  label:       string;
  severity:    "low" | "medium" | "high" | "critical";
  description: string;
}

export type TimelinePeriod = "this_week" | "next_30" | "next_60" | "next_90";

// ─── Computation helpers ──────────────────────────────────────────────────────

function effectiveAmount(item: CashflowItem): number {
  return item.base_amount ?? item.amount;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const ACTIVE_STATUSES: CashflowStatus[] = ["Expected", "Pending", "Secured", "Overdue", "Disputed"];

// ─── computeCashflowSnapshot ─────────────────────────────────────────────────
// Derives a snapshot record from a flat array of CashflowItems.
// Does NOT persist to DB — call the snapshot API route to save.

export function computeCashflowSnapshot(
  items: CashflowItem[],
  currency = "RM",
): Omit<CashflowSnapshot, "id" | "company_id" | "created_at"> {
  const today = todayStr();

  const sum = (filter: (i: CashflowItem) => boolean) =>
    items.filter(filter).reduce((acc, i) => acc + effectiveAmount(i), 0);

  const totalExpectedInflow = sum(
    (i) => i.cashflow_direction === "Inflow" && ACTIVE_STATUSES.includes(i.status),
  );
  const totalExpectedOutflow = sum(
    (i) => i.cashflow_direction === "Outflow" && ACTIVE_STATUSES.includes(i.status),
  );
  const totalReceivables = sum(
    (i) => i.cashflow_type === "Receivable" && !["Received", "Cancelled"].includes(i.status),
  );
  const totalPayables = sum(
    (i) => i.cashflow_type === "Payable" && !["Paid", "Cancelled"].includes(i.status),
  );
  const totalNexumHeld = sum(
    (i) => i.cashflow_type === "Nexum Held Amount" && i.is_nexum_controlled && i.status !== "Cancelled",
  );
  const totalNexumReleaseExpected = sum(
    (i) => i.cashflow_type === "Nexum Release Expected" && i.status !== "Cancelled",
  );
  const totalOverdueReceivables = sum(
    (i) => i.cashflow_type === "Receivable" && i.status === "Overdue",
  );
  const totalOverduePayables = sum(
    (i) => i.cashflow_type === "Payable" && i.status === "Overdue",
  );

  const netCashPosition      = totalExpectedInflow - totalExpectedOutflow;
  const projectedFundingGap  = netCashPosition < 0 ? Math.abs(netCashPosition) : 0;

  // Risk level heuristic
  let risk_level: CashflowRiskLevel = "Low";
  if (projectedFundingGap > 0 || totalOverdueReceivables > 0) risk_level = "Medium";
  if (projectedFundingGap > totalExpectedInflow * 0.25 || totalOverduePayables > 0) risk_level = "High";
  if (
    projectedFundingGap > totalExpectedInflow * 0.5 ||
    totalOverduePayables > totalPayables * 0.4 ||
    items.some((i) => i.status === "Disputed")
  ) risk_level = "Critical";

  return {
    snapshot_date:               today,
    period_start:                null,
    period_end:                  null,
    total_expected_inflow:       totalExpectedInflow,
    total_expected_outflow:      totalExpectedOutflow,
    total_receivables:           totalReceivables,
    total_payables:              totalPayables,
    total_nexum_held:            totalNexumHeld,
    total_nexum_release_expected: totalNexumReleaseExpected,
    total_overdue_receivables:   totalOverdueReceivables,
    total_overdue_payables:      totalOverduePayables,
    net_cash_position:           netCashPosition,
    projected_funding_gap:       projectedFundingGap,
    currency,
    risk_level,
    cashflow_note:               null,
  };
}

// ─── detectRiskFlags ─────────────────────────────────────────────────────────

export function detectRiskFlags(
  items: CashflowItem[],
  snapshot: Pick<CashflowSnapshot,
    | "total_expected_inflow" | "total_expected_outflow"
    | "total_overdue_receivables" | "total_overdue_payables"
    | "projected_funding_gap" | "total_nexum_held"
  >,
): CashflowRiskFlag[] {
  const flags: CashflowRiskFlag[] = [];
  const today = todayStr();

  // 1. Payables due before receivables
  const overdueOrNearPayables = items.filter(
    (i) =>
      i.cashflow_direction === "Outflow" &&
      i.expected_date &&
      i.expected_date <= today &&
      !["Paid", "Cancelled"].includes(i.status),
  );
  const pendingReceivables = items.filter(
    (i) =>
      i.cashflow_direction === "Inflow" &&
      i.expected_date &&
      i.expected_date > today &&
      !["Received", "Cancelled"].includes(i.status),
  );
  if (overdueOrNearPayables.length > 0 && pendingReceivables.length > 0) {
    flags.push({
      code:        "PAYABLE_BEFORE_RECEIVABLE",
      label:       "Payables due before receivables",
      severity:    "high",
      description: "Outgoing payments are due or overdue while incoming receipts have not yet cleared. Working capital pressure is likely.",
    });
  }

  // 2. High supplier advance before buyer collection
  const supplierAdvTotal = items
    .filter((i) => i.cashflow_type === "Supplier Advance" && !["Paid", "Cancelled"].includes(i.status))
    .reduce((s, i) => s + effectiveAmount(i), 0);
  const buyerCollectTotal = items
    .filter((i) => i.cashflow_type === "Customer Collection")
    .reduce((s, i) => s + effectiveAmount(i), 0);
  if (supplierAdvTotal > 0 && buyerCollectTotal > 0 && supplierAdvTotal > buyerCollectTotal * 0.5) {
    flags.push({
      code:        "HIGH_SUPPLIER_ADVANCE",
      label:       "High supplier advance before buyer collection",
      severity:    "medium",
      description: `Supplier advance commitment (${fmtAmt(supplierAdvTotal)}) exceeds 50% of expected buyer collection (${fmtAmt(buyerCollectTotal)}).`,
    });
  }

  // 3. Overdue receivables
  if (snapshot.total_overdue_receivables > 0) {
    flags.push({
      code:        "OVERDUE_RECEIVABLES",
      label:       "Overdue customer payment",
      severity:    "high",
      description: `${fmtAmt(snapshot.total_overdue_receivables)} in receivables past due. Customer collection may be delayed.`,
    });
  }

  // 4. Overdue payables
  if (snapshot.total_overdue_payables > 0) {
    flags.push({
      code:        "OVERDUE_PAYABLES",
      label:       "Overdue payables",
      severity:    "medium",
      description: `${fmtAmt(snapshot.total_overdue_payables)} in payables past due. Vendor relationships may be at risk.`,
    });
  }

  // 5. Multi-currency without FX rate
  const noFxItems = items.filter(
    (i) =>
      i.currency !== i.base_currency &&
      !i.fx_rate_to_base &&
      !["Cancelled"].includes(i.status),
  );
  if (noFxItems.length > 0) {
    flags.push({
      code:        "MULTI_CURRENCY_NO_FX",
      label:       "Multi-currency exposure — FX rate missing",
      severity:    "medium",
      description: `${noFxItems.length} item(s) in foreign currency with no FX rate set. Base-currency equivalent cannot be calculated accurately.`,
    });
  }

  // 6. Projected funding gap
  if (snapshot.projected_funding_gap > 0) {
    const gap    = snapshot.projected_funding_gap;
    const inflow = snapshot.total_expected_inflow || 1;
    const ratio  = gap / inflow;
    const severity: CashflowRiskFlag["severity"] =
      ratio > 0.5 ? "critical" : ratio > 0.25 ? "high" : "medium";
    flags.push({
      code:        "FUNDING_GAP",
      label:       "Projected funding gap",
      severity,
      description: `Projected outflows exceed inflows. Estimated working capital requirement: ${fmtAmt(gap)}.`,
    });
  }

  // 7. Claim reserve reducing available release
  const claimItems = items.filter(
    (i) => i.cashflow_type === "Claim Reserve" && i.status !== "Cancelled",
  );
  if (claimItems.length > 0) {
    const total = claimItems.reduce((s, i) => s + effectiveAmount(i), 0);
    flags.push({
      code:        "CLAIM_RESERVE",
      label:       "Claim reserve reducing available release",
      severity:    "medium",
      description: `${fmtAmt(total)} held as claim reserve. Nexum release may be reduced or delayed.`,
    });
  }

  // 8. Disputed items blocking release
  const disputed = items.filter((i) => i.status === "Disputed");
  if (disputed.length > 0) {
    flags.push({
      code:        "DISPUTED_ITEMS",
      label:       "Release blocked by dispute",
      severity:    "high",
      description: `${disputed.length} item(s) under dispute — Nexum release or payment may be delayed pending resolution.`,
    });
  }

  // 9. High cargo value but no Nexum coverage
  const cargoItems  = items.filter((i) => i.cashflow_type === "Inventory Cost");
  const nexumHeld   = snapshot.total_nexum_held;
  const cargoTotal  = cargoItems.reduce((s, i) => s + effectiveAmount(i), 0);
  if (cargoTotal > 0 && nexumHeld === 0) {
    flags.push({
      code:        "CARGO_NOT_COVERED",
      label:       "High inventory value with no Nexum coverage",
      severity:    "low",
      description: `${fmtAmt(cargoTotal)} in inventory/cargo cost recorded with no Nexum-held amount. Cargo exposure is outside Nexum workflow.`,
    });
  }

  // 10. Freight forwarder: vendor payment due before Nexum release
  const vendorPayments  = items.filter(
    (i) =>
      (i.cashflow_type === "Carrier Payment" || i.cashflow_type === "Haulier Payment") &&
      i.expected_date &&
      !["Paid", "Cancelled"].includes(i.status),
  );
  const nexumReleases = items.filter(
    (i) => i.cashflow_type === "Nexum Release Expected" && i.expected_date,
  );
  for (const vp of vendorPayments) {
    const releasesAfter = nexumReleases.filter(
      (r) => r.expected_date && vp.expected_date && r.expected_date > vp.expected_date,
    );
    if (releasesAfter.length > 0) {
      flags.push({
        code:        "VENDOR_BEFORE_RELEASE",
        label:       "Vendor payment due before Nexum release",
        severity:    "high",
        description: `Carrier / haulier payment (${vp.expected_date}) is due before Nexum release date. Provider must fund the gap from own resources.`,
      });
      break; // one flag is enough
    }
  }

  return flags;
}

// ─── groupItemsByTimeline ─────────────────────────────────────────────────────

export function groupItemsByTimeline(
  items: CashflowItem[],
): Record<TimelinePeriod, CashflowItem[]> {
  const today   = todayStr();
  const week    = dateOffset(7);
  const d30     = dateOffset(30);
  const d60     = dateOffset(60);
  const d90     = dateOffset(90);

  const inRange = (item: CashflowItem, from: string, to: string) => {
    const dt = item.expected_date ?? item.actual_date;
    return !!dt && dt >= from && dt <= to;
  };

  return {
    this_week: items.filter((i) => inRange(i, today, week)),
    next_30:   items.filter((i) => inRange(i, today, d30)),
    next_60:   items.filter((i) => inRange(i, today, d60)),
    next_90:   items.filter((i) => inRange(i, today, d90)),
  };
}

// ─── cashflowSourceLabel ──────────────────────────────────────────────────────

export function cashflowSourceLabel(item: CashflowItem): CashflowSourceLabel {
  if (item.is_nexum_controlled) return "Nexum-controlled";
  if (item.is_projected)        return "Projected";
  return "External / self-reported";
}

// ─── Direction defaults per cashflow type ────────────────────────────────────

export const DEFAULT_DIRECTION: Partial<Record<CashflowType, CashflowDirection>> = {
  "Cash Inflow":            "Inflow",
  "Cash Outflow":           "Outflow",
  "Receivable":             "Inflow",
  "Payable":                "Outflow",
  "Nexum Held Amount":      "Neutral",
  "Nexum Release Expected": "Inflow",
  "Supplier Advance":       "Outflow",
  "Supplier Balance":       "Outflow",
  "Logistics Fee":          "Outflow",
  "Duty / Tax":             "Outflow",
  "Insurance":              "Outflow",
  "Inventory Cost":         "Outflow",
  "Customer Collection":    "Inflow",
  "Carrier Payment":        "Outflow",
  "Haulier Payment":        "Outflow",
  "Warehouse / Storage":    "Outflow",
  "Claim Reserve":          "Neutral",
  "Refund":                 "Inflow",
  "Other":                  "Neutral",
};

// ─── Role-specific suggested types ───────────────────────────────────────────

export const ROLE_TYPE_HINTS: Partial<Record<CompanyRole, CashflowType[]>> = {
  Importer: [
    "Supplier Advance", "Supplier Balance", "Duty / Tax",
    "Logistics Fee", "Insurance", "Customer Collection",
    "Inventory Cost",
  ],
  Exporter: [
    "Inventory Cost", "Logistics Fee", "Customer Collection",
    "Receivable", "Insurance",
  ],
  "Freight Forwarder": [
    "Logistics Fee", "Carrier Payment", "Haulier Payment",
    "Warehouse / Storage", "Duty / Tax",
    "Nexum Held Amount", "Nexum Release Expected",
  ],
  "Logistics Provider": [
    "Logistics Fee", "Carrier Payment", "Haulier Payment",
    "Warehouse / Storage",
    "Nexum Held Amount", "Nexum Release Expected",
  ],
  Supplier: [
    "Inventory Cost", "Supplier Advance", "Supplier Balance",
    "Logistics Fee", "Receivable",
  ],
};

// ─── Risk level colours ───────────────────────────────────────────────────────

export const RISK_LEVEL_STYLES: Record<CashflowRiskLevel, string> = {
  Low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium:   "bg-amber-500/15  text-amber-400  border-amber-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Critical: "bg-red-500/15    text-red-400    border-red-500/30",
};

export const SEVERITY_STYLES: Record<CashflowRiskFlag["severity"], string> = {
  low:      "border-slate-600  bg-slate-800/60  text-slate-400",
  medium:   "border-amber-600/50 bg-amber-950/30 text-amber-300",
  high:     "border-orange-600/50 bg-orange-950/30 text-orange-300",
  critical: "border-red-600/50  bg-red-950/30   text-red-300",
};

export const DIRECTION_STYLES: Record<CashflowDirection, string> = {
  Inflow:  "text-emerald-400",
  Outflow: "text-red-400",
  Neutral: "text-slate-400",
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtAmt(n: number, currency?: string): string {
  const s = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
  return currency ? `${currency} ${s}` : s;
}

export function formatAmount(amount: number, currency: string): string {
  return fmtAmt(amount, currency);
}

export const ALL_CASHFLOW_TYPES: CashflowType[] = [
  "Cash Inflow", "Cash Outflow", "Receivable", "Payable",
  "Nexum Held Amount", "Nexum Release Expected",
  "Supplier Advance", "Supplier Balance",
  "Logistics Fee", "Duty / Tax", "Insurance",
  "Inventory Cost", "Customer Collection",
  "Carrier Payment", "Haulier Payment",
  "Warehouse / Storage", "Claim Reserve",
  "Refund", "Other",
];

export const ALL_STATUSES: CashflowStatus[] = [
  "Expected", "Pending", "Secured",
  "Paid", "Received", "Overdue", "Disputed", "Cancelled",
];

export const ALL_COMPANY_ROLES: CompanyRole[] = [
  "Importer", "Exporter", "Freight Forwarder",
  "Logistics Provider", "Supplier", "Buyer",
  "Capital Partner", "Other",
];
