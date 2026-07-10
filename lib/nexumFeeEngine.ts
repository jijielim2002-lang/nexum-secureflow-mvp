// ─── Nexum Fee Calculation Engine ────────────────────────────────────────────
// Fetches job data + active fee rules and returns fee records to insert.
// Applies membership plan rates where a provider plan exists.
// Do not import Next.js server utilities here.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeeRuleRow } from "@/lib/nexumFee";
import type { MembershipPlanRow } from "@/lib/membershipPlan";

export interface CalculatedFeeRecord {
  job_reference:   string;
  company_id:      string | null;
  fee_rule_id:     string;
  fee_type:        string;
  fee_description: string;
  base_amount:     number;
  fee_amount:      number;
  currency:        string;
  fee_status:      "Calculated";
}

export async function calculateJobFees(
  svc: SupabaseClient,
  jobReference: string,
): Promise<{ records: CalculatedFeeRecord[]; skipped: string[]; error?: string }> {
  // ── Fetch job ──────────────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await svc
    .from("secured_jobs")
    .select("job_reference, job_value, currency, customer_company_id, service_provider_company_id")
    .eq("job_reference", jobReference)
    .maybeSingle();

  if (jobErr || !job) return { records: [], skipped: [], error: "Job not found" };

  // ── Fetch active fee rules ─────────────────────────────────────────────────
  const { data: rules } = await svc
    .from("nexum_fee_rules")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (!rules || rules.length === 0) {
    return { records: [], skipped: [], error: "No active fee rules found" };
  }

  // ── Parallel fetch of basis data + provider membership plan ───────────────
  const providerCompanyId = job.service_provider_company_id ?? null;

  const [docsR, syncsR, capR, hpR, settlR, existingR, membershipR] = await Promise.all([
    svc.from("documents")
      .select("id")
      .eq("job_reference", jobReference),

    svc.from("tracking_sync_logs")
      .select("id")
      .eq("job_reference", jobReference),

    svc.from("capital_readiness_assessments")
      .select("id")
      .eq("job_reference", jobReference),

    svc.from("held_payments")
      .select("id, amount, holding_status")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    svc.from("release_settlements")
      .select("id, actual_released_amount, settlement_status")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Existing non-cancelled fees to prevent double-charging
    svc.from("nexum_service_fees")
      .select("fee_rule_id")
      .eq("job_reference", jobReference)
      .not("fee_status", "in", '("Cancelled","Waived")'),

    // Provider's membership to get plan rates
    providerCompanyId
      ? svc.from("memberships")
          .select("plan, plan_id, status")
          .eq("company_id", providerCompanyId)
          .eq("status", "Active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ── Basis values ───────────────────────────────────────────────────────────
  const jobValue       = Number(job.job_value ?? 0);
  const heldAmount     = hpR.data ? Number(hpR.data.amount ?? 0) : 0;
  const releasedAmount = settlR.data ? Number(settlR.data.actual_released_amount ?? 0) : 0;
  const documentCount  = (docsR.data ?? []).length;
  const syncCount      = (syncsR.data ?? []).length;
  const capCount       = (capR.data ?? []).length;
  const currency       = job.currency ?? "RM";

  const existingRuleIds = new Set(
    (existingR.data ?? []).map((f: { fee_rule_id: string | null }) => f.fee_rule_id).filter(Boolean)
  );

  // ── Provider membership plan rates ────────────────────────────────────────
  // If provider has an active membership with a plan_id, fetch plan rates.
  let providerPlan: MembershipPlanRow | null = null;
  const membershipData = membershipR.data as { plan?: string; plan_id?: string | null; status?: string } | null;
  if (membershipData?.plan_id) {
    const { data: planData } = await svc
      .from("membership_plans")
      .select("*")
      .eq("id", membershipData.plan_id)
      .eq("plan_status", "Active")
      .maybeSingle();
    providerPlan = (planData as MembershipPlanRow) ?? null;
  } else if (membershipData?.plan) {
    // Fallback: match by plan name
    const { data: planData } = await svc
      .from("membership_plans")
      .select("*")
      .eq("plan_status", "Active")
      .ilike("plan_name", membershipData.plan)
      .maybeSingle();
    providerPlan = (planData as MembershipPlanRow) ?? null;
  }

  // Helper: get plan rate override for a given fee type
  function getPlanRate(feeType: string): number | null {
    if (!providerPlan) return null;
    const ft = feeType.toLowerCase();
    if (ft.includes("secured job"))          return Number(providerPlan.secured_job_fee_rate);
    if (ft.includes("payment holding"))      return Number(providerPlan.payment_holding_fee_rate);
    if (ft.includes("controlled release"))   return Number(providerPlan.controlled_release_fee_rate);
    return null;
  }

  function getPlanFixedRate(feeType: string): number | null {
    if (!providerPlan) return null;
    const ft = feeType.toLowerCase();
    if (ft.includes("document intelligence")) return Number(providerPlan.document_intelligence_fee);
    if (ft.includes("tracking monitoring"))   return Number(providerPlan.tracking_monitoring_fee);
    return null;
  }

  const records: CalculatedFeeRecord[] = [];
  const skipped: string[] = [];

  for (const rule of (rules as FeeRuleRow[])) {
    // Skip if already calculated for this job (unless Manual — manual can be added multiple times)
    if (rule.calculation_method !== "Manual" && existingRuleIds.has(rule.id)) {
      skipped.push(`${rule.fee_name} — already calculated`);
      continue;
    }

    let baseAmount   = 0;
    let rawFee       = 0;
    let description  = rule.fee_name;

    switch (rule.calculation_method) {
      case "Fixed Amount":
        baseAmount  = Number(rule.fixed_amount ?? 0);
        rawFee      = baseAmount;
        description = `${rule.fee_name}: fixed ${rule.currency} ${baseAmount.toFixed(2)}`;
        break;

      case "Percentage of Job Value": {
        if (jobValue === 0) { skipped.push(`${rule.fee_name} — job value is 0`); continue; }
        baseAmount = jobValue;
        const planPctRate = getPlanRate(rule.fee_type);
        const effectivePct = planPctRate !== null ? planPctRate : Number(rule.percentage_rate ?? 0);
        rawFee      = jobValue * (effectivePct / 100);
        description = `${rule.fee_name}: ${effectivePct}% of job value (${currency} ${jobValue.toLocaleString()})${planPctRate !== null ? ` [plan rate: ${providerPlan?.plan_name}]` : ""}`;
        break;
      }

      case "Percentage of Held Amount": {
        if (heldAmount === 0) { skipped.push(`${rule.fee_name} — no held payment`); continue; }
        baseAmount = heldAmount;
        const planHeldRate = getPlanRate(rule.fee_type);
        const effectiveHeldPct = planHeldRate !== null ? planHeldRate : Number(rule.percentage_rate ?? 0);
        rawFee      = heldAmount * (effectiveHeldPct / 100);
        description = `${rule.fee_name}: ${effectiveHeldPct}% of held amount (${currency} ${heldAmount.toLocaleString()})${planHeldRate !== null ? ` [plan rate: ${providerPlan?.plan_name}]` : ""}`;
        break;
      }

      case "Percentage of Released Amount": {
        if (releasedAmount === 0) { skipped.push(`${rule.fee_name} — no released amount`); continue; }
        baseAmount = releasedAmount;
        const planRelRate = getPlanRate(rule.fee_type);
        const effectiveRelPct = planRelRate !== null ? planRelRate : Number(rule.percentage_rate ?? 0);
        rawFee      = releasedAmount * (effectiveRelPct / 100);
        description = `${rule.fee_name}: ${effectiveRelPct}% of released amount (${currency} ${releasedAmount.toLocaleString()})${planRelRate !== null ? ` [plan rate: ${providerPlan?.plan_name}]` : ""}`;
        break;
      }

      case "Per Document": {
        if (documentCount === 0) { skipped.push(`${rule.fee_name} — no documents`); continue; }
        baseAmount = documentCount;
        const planDocRate = getPlanFixedRate(rule.fee_type);
        const effectiveDocRate = planDocRate !== null ? planDocRate : Number(rule.fixed_amount ?? 0);
        rawFee      = documentCount * effectiveDocRate;
        description = `${rule.fee_name}: ${currency} ${effectiveDocRate} × ${documentCount} document(s)${planDocRate !== null ? ` [plan rate: ${providerPlan?.plan_name}]` : ""}`;
        break;
      }

      case "Per Tracking Sync": {
        if (syncCount === 0) { skipped.push(`${rule.fee_name} — no tracking syncs`); continue; }
        baseAmount = syncCount;
        const planSyncRate = getPlanFixedRate(rule.fee_type);
        const effectiveSyncRate = planSyncRate !== null ? planSyncRate : Number(rule.fixed_amount ?? 0);
        rawFee      = syncCount * effectiveSyncRate;
        description = `${rule.fee_name}: ${currency} ${effectiveSyncRate} × ${syncCount} sync(s)${planSyncRate !== null ? ` [plan rate: ${providerPlan?.plan_name}]` : ""}`;
        break;
      }

      case "Per Job":
        baseAmount  = 1;
        rawFee      = Number(rule.fixed_amount ?? 0);
        description = `${rule.fee_name}: ${currency} ${rule.fixed_amount ?? 0} per job`;
        break;

      case "Manual":
        baseAmount  = 0;
        rawFee      = 0;
        description = `${rule.fee_name}: manual fee — amount to be set by admin`;
        break;

      default:
        skipped.push(`${rule.fee_name} — unknown calculation method`);
        continue;
    }

    // Apply min/max caps
    let feeAmount = rawFee;
    if (rule.minimum_fee != null && feeAmount < Number(rule.minimum_fee)) {
      feeAmount = Number(rule.minimum_fee);
      description += ` (minimum fee applied: ${currency} ${rule.minimum_fee})`;
    }
    if (rule.maximum_fee != null && feeAmount > Number(rule.maximum_fee)) {
      feeAmount = Number(rule.maximum_fee);
      description += ` (capped at maximum: ${currency} ${rule.maximum_fee})`;
    }

    // Skip zero-fee rules except Manual
    if (feeAmount === 0 && rule.calculation_method !== "Manual") {
      skipped.push(`${rule.fee_name} — calculated as zero`);
      continue;
    }

    records.push({
      job_reference:   jobReference,
      company_id:      job.customer_company_id ?? null,
      fee_rule_id:     rule.id,
      fee_type:        rule.fee_type,
      fee_description: description,
      base_amount:     baseAmount,
      fee_amount:      feeAmount,
      currency:        rule.currency ?? currency,
      fee_status:      "Calculated",
    });
  }

  return { records, skipped };
}
