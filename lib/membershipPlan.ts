// ─── Pricing Plan / Membership Commercial Package — shared types and helpers ──

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanStatus = "Active" | "Inactive" | "Draft";

export interface MembershipPlanRow {
  id:                             string;
  plan_name:                      string;
  plan_status:                    PlanStatus;
  annual_fee:                     number;
  monthly_equivalent:             number;
  currency:                       string;
  // Quotas
  included_secured_jobs:          number;
  included_document_extractions:  number;
  included_tracking_checks:       number;
  included_rfqs:                  number;
  included_quotations:            number;
  // Fee rates
  secured_job_fee_rate:           number;
  payment_holding_fee_rate:       number;
  controlled_release_fee_rate:    number;
  document_intelligence_fee:      number;
  tracking_monitoring_fee:        number;
  // Feature flags
  capital_readiness_access:       boolean;
  financing_simulation_access:    boolean;
  provider_benchmark_access:      boolean;
  customer_benchmark_access:      boolean;
  command_center_access:          boolean;
  priority_support:               boolean;
  custom_terms_allowed:           boolean;
  description:                    string | null;
  created_at:                     string;
  updated_at:                     string;
}

// Usage snapshot (computed from live data, not stored)
export interface PlanUsageSummary {
  secured_jobs_used:         number;
  document_extractions_used: number;
  tracking_checks_used:      number;
  rfqs_used:                 number;
  quotations_used:           number;
}

// ── Audit action keys ─────────────────────────────────────────────────────────

export const PLAN_AUDIT_ACTIONS = {
  created:               "membership_plan_created",
  updated:               "membership_plan_updated",
  activated:             "membership_plan_activated",
  deactivated:           "membership_plan_deactivated",
  upgrade_recommended:   "membership_upgrade_recommended",
} as const;

// ── Compliance note ───────────────────────────────────────────────────────────

export const PLAN_PRICING_DISCLAIMER =
  "Pilot pricing for validation only. Final commercial terms, fees, and feature sets may change before general availability. " +
  "No invoice is issued and no payment is processed through this platform.";

// ── Status badge ──────────────────────────────────────────────────────────────

export function planStatusBadge(status: PlanStatus): string {
  const map: Record<PlanStatus, string> = {
    Active:   "bg-emerald-900/50 text-emerald-300 border border-emerald-700/40",
    Inactive: "bg-slate-700/60 text-slate-400 border border-slate-600",
    Draft:    "bg-amber-900/30 text-amber-400 border border-amber-700/30",
  };
  return map[status] ?? "bg-slate-700 text-slate-300";
}

// ── Plan tier colour ──────────────────────────────────────────────────────────

export function planTierColor(planName: string): string {
  const name = planName.toLowerCase();
  if (name.includes("enterprise")) return "text-purple-300";
  if (name.includes("plus"))       return "text-cyan-300";
  if (name.includes("basic"))      return "text-slate-300";
  return "text-blue-300";
}

export function planTierBorder(planName: string): string {
  const name = planName.toLowerCase();
  if (name.includes("enterprise")) return "border-purple-700/50";
  if (name.includes("plus"))       return "border-cyan-700/50";
  if (name.includes("basic"))      return "border-slate-700/50";
  return "border-blue-700/50";
}

export function planTierGlow(planName: string): string {
  const name = planName.toLowerCase();
  if (name.includes("enterprise")) return "bg-purple-900/10";
  if (name.includes("plus"))       return "bg-cyan-900/10";
  return "bg-slate-800/20";
}

// ── Formatter ─────────────────────────────────────────────────────────────────

export function fmtPlanFee(amount: number, currency = "RM"): string {
  return `${currency} ${Number(amount).toLocaleString("en-MY", { minimumFractionDigits: 0 })}`;
}

// ── Usage % ───────────────────────────────────────────────────────────────────

export function usagePct(used: number, included: number): number {
  if (included <= 0) return 0;
  return Math.min(100, Math.round((used / included) * 100));
}

export function usageColor(pct: number): string {
  if (pct >= 100) return "text-red-400";
  if (pct >= 80)  return "text-amber-400";
  return "text-emerald-400";
}

export function usageBarColor(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80)  return "bg-amber-500";
  return "bg-emerald-500";
}

// ── Upgrade recommendation logic ──────────────────────────────────────────────

export type UpgradeReason =
  | "jobs_near_limit"
  | "docs_near_limit"
  | "tracking_near_limit"
  | "high_gmv"
  | "capital_usage"
  | "none";

export interface UpgradeRecommendation {
  shouldUpgrade: boolean;
  reasons:       UpgradeReason[];
  targetPlan:    string | null;
  message:       string;
}

export function computeUpgradeRecommendation(
  currentPlan: MembershipPlanRow,
  usage: PlanUsageSummary,
  gmv?: number,
  hasCapitalReadiness?: boolean,
): UpgradeRecommendation {
  const reasons: UpgradeReason[] = [];

  const jobPct  = usagePct(usage.secured_jobs_used,         currentPlan.included_secured_jobs);
  const docPct  = usagePct(usage.document_extractions_used, currentPlan.included_document_extractions);
  const syncPct = usagePct(usage.tracking_checks_used,      currentPlan.included_tracking_checks);

  if (jobPct  >= 80) reasons.push("jobs_near_limit");
  if (docPct  >= 80) reasons.push("docs_near_limit");
  if (syncPct >= 80) reasons.push("tracking_near_limit");
  if ((gmv ?? 0) > 500000)       reasons.push("high_gmv");
  if (hasCapitalReadiness && !currentPlan.capital_readiness_access) reasons.push("capital_usage");

  if (reasons.length === 0) {
    return { shouldUpgrade: false, reasons: [], targetPlan: null, message: "Usage is within limits. No upgrade needed at this time." };
  }

  const planName = currentPlan.plan_name.toLowerCase();
  let targetPlan: string | null = null;
  if (planName.includes("basic"))   targetPlan = "Plus";
  if (planName.includes("plus"))    targetPlan = "Enterprise";

  const msgs: string[] = [];
  if (reasons.includes("jobs_near_limit"))     msgs.push(`secured job quota at ${jobPct}%`);
  if (reasons.includes("docs_near_limit"))     msgs.push(`document extraction quota at ${docPct}%`);
  if (reasons.includes("tracking_near_limit")) msgs.push(`tracking check quota at ${syncPct}%`);
  if (reasons.includes("high_gmv"))            msgs.push("high GMV suggests enterprise-level needs");
  if (reasons.includes("capital_usage"))       msgs.push("capital readiness features needed but not included");

  const message = targetPlan
    ? `Upgrade to ${targetPlan} recommended: ${msgs.join("; ")}.`
    : `Consider reviewing plan: ${msgs.join("; ")}.`;

  return { shouldUpgrade: true, reasons, targetPlan, message };
}

// ── Feature list for display ──────────────────────────────────────────────────

export interface PlanFeature {
  label:    string;
  key:      keyof MembershipPlanRow;
  type:     "boolean" | "quota" | "rate" | "currency";
  suffix?:  string;
}

export const PLAN_FEATURES: PlanFeature[] = [
  { label: "Secured Jobs / year",            key: "included_secured_jobs",         type: "quota" },
  { label: "Document Extractions / year",    key: "included_document_extractions",  type: "quota" },
  { label: "Tracking Checks / year",         key: "included_tracking_checks",       type: "quota" },
  { label: "RFQs / year",                    key: "included_rfqs",                  type: "quota" },
  { label: "Quotations / year",              key: "included_quotations",            type: "quota" },
  { label: "Secured Job Fee Rate",           key: "secured_job_fee_rate",           type: "rate",  suffix: "%" },
  { label: "Payment Holding Fee Rate",       key: "payment_holding_fee_rate",       type: "rate",  suffix: "%" },
  { label: "Controlled Release Fee Rate",    key: "controlled_release_fee_rate",    type: "rate",  suffix: "%" },
  { label: "Doc Intelligence Fee / doc",     key: "document_intelligence_fee",      type: "currency" },
  { label: "Tracking Monitoring Fee / job",  key: "tracking_monitoring_fee",        type: "currency" },
  { label: "Capital Readiness Access",       key: "capital_readiness_access",       type: "boolean" },
  { label: "Financing Simulation",           key: "financing_simulation_access",    type: "boolean" },
  { label: "Provider Benchmarks",            key: "provider_benchmark_access",      type: "boolean" },
  { label: "Customer Benchmarks",            key: "customer_benchmark_access",      type: "boolean" },
  { label: "Command Center",                 key: "command_center_access",          type: "boolean" },
  { label: "Priority Support",               key: "priority_support",               type: "boolean" },
  { label: "Custom Terms",                   key: "custom_terms_allowed",           type: "boolean" },
];

// Editable numeric fields for admin form
export const PLAN_EDITABLE_FIELDS = [
  "plan_name", "plan_status", "annual_fee", "monthly_equivalent", "currency",
  "included_secured_jobs", "included_document_extractions", "included_tracking_checks",
  "included_rfqs", "included_quotations",
  "secured_job_fee_rate", "payment_holding_fee_rate", "controlled_release_fee_rate",
  "document_intelligence_fee", "tracking_monitoring_fee",
  "capital_readiness_access", "financing_simulation_access",
  "provider_benchmark_access", "customer_benchmark_access",
  "command_center_access", "priority_support", "custom_terms_allowed",
  "description",
] as const;
