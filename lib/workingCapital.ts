// =============================================================================
// lib/workingCapital.ts
// Working Capital Need Detector — pure types, detection rules, risk/confidence
// scoring, and utility helpers.
//
// No Supabase or React imports — safe to use in API routes and server code.
// =============================================================================

import type { CashflowItem } from "@/lib/cashflow";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NeedType =
  | "Supplier Advance Gap"
  | "Supplier Balance Gap"
  | "Duty / Tax Gap"
  | "Logistics Fee Gap"
  | "Carrier / Vendor Payment Gap"
  | "Inventory Funding Gap"
  | "Receivables Gap"
  | "Release Delay Gap"
  | "Claim Reserve Gap"
  | "FX Timing Gap"
  | "Other";

export type NeedStatus =
  | "Detected"
  | "Under Review"
  | "Eligible for Simulation"
  | "Not Suitable"
  | "Converted to Financing Simulation"
  | "Resolved"
  | "Dismissed";

export type NeedRiskLevel = "Low" | "Medium" | "High" | "Critical";

export type WcnCompanyRole =
  | "Importer" | "Exporter" | "Freight Forwarder"
  | "Logistics Provider" | "Supplier" | "Buyer" | "Other";

export interface WorkingCapitalNeed {
  id:                      string;
  need_reference:          string;
  company_id:              string | null;
  company_name:            string | null;
  company_role:            WcnCompanyRole | null;
  job_reference:           string | null;
  procurement_reference:   string | null;
  supplier_id:             string | null;
  need_type:               NeedType;
  need_status:             NeedStatus;
  gap_amount:              number | null;
  currency:                string;
  base_currency:           string;
  fx_rate_to_base:         number | null;
  base_gap_amount:         number | null;
  gap_start_date:          string | null;
  gap_end_date:            string | null;
  estimated_gap_days:      number | null;
  expected_inflow_amount:  number | null;
  expected_inflow_date:    string | null;
  expected_outflow_amount: number | null;
  expected_outflow_date:   string | null;
  repayment_source:        string | null;
  supporting_evidence:     Record<string, unknown> | null;
  risk_level:              NeedRiskLevel;
  confidence_score:        number | null;
  rationale:               string | null;
  recommended_next_action: string | null;
  created_by_system:       boolean;
  reviewed_by:             string | null;
  reviewed_at:             string | null;
  review_note:             string | null;
  financing_offer_id:      string | null;
  created_at:              string;
  updated_at:              string;
}

/** Subset used when inserting new needs (no id/timestamps) */
export type WorkingCapitalNeedInput = Omit<
  WorkingCapitalNeed,
  "id" | "created_at" | "updated_at" | "reviewed_by" | "reviewed_at" | "review_note" | "financing_offer_id"
> & { need_reference: string };

// ─── Detection input data ─────────────────────────────────────────────────────

export interface ScopedJobData {
  job_reference:               string;
  service_type:                string;
  incoterm:                    string | null;
  currency:                    string;
  duty_tax_estimate_amount:    number | null;
  duty_tax_currency:           string | null;
  logistics_fee_amount:        number | null;
  logistics_fee_currency:      string | null;
  total_secured_amount:        number | null;
  total_secured_currency:      string | null;
  payment_status:              string;
  job_status:                  string;
  customer_company_id:         string | null;
  service_provider_company_id: string | null;
}

export interface ClaimReserveData {
  id:             string;
  job_reference:  string;
  reserve_amount: number;
  currency:       string;
  reserve_status: string;
  reserve_type:   string | null;
}

export interface PaymentObligationData {
  id:              string;
  job_reference:   string;
  obligation_type: string;
  amount:          number;
  currency:        string;
  status:          string;
  due_date:        string | null;
}

// ─── Need reference generator ─────────────────────────────────────────────────

export function generateNeedReference(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `WCN-${date}-${rand}`;
}

// ─── Product type mapping ─────────────────────────────────────────────────────
// Maps NeedType → FinancingProductType in lib/financingOffers.ts

export const NEED_TO_PRODUCT_TYPE: Record<NeedType, string> = {
  "Supplier Advance Gap":        "Supplier Deposit Support",
  "Supplier Balance Gap":        "Supplier Deposit Support",
  "Duty / Tax Gap":              "Working Capital",
  "Logistics Fee Gap":           "Provider Receivable Financing",
  "Carrier / Vendor Payment Gap": "Provider Receivable Financing",
  "Inventory Funding Gap":       "Working Capital",
  "Receivables Gap":             "Provider Receivable Financing",
  "Release Delay Gap":           "Provider Receivable Financing",
  "Claim Reserve Gap":           "Working Capital",
  "FX Timing Gap":               "Working Capital",
  "Other":                       "Working Capital",
};

// ─── Risk / confidence helpers ────────────────────────────────────────────────

function scoreRisk(
  items:   CashflowItem[],
  gapAmt:  number,
  options: { hasDispute?: boolean; hasOverdue?: boolean; hasMissingDate?: boolean },
): NeedRiskLevel {
  let score = 2; // base = Medium

  if (options.hasDispute)     score += 2;
  if (options.hasOverdue)     score += 1;
  if (gapAmt > 500_000)       score += 1;
  if (gapAmt > 100_000)       score += 1;
  if (options.hasMissingDate) score += 1;

  // Nexum-controlled items reduce risk
  const nexumRatio = items.length > 0
    ? items.filter((i) => i.is_nexum_controlled).length / items.length
    : 0;
  if (nexumRatio > 0.7) score -= 1;

  // External/projected items increase uncertainty
  const projectedRatio = items.length > 0
    ? items.filter((i) => i.is_projected || i.is_external).length / items.length
    : 0;
  if (projectedRatio > 0.5) score += 1;

  if (score <= 1) return "Low";
  if (score === 2) return "Medium";
  if (score === 3) return "High";
  return "Critical";
}

function scoreConfidence(
  items:   CashflowItem[],
  options: { hasVerifiedDates?: boolean; hasDispute?: boolean; hasOverdue?: boolean },
): number {
  let score = 75;

  if (items.length === 0) return 40;

  const nexumCount     = items.filter((i) => i.is_nexum_controlled).length;
  const externalCount  = items.filter((i) => i.is_external || i.is_projected).length;
  const missingDateCnt = items.filter((i) => !i.expected_date && !i.actual_date).length;

  score += Math.round((nexumCount / items.length) * 15);
  score -= Math.round((externalCount / items.length) * 25);
  score -= Math.round((missingDateCnt / items.length) * 15);

  if (options.hasOverdue)        score += 10; // confirmed real
  if (options.hasDispute)        score += 5;  // documented
  if (options.hasVerifiedDates)  score += 5;

  return Math.max(10, Math.min(100, score));
}

// ─── Helper: effective amount ─────────────────────────────────────────────────

function eff(item: CashflowItem): number {
  return item.base_amount ?? item.amount;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diff / 86_400_000);
}

// ─── Detection rules ──────────────────────────────────────────────────────────

/**
 * Rule 1 + 2: Supplier Advance / Balance gap
 * Outflow items of type Supplier Advance/Balance that lack matching inflow
 * before their expected date.
 */
export function detectSupplierGaps(
  items:      CashflowItem[],
  companyId:  string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const needs: WorkingCapitalNeedInput[] = [];

  const supplierOutflows = items.filter(
    (i) =>
      (i.cashflow_type === "Supplier Advance" || i.cashflow_type === "Supplier Balance") &&
      !["Paid", "Cancelled"].includes(i.status) &&
      i.cashflow_direction === "Outflow",
  );

  for (const outflow of supplierOutflows) {
    const inflowBefore = items
      .filter(
        (i) =>
          i.cashflow_direction === "Inflow" &&
          !["Received", "Cancelled"].includes(i.status) &&
          (!outflow.expected_date || !i.expected_date || i.expected_date <= outflow.expected_date),
      )
      .reduce((s, i) => s + eff(i), 0);

    const outflowAmt = eff(outflow);
    const gap        = outflowAmt - inflowBefore;

    if (gap <= 0) continue;

    const needType = outflow.cashflow_type === "Supplier Advance"
      ? "Supplier Advance Gap" as NeedType
      : "Supplier Balance Gap" as NeedType;

    const rel = items.filter((i) => i.job_reference === outflow.job_reference);
    const risk = scoreRisk(rel, gap, {
      hasOverdue: outflow.status === "Overdue",
      hasMissingDate: !outflow.expected_date,
    });
    const conf = scoreConfidence(rel, { hasOverdue: outflow.status === "Overdue" });

    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Importer",
      job_reference:           outflow.job_reference ?? null,
      procurement_reference:   outflow.procurement_reference ?? null,
      supplier_id:             null,
      need_type:               needType,
      need_status:             "Detected",
      gap_amount:              gap,
      currency:                outflow.base_currency,
      base_currency:           outflow.base_currency,
      fx_rate_to_base:         null,
      base_gap_amount:         gap,
      gap_start_date:          outflow.expected_date ?? null,
      gap_end_date:            null,
      estimated_gap_days:      null,
      expected_inflow_amount:  inflowBefore > 0 ? inflowBefore : null,
      expected_inflow_date:    null,
      expected_outflow_amount: outflowAmt,
      expected_outflow_date:   outflow.expected_date ?? null,
      repayment_source:        "Expected customer collection / inventory sale proceeds",
      supporting_evidence:     { cashflow_item_id: outflow.id, cashflow_type: outflow.cashflow_type, description: outflow.description },
      risk_level:              risk,
      confidence_score:        conf,
      rationale:               `${outflow.cashflow_type} of ${outflow.currency} ${outflowAmt.toLocaleString()} is due${outflow.expected_date ? ` on ${outflow.expected_date}` : ""} but available inflow (${outflow.base_currency} ${inflowBefore.toLocaleString()}) does not cover it before the due date. Working capital need: ${outflow.base_currency} ${gap.toLocaleString()}.`,
      recommended_next_action: "Confirm repayment source. Mark Eligible for Simulation if supplier advance financing is applicable.",
      created_by_system:       true,
    });
  }

  return needs;
}

/**
 * Rule 3: Duty / Tax gap
 * Duty/Tax outflow items, or DDP jobs without a matching inflow.
 */
export function detectDutyTaxGaps(
  items:      CashflowItem[],
  jobs:       ScopedJobData[],
  companyId:  string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const needs: WorkingCapitalNeedInput[] = [];

  // From cashflow items
  const dutyOutflows = items.filter(
    (i) => i.cashflow_type === "Duty / Tax" && !["Paid", "Cancelled"].includes(i.status),
  );
  for (const outflow of dutyOutflows) {
    const inflowBefore = items
      .filter(
        (i) =>
          i.cashflow_direction === "Inflow" &&
          !["Received", "Cancelled"].includes(i.status) &&
          (!outflow.expected_date || !i.expected_date || i.expected_date <= outflow.expected_date),
      )
      .reduce((s, i) => s + eff(i), 0);

    const outflowAmt = eff(outflow);
    const gap        = outflowAmt - inflowBefore;
    if (gap <= 0) continue;

    const risk = scoreRisk([outflow], gap, { hasOverdue: outflow.status === "Overdue", hasMissingDate: !outflow.expected_date });
    const conf = scoreConfidence([outflow], { hasOverdue: outflow.status === "Overdue" });

    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Importer",
      job_reference:           outflow.job_reference ?? null,
      procurement_reference:   outflow.procurement_reference ?? null,
      supplier_id:             null,
      need_type:               "Duty / Tax Gap",
      need_status:             "Detected",
      gap_amount:              gap,
      currency:                outflow.base_currency,
      base_currency:           outflow.base_currency,
      fx_rate_to_base:         null,
      base_gap_amount:         gap,
      gap_start_date:          outflow.expected_date ?? null,
      gap_end_date:            null,
      estimated_gap_days:      null,
      expected_inflow_amount:  null,
      expected_inflow_date:    null,
      expected_outflow_amount: outflowAmt,
      expected_outflow_date:   outflow.expected_date ?? null,
      repayment_source:        "Customer collection or inventory sale after customs clearance",
      supporting_evidence:     { cashflow_item_id: outflow.id, description: outflow.description },
      risk_level:              risk,
      confidence_score:        conf,
      rationale:               `Duty/tax obligation of ${outflow.currency} ${outflowAmt.toLocaleString()} due before sufficient inflow is available. Gap: ${outflow.base_currency} ${gap.toLocaleString()}.`,
      recommended_next_action: "Verify HS Code and duty rate estimate. Check if DDP incoterm applies.",
      created_by_system:       true,
    });
  }

  // From DDP secured_jobs without a matching cashflow item
  const ddpJobs = jobs.filter(
    (j) =>
      j.incoterm?.toUpperCase().startsWith("DDP") &&
      (j.duty_tax_estimate_amount ?? 0) > 0 &&
      !["Completed", "Cancelled"].includes(j.job_status),
  );
  for (const job of ddpJobs) {
    // Check if there's already a cashflow item for this job's duty
    const hasCfItem = items.some(
      (i) => i.job_reference === job.job_reference && i.cashflow_type === "Duty / Tax",
    );
    if (hasCfItem) continue;

    const amt = job.duty_tax_estimate_amount ?? 0;
    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Importer",
      job_reference:           job.job_reference,
      procurement_reference:   null,
      supplier_id:             null,
      need_type:               "Duty / Tax Gap",
      need_status:             "Detected",
      gap_amount:              amt,
      currency:                job.duty_tax_currency ?? job.currency,
      base_currency:           job.currency,
      fx_rate_to_base:         null,
      base_gap_amount:         amt,
      gap_start_date:          null,
      gap_end_date:            null,
      estimated_gap_days:      null,
      expected_inflow_amount:  null,
      expected_inflow_date:    null,
      expected_outflow_amount: amt,
      expected_outflow_date:   null,
      repayment_source:        "Customer collection after customs clearance",
      supporting_evidence:     { job_reference: job.job_reference, incoterm: job.incoterm, duty_tax_estimate: amt },
      risk_level:              "Medium",
      confidence_score:        65,
      rationale:               `DDP job ${job.job_reference} has duty/tax estimate of ${job.duty_tax_currency ?? job.currency} ${amt.toLocaleString()} with no cash-flow item recorded. Importer must fund customs clearance before goods are released.`,
      recommended_next_action: "Add duty/tax cash-flow item to track timing. Verify HS Code and duty rate.",
      created_by_system:       true,
    });
  }

  return needs;
}

/**
 * Rule 4: Freight forwarder vendor payment gap
 * Carrier/Haulier payment before Nexum Release Expected.
 */
export function detectVendorPaymentGaps(
  items:      CashflowItem[],
  companyId:  string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const needs: WorkingCapitalNeedInput[] = [];

  const vendorPayments = items.filter(
    (i) =>
      (i.cashflow_type === "Carrier Payment" || i.cashflow_type === "Haulier Payment") &&
      !["Paid", "Cancelled"].includes(i.status),
  );
  const nexumReleases = items.filter(
    (i) => i.cashflow_type === "Nexum Release Expected" && i.expected_date,
  );

  for (const vp of vendorPayments) {
    if (!vp.expected_date) continue;

    // Look for a Nexum release that comes AFTER the vendor payment
    const releasesAfter = nexumReleases.filter(
      (r) => r.expected_date && r.expected_date > vp.expected_date!,
    );
    if (releasesAfter.length === 0) continue;

    const earliestRelease = releasesAfter.sort((a, b) =>
      (a.expected_date ?? "").localeCompare(b.expected_date ?? ""),
    )[0];

    const gapDays = earliestRelease.expected_date
      ? daysBetween(vp.expected_date, earliestRelease.expected_date)
      : null;

    const vpAmt   = eff(vp);
    const risk    = scoreRisk([vp], vpAmt, { hasOverdue: vp.status === "Overdue" });
    const conf    = scoreConfidence([vp, earliestRelease], { hasOverdue: vp.status === "Overdue" });

    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Freight Forwarder",
      job_reference:           vp.job_reference ?? earliestRelease.job_reference ?? null,
      procurement_reference:   null,
      supplier_id:             null,
      need_type:               "Carrier / Vendor Payment Gap",
      need_status:             "Detected",
      gap_amount:              vpAmt,
      currency:                vp.base_currency,
      base_currency:           vp.base_currency,
      fx_rate_to_base:         null,
      base_gap_amount:         vpAmt,
      gap_start_date:          vp.expected_date,
      gap_end_date:            earliestRelease.expected_date ?? null,
      estimated_gap_days:      gapDays,
      expected_inflow_amount:  eff(earliestRelease),
      expected_inflow_date:    earliestRelease.expected_date ?? null,
      expected_outflow_amount: vpAmt,
      expected_outflow_date:   vp.expected_date,
      repayment_source:        "Nexum payment release upon POD confirmation and milestone completion",
      supporting_evidence:     {
        vendor_payment_item_id:  vp.id,
        vendor_type:             vp.cashflow_type,
        vendor_due:              vp.expected_date,
        nexum_release_item_id:   earliestRelease.id,
        nexum_release_expected:  earliestRelease.expected_date,
        gap_days:                gapDays,
      },
      risk_level:              risk,
      confidence_score:        conf,
      rationale:               `${vp.cashflow_type} of ${vp.currency} ${vpAmt.toLocaleString()} is due on ${vp.expected_date}, but Nexum release is not expected until ${earliestRelease.expected_date ?? "later"} — a gap of ${gapDays ?? "unknown"} day(s). Provider must fund vendor payment from own working capital.`,
      recommended_next_action: "Confirm vendor payment date and Nexum release schedule. Consider requesting early release if conditions allow.",
      created_by_system:       true,
    });
  }

  return needs;
}

/**
 * Rule 5: Logistics fee gap
 * Logistics Fee outflow without sufficient preceding Nexum-controlled inflow.
 */
export function detectLogisticsFeeGaps(
  items:      CashflowItem[],
  jobs:       ScopedJobData[],
  companyId:  string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const needs: WorkingCapitalNeedInput[] = [];

  const logisticsOutflows = items.filter(
    (i) => i.cashflow_type === "Logistics Fee" && !["Paid", "Cancelled"].includes(i.status),
  );

  for (const outflow of logisticsOutflows) {
    const nexumHeldBefore = items
      .filter(
        (i) =>
          i.is_nexum_controlled &&
          i.cashflow_direction === "Inflow" &&
          !["Received", "Cancelled"].includes(i.status) &&
          (!outflow.expected_date || !i.expected_date || i.expected_date <= outflow.expected_date),
      )
      .reduce((s, i) => s + eff(i), 0);

    const outflowAmt = eff(outflow);
    const gap        = outflowAmt - nexumHeldBefore;
    if (gap <= 0) continue;

    const risk = scoreRisk([outflow], gap, { hasOverdue: outflow.status === "Overdue" });
    const conf = scoreConfidence([outflow], {});

    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Logistics Provider",
      job_reference:           outflow.job_reference ?? null,
      procurement_reference:   null,
      supplier_id:             null,
      need_type:               "Logistics Fee Gap",
      need_status:             "Detected",
      gap_amount:              gap,
      currency:                outflow.base_currency,
      base_currency:           outflow.base_currency,
      fx_rate_to_base:         null,
      base_gap_amount:         gap,
      gap_start_date:          outflow.expected_date ?? null,
      gap_end_date:            null,
      estimated_gap_days:      null,
      expected_inflow_amount:  nexumHeldBefore > 0 ? nexumHeldBefore : null,
      expected_inflow_date:    null,
      expected_outflow_amount: outflowAmt,
      expected_outflow_date:   outflow.expected_date ?? null,
      repayment_source:        "Nexum payment release upon job completion and customer acceptance",
      supporting_evidence:     { cashflow_item_id: outflow.id, nexum_held_before: nexumHeldBefore },
      risk_level:              risk,
      confidence_score:        conf,
      rationale:               `Logistics fee of ${outflow.currency} ${outflowAmt.toLocaleString()} is required but Nexum-controlled inflow (${outflow.base_currency} ${nexumHeldBefore.toLocaleString()}) does not cover it. Gap: ${outflow.base_currency} ${gap.toLocaleString()}.`,
      recommended_next_action: "Verify Nexum held amount covers logistics fee. Check if customer payment is secured.",
      created_by_system:       true,
    });
  }

  return needs;
}

/**
 * Rule 6: Receivables gap (Exporter / general)
 * Receivable items that are overdue or expected far in the future while
 * payables are outstanding.
 */
export function detectReceivablesGaps(
  items:      CashflowItem[],
  companyId:  string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const needs: WorkingCapitalNeedInput[] = [];
  const td = today();

  const overdueReceivables = items.filter(
    (i) => i.cashflow_type === "Receivable" && i.status === "Overdue",
  );

  if (overdueReceivables.length === 0) {
    // Check for receivables expected far in the future while payables are near
    const pendingReceivables = items.filter(
      (i) =>
        (i.cashflow_type === "Receivable" || i.cashflow_type === "Customer Collection") &&
        ["Expected", "Pending"].includes(i.status) &&
        i.expected_date,
    );
    const nearPayables = items.filter(
      (i) =>
        i.cashflow_direction === "Outflow" &&
        ["Expected", "Pending", "Overdue"].includes(i.status) &&
        i.expected_date &&
        i.expected_date <= td,
    );
    if (nearPayables.length === 0 || pendingReceivables.length === 0) return needs;

    const receivablesAmt = pendingReceivables.reduce((s, i) => s + eff(i), 0);
    const payablesAmt    = nearPayables.reduce((s, i) => s + eff(i), 0);
    if (payablesAmt <= receivablesAmt * 0.5) return needs;

    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Exporter",
      job_reference:           pendingReceivables[0].job_reference ?? null,
      procurement_reference:   null,
      supplier_id:             null,
      need_type:               "Receivables Gap",
      need_status:             "Detected",
      gap_amount:              payablesAmt,
      currency:                items[0]?.base_currency ?? "RM",
      base_currency:           items[0]?.base_currency ?? "RM",
      fx_rate_to_base:         null,
      base_gap_amount:         payablesAmt,
      gap_start_date:          td,
      gap_end_date:            pendingReceivables[0].expected_date ?? null,
      estimated_gap_days:      pendingReceivables[0].expected_date ? daysBetween(td, pendingReceivables[0].expected_date) : null,
      expected_inflow_amount:  receivablesAmt,
      expected_inflow_date:    pendingReceivables[0].expected_date ?? null,
      expected_outflow_amount: payablesAmt,
      expected_outflow_date:   td,
      repayment_source:        "Expected buyer / customer payment upon invoice settlement",
      supporting_evidence:     { near_payables_count: nearPayables.length, pending_receivables_count: pendingReceivables.length },
      risk_level:              "Medium",
      confidence_score:        60,
      rationale:               `Near-term payables (${items[0]?.base_currency ?? "RM"} ${payablesAmt.toLocaleString()}) exceed 50% of pending receivables while receivables are not yet collected. Working capital pressure from timing mismatch.`,
      recommended_next_action: "Accelerate customer collection. Review invoice financing eligibility.",
      created_by_system:       true,
    });
    return needs;
  }

  const totalOverdue = overdueReceivables.reduce((s, i) => s + eff(i), 0);
  const risk = scoreRisk(overdueReceivables, totalOverdue, { hasOverdue: true });
  const conf = scoreConfidence(overdueReceivables, { hasOverdue: true });

  needs.push({
    need_reference:          generateNeedReference(),
    company_id:              companyId,
    company_name:            companyName,
    company_role:            "Exporter",
    job_reference:           overdueReceivables[0].job_reference ?? null,
    procurement_reference:   null,
    supplier_id:             null,
    need_type:               "Receivables Gap",
    need_status:             "Detected",
    gap_amount:              totalOverdue,
    currency:                overdueReceivables[0].base_currency,
    base_currency:           overdueReceivables[0].base_currency,
    fx_rate_to_base:         null,
    base_gap_amount:         totalOverdue,
    gap_start_date:          td,
    gap_end_date:            null,
    estimated_gap_days:      null,
    expected_inflow_amount:  totalOverdue,
    expected_inflow_date:    null,
    expected_outflow_amount: null,
    expected_outflow_date:   null,
    repayment_source:        "Overdue customer invoice settlement",
    supporting_evidence:     { overdue_count: overdueReceivables.length, items: overdueReceivables.map((i) => ({ id: i.id, amount: i.amount, description: i.description })) },
    risk_level:              risk,
    confidence_score:        conf,
    rationale:               `${overdueReceivables.length} overdue receivable(s) totalling ${overdueReceivables[0].base_currency} ${totalOverdue.toLocaleString()} are past due. Cash inflow is delayed, creating working capital pressure.`,
    recommended_next_action: "Chase customer payment. Consider invoice financing or factoring if collection is delayed beyond 30 days.",
    created_by_system:       true,
  });

  return needs;
}

/**
 * Rule 7: Release delay gap
 * From payment_obligations that are overdue — payment is secured but not yet released.
 */
export function detectReleaseDelayGaps(
  obligations: PaymentObligationData[],
  companyId:   string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const needs: WorkingCapitalNeedInput[] = [];
  const td = today();

  const overdueObs = obligations.filter(
    (o) =>
      ["Pending", "Proof Uploaded"].includes(o.status) &&
      o.due_date &&
      o.due_date < td,
  );

  if (overdueObs.length === 0) return needs;

  // Group by job
  const byJob = new Map<string, PaymentObligationData[]>();
  for (const o of overdueObs) {
    const existing = byJob.get(o.job_reference) ?? [];
    existing.push(o);
    byJob.set(o.job_reference, existing);
  }

  for (const [jobRef, obs] of byJob) {
    const totalAmt = obs.reduce((s, o) => s + o.amount, 0);
    const oldestDue = obs.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];
    const gapDays   = oldestDue.due_date ? daysBetween(oldestDue.due_date, td) : null;

    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Logistics Provider",
      job_reference:           jobRef,
      procurement_reference:   null,
      supplier_id:             null,
      need_type:               "Release Delay Gap",
      need_status:             "Detected",
      gap_amount:              totalAmt,
      currency:                obs[0].currency,
      base_currency:           obs[0].currency,
      fx_rate_to_base:         null,
      base_gap_amount:         totalAmt,
      gap_start_date:          oldestDue.due_date ?? null,
      gap_end_date:            null,
      estimated_gap_days:      gapDays,
      expected_inflow_amount:  totalAmt,
      expected_inflow_date:    null,
      expected_outflow_amount: null,
      expected_outflow_date:   null,
      repayment_source:        "Nexum payment release upon dispute resolution / POD acceptance",
      supporting_evidence:     { overdue_obligations: obs.map((o) => ({ id: o.id, type: o.obligation_type, amount: o.amount, due_date: o.due_date })) },
      risk_level:              gapDays && gapDays > 14 ? "High" : "Medium",
      confidence_score:        85,
      rationale:               `${obs.length} payment obligation(s) for job ${jobRef} are overdue by ${gapDays ?? "?"} day(s) (total: ${obs[0].currency} ${totalAmt.toLocaleString()}). Payment is pending verification or dispute resolution, delaying provider cash inflow.`,
      recommended_next_action: "Review payment proof status. Resolve any dispute or POD issue to unblock release.",
      created_by_system:       true,
    });
  }

  return needs;
}

/**
 * Rule 8: Claim reserve gap
 * Active claim reserves reduce expected provider release.
 */
export function detectClaimReserveGaps(
  reserves:    ClaimReserveData[],
  companyId:   string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const needs: WorkingCapitalNeedInput[] = [];

  const activeReserves = reserves.filter(
    (r) => ["Active", "Pending", "Approved"].includes(r.reserve_status),
  );
  if (activeReserves.length === 0) return needs;

  // Group by job
  const byJob = new Map<string, ClaimReserveData[]>();
  for (const r of activeReserves) {
    const existing = byJob.get(r.job_reference) ?? [];
    existing.push(r);
    byJob.set(r.job_reference, existing);
  }

  for (const [jobRef, reserves] of byJob) {
    const totalAmt = reserves.reduce((s, r) => s + r.reserve_amount, 0);
    needs.push({
      need_reference:          generateNeedReference(),
      company_id:              companyId,
      company_name:            companyName,
      company_role:            "Logistics Provider",
      job_reference:           jobRef,
      procurement_reference:   null,
      supplier_id:             null,
      need_type:               "Claim Reserve Gap",
      need_status:             "Detected",
      gap_amount:              totalAmt,
      currency:                reserves[0].currency,
      base_currency:           reserves[0].currency,
      fx_rate_to_base:         null,
      base_gap_amount:         totalAmt,
      gap_start_date:          null,
      gap_end_date:            null,
      estimated_gap_days:      null,
      expected_inflow_amount:  null,
      expected_inflow_date:    null,
      expected_outflow_amount: totalAmt,
      expected_outflow_date:   null,
      repayment_source:        "Claim reserve release upon resolution of liability review",
      supporting_evidence:     { reserves: reserves.map((r) => ({ id: r.id, type: r.reserve_type, amount: r.reserve_amount, status: r.reserve_status })) },
      risk_level:              "High",
      confidence_score:        80,
      rationale:               `Active claim reserve(s) of ${reserves[0].currency} ${totalAmt.toLocaleString()} for job ${jobRef} reduce the net payment release available to the provider.`,
      recommended_next_action: "Resolve liability review or claim settlement to release reserve funds.",
      created_by_system:       true,
    });
  }

  return needs;
}

/**
 * Rule 9: FX timing gap
 * Items with currency ≠ base_currency and no FX rate set.
 */
export function detectFxTimingGaps(
  items:      CashflowItem[],
  companyId:  string,
  companyName: string,
): WorkingCapitalNeedInput[] {
  const noFxItems = items.filter(
    (i) =>
      i.currency !== i.base_currency &&
      !i.fx_rate_to_base &&
      !["Paid", "Received", "Cancelled"].includes(i.status),
  );

  if (noFxItems.length === 0) return [];

  const totalExposed = noFxItems.reduce((s, i) => s + i.amount, 0);
  const currencies   = [...new Set(noFxItems.map((i) => i.currency))];

  return [{
    need_reference:          generateNeedReference(),
    company_id:              companyId,
    company_name:            companyName,
    company_role:            null,
    job_reference:           noFxItems[0].job_reference ?? null,
    procurement_reference:   null,
    supplier_id:             null,
    need_type:               "FX Timing Gap",
    need_status:             "Detected",
    gap_amount:              totalExposed,
    currency:                noFxItems[0].currency,
    base_currency:           noFxItems[0].base_currency,
    fx_rate_to_base:         null,
    base_gap_amount:         null,
    gap_start_date:          null,
    gap_end_date:            null,
    estimated_gap_days:      null,
    expected_inflow_amount:  null,
    expected_inflow_date:    null,
    expected_outflow_amount: totalExposed,
    expected_outflow_date:   null,
    repayment_source:        "FX conversion at spot rate on payment date",
    supporting_evidence:     { fx_currencies: currencies, item_count: noFxItems.length },
    risk_level:              "Medium",
    confidence_score:        50,
    rationale:               `${noFxItems.length} cash-flow item(s) totalling ${noFxItems[0].currency} ${totalExposed.toLocaleString()} are in foreign currencies (${currencies.join(", ")}) with no FX rate set. Base-currency equivalent cannot be confirmed — FX timing risk exists.`,
    recommended_next_action: "Set FX rates for all foreign-currency items to accurately assess funding gap.",
    created_by_system:       true,
  }];
}

// ─── Master detection runner ──────────────────────────────────────────────────

export function runAllDetectionRules(params: {
  items:        CashflowItem[];
  jobs:         ScopedJobData[];
  obligations:  PaymentObligationData[];
  reserves:     ClaimReserveData[];
  companyId:    string;
  companyName:  string;
}): WorkingCapitalNeedInput[] {
  const { items, jobs, obligations, reserves, companyId, companyName } = params;

  return [
    ...detectSupplierGaps(items, companyId, companyName),
    ...detectDutyTaxGaps(items, jobs, companyId, companyName),
    ...detectVendorPaymentGaps(items, companyId, companyName),
    ...detectLogisticsFeeGaps(items, jobs, companyId, companyName),
    ...detectReceivablesGaps(items, companyId, companyName),
    ...detectReleaseDelayGaps(obligations, companyId, companyName),
    ...detectClaimReserveGaps(reserves, companyId, companyName),
    ...detectFxTimingGaps(items, companyId, companyName),
  ];
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export const NEED_STATUS_STYLES: Record<NeedStatus, string> = {
  "Detected":                        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Under Review":                    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Eligible for Simulation":         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Not Suitable":                    "bg-slate-700/60 text-slate-500 border-slate-600",
  "Converted to Financing Simulation": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Resolved":                        "bg-emerald-500/10 text-emerald-500/70 border-emerald-700/40",
  "Dismissed":                       "bg-slate-800 text-slate-600 border-slate-700",
};

export const NEED_RISK_STYLES: Record<NeedRiskLevel, string> = {
  Low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium:   "bg-amber-500/15  text-amber-400  border-amber-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Critical: "bg-red-500/15    text-red-400    border-red-500/30",
};

export const NEED_TYPE_ICONS: Record<NeedType, string> = {
  "Supplier Advance Gap":         "📦",
  "Supplier Balance Gap":         "📦",
  "Duty / Tax Gap":               "🛃",
  "Logistics Fee Gap":            "🚚",
  "Carrier / Vendor Payment Gap": "⚓",
  "Inventory Funding Gap":        "🏭",
  "Receivables Gap":              "📄",
  "Release Delay Gap":            "🔒",
  "Claim Reserve Gap":            "⚠",
  "FX Timing Gap":                "💱",
  "Other":                        "📋",
};

export const ALL_NEED_TYPES: NeedType[] = [
  "Supplier Advance Gap", "Supplier Balance Gap", "Duty / Tax Gap",
  "Logistics Fee Gap", "Carrier / Vendor Payment Gap", "Inventory Funding Gap",
  "Receivables Gap", "Release Delay Gap", "Claim Reserve Gap",
  "FX Timing Gap", "Other",
];

export const ALL_NEED_STATUSES: NeedStatus[] = [
  "Detected", "Under Review", "Eligible for Simulation",
  "Not Suitable", "Converted to Financing Simulation",
  "Resolved", "Dismissed",
];

export const OPEN_STATUSES: NeedStatus[] = [
  "Detected", "Under Review", "Eligible for Simulation",
];

export function formatGap(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)}`;
}
