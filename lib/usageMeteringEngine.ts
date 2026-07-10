// ─── Usage Metering Engine ────────────────────────────────────────────────────
// recordUsage: core helper called when a metered action occurs.
// calculateOverageSummary: builds an overage billing summary for a period.
// Do not import Next.js server utilities here.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  USAGE_TYPE_TO_QUOTA_FIELD,
  DEFAULT_OVERAGE_RATES,
  type UsageType,
} from "@/lib/usageMetering";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecordUsageInput {
  company_id:      string;
  usage_type:      UsageType;
  usage_reference: string;
  quantity?:       number;
  currency?:       string;
}

export interface RecordUsageResult {
  id:               string;
  overage_quantity: number;
  overage_amount:   number;
  status:           string;
}

export interface OverageSummaryResult {
  total_secured_jobs:           number;
  total_document_extractions:   number;
  total_tracking_checks:        number;
  total_rfqs:                   number;
  total_quotations:             number;
  overage_secured_jobs:         number;
  overage_document_extractions: number;
  overage_tracking_checks:      number;
  overage_rfqs:                 number;
  overage_quotations:           number;
  total_overage_amount:         number;
  currency:                     string;
}

// ── recordUsage ───────────────────────────────────────────────────────────────

export async function recordUsage(
  svc: SupabaseClient,
  input: RecordUsageInput,
): Promise<{ record: RecordUsageResult | null; error?: string }> {
  const { company_id, usage_type, usage_reference, quantity = 1, currency = "RM" } = input;

  // ── Fetch company's active membership + plan ─────────────────────────────
  const { data: membership } = await svc
    .from("memberships")
    .select("id, plan_id, plan, status, start_date, end_date")
    .eq("company_id", company_id)
    .eq("status", "Active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let plan: Record<string, number> | null = null;
  let planId: string | null = null;
  let membershipId: string | null = null;
  let periodStart: string | null = null;
  let periodEnd:   string | null = null;

  if (membership) {
    membershipId = membership.id;
    planId       = membership.plan_id ?? null;
    periodStart  = membership.start_date ?? null;
    periodEnd    = membership.end_date ?? null;

    if (planId) {
      const { data: planData } = await svc
        .from("membership_plans")
        .select("included_secured_jobs, included_document_extractions, included_tracking_checks, included_rfqs, included_quotations, secured_job_fee_rate, payment_holding_fee_rate, document_intelligence_fee, tracking_monitoring_fee, currency")
        .eq("id", planId)
        .maybeSingle();
      plan = planData as Record<string, number> | null;
    } else if (membership.plan) {
      // Fallback: match by plan name
      const { data: planData } = await svc
        .from("membership_plans")
        .select("id, included_secured_jobs, included_document_extractions, included_tracking_checks, included_rfqs, included_quotations, secured_job_fee_rate, payment_holding_fee_rate, document_intelligence_fee, tracking_monitoring_fee, currency")
        .ilike("plan_name", membership.plan)
        .eq("plan_status", "Active")
        .maybeSingle();
      if (planData) {
        plan   = planData as Record<string, number>;
        planId = (planData as { id: string }).id;
      }
    }
  }

  // ── Count existing usage of this type in current period ──────────────────
  const quotaField = USAGE_TYPE_TO_QUOTA_FIELD[usage_type];
  const includedQuota = quotaField && plan ? (plan[quotaField] ?? 0) : 0;

  let existingUsage = 0;
  if (membership && includedQuota > 0) {
    const qBuilder = svc
      .from("usage_metering_records")
      .select("quantity", { count: "exact" })
      .eq("company_id", company_id)
      .eq("usage_type", usage_type)
      .not("status", "in", '("Cancelled","Waived")');

    if (periodStart) qBuilder.gte("created_at", periodStart);
    if (periodEnd)   qBuilder.lte("created_at", periodEnd);

    const { data: existingRows } = await qBuilder;
    existingUsage = (existingRows ?? []).reduce(
      (sum: number, row: { quantity: number }) => sum + Number(row.quantity), 0
    );
  }

  // ── Calculate overage ─────────────────────────────────────────────────────
  const totalAfter      = existingUsage + quantity;
  const alreadyConsumed = Math.min(existingUsage, includedQuota);
  const includedInThis  = Math.max(0, Math.min(quantity, includedQuota - alreadyConsumed));
  const overageQty      = Math.max(0, quantity - includedInThis);
  const unitRate        = overageQty > 0 ? (DEFAULT_OVERAGE_RATES[usage_type] ?? 0) : 0;
  const overageAmount   = overageQty * unitRate;
  const status          = overageQty > 0 ? "Calculated" : "Recorded";

  void totalAfter; // suppress unused warning

  // ── Insert record ─────────────────────────────────────────────────────────
  const { data: inserted, error } = await svc
    .from("usage_metering_records")
    .insert({
      company_id,
      membership_id:     membershipId,
      plan_id:           planId,
      usage_type,
      usage_reference,
      quantity,
      included_quantity: includedInThis,
      overage_quantity:  overageQty,
      unit_rate:         unitRate,
      overage_amount:    overageAmount,
      currency,
      usage_period_start: periodStart,
      usage_period_end:   periodEnd,
      status,
    })
    .select("id, overage_quantity, overage_amount, status")
    .single();

  if (error) return { record: null, error: error.message };

  return {
    record: {
      id:               inserted.id,
      overage_quantity: inserted.overage_quantity,
      overage_amount:   inserted.overage_amount,
      status:           inserted.status,
    },
  };
}

// ── calculateOverageSummary ───────────────────────────────────────────────────

export async function calculateOverageSummary(
  svc: SupabaseClient,
  companyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ summary: OverageSummaryResult; membershipId: string | null; planId: string | null; error?: string }> {
  const nullResult: OverageSummaryResult = {
    total_secured_jobs: 0, total_document_extractions: 0, total_tracking_checks: 0,
    total_rfqs: 0, total_quotations: 0,
    overage_secured_jobs: 0, overage_document_extractions: 0, overage_tracking_checks: 0,
    overage_rfqs: 0, overage_quotations: 0,
    total_overage_amount: 0, currency: "RM",
  };

  // Fetch membership + plan
  const { data: membership } = await svc
    .from("memberships")
    .select("id, plan_id, plan, currency")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { summary: nullResult, membershipId: null, planId: null, error: "No membership found for company" };
  }

  let planId = membership.plan_id ?? null;
  let plan: Record<string, number> | null = null;

  if (planId) {
    const { data: p } = await svc.from("membership_plans").select("*").eq("id", planId).maybeSingle();
    plan = p as Record<string, number> | null;
  } else if (membership.plan) {
    const { data: p } = await svc.from("membership_plans").select("*").ilike("plan_name", membership.plan).eq("plan_status", "Active").maybeSingle();
    if (p) { plan = p as Record<string, number>; planId = (p as { id: string }).id; }
  }

  // Fetch all usage records for period
  const { data: records } = await svc
    .from("usage_metering_records")
    .select("usage_type, quantity, overage_quantity, overage_amount, currency")
    .eq("company_id", companyId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd + "T23:59:59Z")
    .not("status", "in", '("Cancelled","Waived")');

  const rows = (records ?? []) as {
    usage_type: UsageType; quantity: number; overage_quantity: number; overage_amount: number; currency: string;
  }[];

  const sumBy = (type: UsageType, field: "quantity" | "overage_quantity" | "overage_amount") =>
    rows.filter((r) => r.usage_type === type).reduce((s, r) => s + Number(r[field]), 0);

  const currency = plan ? ((plan as { currency?: string }).currency ?? "RM") : "RM";

  const totalJobs    = sumBy("Secured Job",          "quantity");
  const totalDocs    = sumBy("Document Extraction",  "quantity");
  const totalTracks  = sumBy("Tracking Check",       "quantity");
  const totalRfqs    = sumBy("RFQ",                  "quantity");
  const totalQuotes  = sumBy("Quotation",            "quantity");

  // If we have a plan, recalculate overage fresh from totals vs quotas
  const quotaJobs   = plan ? (plan["included_secured_jobs"]         ?? 0) : 0;
  const quotaDocs   = plan ? (plan["included_document_extractions"] ?? 0) : 0;
  const quotaTracks = plan ? (plan["included_tracking_checks"]      ?? 0) : 0;
  const quotaRfqs   = plan ? (plan["included_rfqs"]                 ?? 0) : 0;
  const quotaQuotes = plan ? (plan["included_quotations"]           ?? 0) : 0;

  const overageJobs   = Math.max(0, totalJobs   - quotaJobs);
  const overageDocs   = Math.max(0, totalDocs   - quotaDocs);
  const overageTracks = Math.max(0, totalTracks - quotaTracks);
  const overageRfqs   = Math.max(0, totalRfqs   - quotaRfqs);
  const overageQuotes = Math.max(0, totalQuotes - quotaQuotes);

  const rateJobs   = DEFAULT_OVERAGE_RATES["Secured Job"]          ?? 150;
  const rateDocs   = DEFAULT_OVERAGE_RATES["Document Extraction"]  ?? 10;
  const rateTracks = DEFAULT_OVERAGE_RATES["Tracking Check"]       ?? 30;
  const rateRfqs   = DEFAULT_OVERAGE_RATES["RFQ"]                  ?? 20;
  const rateQuotes = DEFAULT_OVERAGE_RATES["Quotation"]            ?? 20;

  const totalOverageAmount =
    overageJobs   * rateJobs   +
    overageDocs   * rateDocs   +
    overageTracks * rateTracks +
    overageRfqs   * rateRfqs   +
    overageQuotes * rateQuotes;

  return {
    summary: {
      total_secured_jobs:           totalJobs,
      total_document_extractions:   totalDocs,
      total_tracking_checks:        totalTracks,
      total_rfqs:                   totalRfqs,
      total_quotations:             totalQuotes,
      overage_secured_jobs:         overageJobs,
      overage_document_extractions: overageDocs,
      overage_tracking_checks:      overageTracks,
      overage_rfqs:                 overageRfqs,
      overage_quotations:           overageQuotes,
      total_overage_amount:         totalOverageAmount,
      currency,
    },
    membershipId: membership.id,
    planId,
  };
}
