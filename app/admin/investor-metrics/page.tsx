"use client";

// ─── /admin/investor-metrics ──────────────────────────────────────────────────
// Admin-only. Board / Investor Metrics Dashboard v1.
// Converts Nexum operating data into investor-grade KPIs.
// Rule-based only — no external analytics, no payment gateway, no auto-release.

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number, dp = 0): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
}
function fmtMYR(n: number): string { return `MYR ${fmt(n)}`; }
function fmtPct(n: number): string { return `${fmt(n, 1)}%`; }
function fmtK(n: number): string {
  if (n >= 1_000_000) return `${fmt(n / 1_000_000, 1)}M`;
  if (n >= 1_000)     return `${fmt(n / 1_000, 1)}K`;
  return fmt(n);
}

// ── Date filter ───────────────────────────────────────────────────────────────

type DateRange = "all" | "month" | "last_month" | "90d" | "custom";

function getDateBounds(range: DateRange, from: string, to: string): { from: string | null; to: string | null } {
  const now = new Date();
  if (range === "all") return { from: null, to: null };
  if (range === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
  }
  if (range === "last_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
      to:   new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    };
  }
  if (range === "90d") {
    const d = new Date(now); d.setDate(d.getDate() - 90);
    return { from: d.toISOString(), to: now.toISOString() };
  }
  if (range === "custom") {
    return {
      from: from ? `${from}T00:00:00.000Z` : null,
      to:   to   ? `${to}T23:59:59.999Z`   : null,
    };
  }
  return { from: null, to: null };
}

function inRange(d: string | null | undefined, from: string | null, to: string | null): boolean {
  if (!d) return true;
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface JobRow      { job_reference: string; job_value: number; currency: string; payment_status: string; job_status: string; created_at: string; total_secured_amount: number | null; customer: string | null; service_provider: string | null; risk_level: string | null; }
interface QuotRow     { id: string; quotation_status: string; quoted_amount: number; currency: string; created_at: string; converted_at: string | null; }
interface ObRow       { id: string; amount: number; currency: string; status: string; obligation_type: string; created_at: string; }
interface HeldRow     { id: string; amount: number; currency: string; holding_status: string; created_at: string; }
interface RelInstr    { id: string; amount: number; currency: string; instruction_status: string; created_at: string; }
interface Settlement  { id: string; settlement_amount: number | null; currency: string; settlement_status: string; created_at: string; }
interface NetStmt     { id: string; statement_status: string; net_release_eligible: number | null; total_released: number | null; currency: string; created_at: string; }
interface FeeRow      { id: string; job_reference: string | null; fee_amount: number; currency: string; fee_status: string; fee_type: string; created_at: string; }
interface MemberRow   { id: string; provider_company_id: string; membership_status: string; plan_id: string | null; created_at: string; expires_at: string | null; plan?: { plan_name: string; annual_fee: number | null; plan_tier?: string | null } | null; }
interface UsageRow    { id: string; provider_company_id: string; usage_type: string; usage_count: number; quota_limit: number | null; period_start: string; }
interface OverageRow  { id: string; total_overage_amount: number; status: string; created_at: string; }
interface SppRow      { id: string; advance_amount: number | null; currency: string; spp_status: string; created_at: string; }
interface ExposRow    { id: string; current_active_exposure: number | null; currency: string; }
interface CapRow      { id: string; readiness_status: string; readiness_score: number; max_recommended_amount: number | null; currency: string; assessment_type: string; created_at: string; }
interface OfferRow    { id: string; offer_status: string; offer_amount: number; currency: string; created_at: string; }
interface PartnerRow  { id: string; access_status: string; partner_interest_status: string | null; created_at: string; }
interface CreditPkRow { id: string; pack_status: string; created_at: string; }
interface RiskRow     { id: string; risk_severity: string; risk_status: string; risk_category: string | null; created_at: string; }
interface DisputeRow  { id: string; status: string; severity: string; claim_amount: number | null; currency: string; created_at: string; }
interface LiabRow     { id: string; liability_review_status: string; claimed_amount: number | null; currency: string; created_at: string; }
interface ClaimResRow { id: string; reserve_amount: number; reserve_status: string; currency: string; created_at: string; }
interface MilRow      { id: string; milestone_status: string; evidence_status: string; created_at: string; }
interface SuppRow     { id: string; supplier_status: string; created_at: string; }
interface ProcRow     { id: string; procurement_status: string; order_value_amount: number | null; advance_required_amount: number | null; discrepancy_flagged: boolean; currency: string; created_at: string; }
interface ProfileRow  { id: string; role: string; company_id: string | null; created_at: string; }
interface KPITargetIM {
  id: string; target_name: string; target_category: string;
  target_value: number; current_value: number; unit: string | null;
  period_end: string | null; status: string; priority: string;
  progress_percentage: number;
  milestones?: { milestone_name: string; milestone_status: string; due_date: string | null }[];
}

interface DashData {
  jobs:        JobRow[];
  quotations:  QuotRow[];
  obligations: ObRow[];
  held:        HeldRow[];
  relInstrs:   RelInstr[];
  settlements: Settlement[];
  netStmts:    NetStmt[];
  fees:        FeeRow[];
  members:     MemberRow[];
  usage:       UsageRow[];
  overages:    OverageRow[];
  spps:        SppRow[];
  exposure:    ExposRow[];
  capital:     CapRow[];
  offers:      OfferRow[];
  partnerAccess: PartnerRow[];
  creditPacks: CreditPkRow[];
  risks:       RiskRow[];
  disputes:    DisputeRow[];
  liabilities: LiabRow[];
  claimRes:    ClaimResRow[];
  milestones:  MilRow[];
  suppliers:   SuppRow[];
  procurement: ProcRow[];
  profiles:    ProfileRow[];
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color = "text-white", note }: {
  label: string; value: string | number; sub?: string; color?: string; note?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3">
      <div className={`text-2xl font-bold leading-none ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1.5 font-medium">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
      {note && <div className="text-[10px] text-amber-600 mt-0.5">{note}</div>}
    </div>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{title}</h2>
      {children}
    </section>
  );
}

// ── Board report generator ────────────────────────────────────────────────────

function buildInvestorSummary(d: DashData): { highlights: string[]; risks: string[]; traction: string; paymentVolume: string; revenueSignal: string; riskSignal: string; capitalPipeline: string } {
  const totalJobValue     = d.jobs.reduce((s, j) => s + (j.job_value ?? 0), 0);
  const activeJobs        = d.jobs.filter(j => !["Completed","Cancelled","Closed"].includes(j.job_status)).length;
  const completedJobs     = d.jobs.filter(j => j.job_status === "Completed").length;
  const totalSecured      = d.jobs.reduce((s, j) => s + (j.total_secured_amount ?? 0), 0);
  const totalReleased     = d.settlements.filter(s => ["Completed","Reconciled"].includes(s.settlement_status)).reduce((s, r) => s + (r.settlement_amount ?? 0), 0);
  const totalFees         = d.fees.reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const memberRevenue     = d.members.filter(m => m.membership_status === "Active").reduce((s, m) => s + ((m.plan as MemberRow["plan"])?.annual_fee ?? 0), 0);
  const critRisks         = d.risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const openDisputes      = d.disputes.filter(dsp => ["Open","Under Review","Escalated"].includes(dsp.status)).length;
  const activeMembers     = d.members.filter(m => m.membership_status === "Active").length;
  const capEligible       = d.capital.filter(c => ["Eligible","Conditionally Eligible"].includes(c.readiness_status)).length;
  const capTotal          = d.capital.reduce((s, c) => s + (c.max_recommended_amount ?? 0), 0);
  const quotAccepted      = d.quotations.filter(q => ["Accepted","Converted"].includes(q.quotation_status)).length;
  const quotTotal         = d.quotations.length;
  const quotAccRate       = quotTotal > 0 ? (quotAccepted / quotTotal) * 100 : 0;
  const takeRate          = totalSecured > 0 ? (totalFees / totalSecured) * 100 : 0;
  const activeProviders   = new Set(d.jobs.filter(j => j.service_provider).map(j => j.service_provider!)).size;
  const activeCustomers   = new Set(d.jobs.filter(j => j.customer).map(j => j.customer!)).size;
  const watchlistSupp     = d.suppliers.filter(s => ["Watchlist","Blocked"].includes(s.supplier_status)).length;

  const traction       = `${d.jobs.length} total secured jobs (${activeJobs} active, ${completedJobs} completed). ${activeProviders} active providers, ${activeCustomers} active customers. Quotation acceptance rate: ${fmtPct(quotAccRate)}.`;
  const paymentVolume  = `Total GMV: ${fmtMYR(totalJobValue)}. Total payment secured: ${fmtMYR(totalSecured)}. Total released: ${fmtMYR(totalReleased)}.`;
  const revenueSignal  = `Service fees: ${fmtMYR(totalFees)}. Estimated take rate: ${fmtPct(takeRate)}. Membership ARR: ${fmtMYR(memberRevenue)} from ${activeMembers} active members.`;
  const riskSignal     = critRisks > 0
    ? `⚠ ${critRisks} critical operational risk${critRisks !== 1 ? "s" : ""} open. ${openDisputes} open dispute${openDisputes !== 1 ? "s" : ""}.`
    : `No critical risks outstanding. ${openDisputes} open dispute${openDisputes !== 1 ? "s" : ""}.`;
  const capitalPipeline = capEligible > 0
    ? `${capEligible} capital-eligible companies. Total recommended financing: ${fmtMYR(capTotal)}. ${d.creditPacks.filter(c => c.pack_status === "Generated").length} credit pack(s) generated.`
    : "No capital-eligible companies in current data.";

  const highlights: string[] = [];
  if (d.jobs.length > 0)       highlights.push(`${d.jobs.length} secured trade protection jobs processed — ${fmtMYR(totalJobValue)} total GMV`);
  if (totalReleased > 0)       highlights.push(`${fmtMYR(totalReleased)} successfully released through the payment protection workflow`);
  if (memberRevenue > 0)       highlights.push(`${fmtMYR(memberRevenue)} estimated annual membership revenue from ${activeMembers} active provider${activeMembers !== 1 ? "s" : ""}`);
  if (totalFees > 0)           highlights.push(`${fmtMYR(totalFees)} total service fees calculated (take rate: ${fmtPct(takeRate)})`);
  if (capEligible > 0)         highlights.push(`${capEligible} company${capEligible !== 1 ? "ies" : ""} assessed as capital-eligible — ${fmtMYR(capTotal)} pipeline`);
  if (quotAccRate > 40)        highlights.push(`${fmtPct(quotAccRate)} quotation acceptance rate demonstrates commercial proposition fit`);

  const risks: string[] = [];
  if (critRisks > 0)           risks.push(`${critRisks} critical operational risk${critRisks !== 1 ? "s" : ""} unresolved — must be addressed before fundraising due diligence`);
  if (openDisputes > 0)        risks.push(`${openDisputes} open dispute${openDisputes !== 1 ? "s" : ""} — potential impact on payment release and customer trust`);
  if (watchlistSupp > 0)       risks.push(`${watchlistSupp} watchlist/blocked supplier${watchlistSupp !== 1 ? "s" : ""} — review counterparty risk exposure`);
  if (totalFees === 0)         risks.push("No service fees calculated — revenue model validation pending");
  if (memberRevenue === 0)     risks.push("No active paid memberships — SaaS revenue not yet generating");
  if (d.jobs.length < 10)      risks.push(`Low job count (${d.jobs.length}) — traction in early stage, pre-PMF`);

  return { highlights, risks, traction, paymentVolume, revenueSignal, riskSignal, capitalPipeline };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InvestorMetricsPage() {
  const [rawData,       setRawData]       = useState<DashData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [kpiTargets,    setKpiTargets]    = useState<KPITargetIM[]>([]);
  const [dateRange,     setDateRange]     = useState<DateRange>("all");
  const [customFrom,    setCustomFrom]    = useState("");
  const [customTo,      setCustomTo]      = useState("");
  const [copyMsg,       setCopyMsg]       = useState("");
  const [summaryOpen,   setSummaryOpen]   = useState(true);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (p?.role === "admin") setIsAdmin(true);
    })();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        jobsR, quotR, obR, heldR, relR, settlR, netR,
        feeR, membR, usageR, overageR, sppR, exposR,
        capR, offerR, partnerR, cpR, riskR, dispR,
        liabR, claimR, milR, supplR, procR, profilesR,
      ] = await Promise.all([
        supabase.from("secured_jobs").select("job_reference, job_value, currency, payment_status, job_status, created_at, total_secured_amount, customer, service_provider, risk_level").order("created_at", { ascending: false }).limit(2000),
        supabase.from("service_quotations").select("id, quotation_status, quoted_amount, currency, created_at, converted_at").order("created_at", { ascending: false }).limit(2000),
        supabase.from("payment_obligations").select("id, amount, currency, status, obligation_type, created_at").order("created_at", { ascending: false }).limit(2000),
        supabase.from("held_payments").select("id, amount, currency, holding_status, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("release_instructions").select("id, amount, currency, instruction_status, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("release_settlements").select("id, settlement_amount, currency, settlement_status, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("net_settlement_statements").select("id, statement_status, net_release_eligible, total_released, currency, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("nexum_service_fees").select("id, job_reference, fee_amount, currency, fee_status, fee_type, created_at").order("created_at", { ascending: false }).limit(2000),
        supabase.from("memberships").select("id, provider_company_id, membership_status, plan_id, created_at, expires_at, plan:membership_plans(plan_name, annual_fee)").order("created_at", { ascending: false }).limit(500),
        supabase.from("usage_metering_records").select("id, provider_company_id, usage_type, usage_count, quota_limit, period_start").order("period_start", { ascending: false }).limit(1000),
        supabase.from("overage_billing_summaries").select("id, total_overage_amount, status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("supplier_payment_protections").select("id, advance_amount, currency, spp_status, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("supplier_exposure_limits").select("id, current_active_exposure, currency").limit(500),
        supabase.from("capital_readiness_assessments").select("id, readiness_status, readiness_score, max_recommended_amount, currency, assessment_type, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("simulated_financing_offers").select("id, offer_status, offer_amount, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("capital_partner_access").select("id, access_status, partner_interest_status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("credit_packs").select("id, pack_status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("operational_risk_register").select("id, risk_severity, risk_status, risk_category, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("dispute_cases").select("id, status, severity, claim_amount, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("liability_reviews").select("id, liability_review_status, claimed_amount, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("claim_reserves").select("id, reserve_amount, reserve_status, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("supplier_release_milestones").select("id, milestone_status, evidence_status, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("supplier_counterparties").select("id, supplier_status, created_at").limit(1000),
        supabase.from("procurement_orders").select("id, procurement_status, order_value_amount, advance_required_amount, discrepancy_flagged, currency, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("profiles").select("id, role, company_id, created_at").limit(2000),
      ]);

      setRawData({
        jobs:          (jobsR.data   ?? []) as JobRow[],
        quotations:    (quotR.data   ?? []) as QuotRow[],
        obligations:   (obR.data     ?? []) as ObRow[],
        held:          (heldR.data   ?? []) as HeldRow[],
        relInstrs:     (relR.data    ?? []) as RelInstr[],
        settlements:   (settlR.data  ?? []) as Settlement[],
        netStmts:      (netR.data    ?? []) as NetStmt[],
        fees:          (feeR.data    ?? []) as FeeRow[],
        members:       (membR.data   ?? []) as unknown as MemberRow[],
        usage:         (usageR.data  ?? []) as UsageRow[],
        overages:      (overageR.data ?? []) as OverageRow[],
        spps:          (sppR.data    ?? []) as SppRow[],
        exposure:      (exposR.data  ?? []) as ExposRow[],
        capital:       (capR.data    ?? []) as CapRow[],
        offers:        (offerR.data  ?? []) as OfferRow[],
        partnerAccess: (partnerR.data ?? []) as PartnerRow[],
        creditPacks:   (cpR.data     ?? []) as CreditPkRow[],
        risks:         (riskR.data   ?? []) as RiskRow[],
        disputes:      (dispR.data   ?? []) as DisputeRow[],
        liabilities:   (liabR.data   ?? []) as LiabRow[],
        claimRes:      (claimR.data  ?? []) as ClaimResRow[],
        milestones:    (milR.data    ?? []) as MilRow[],
        suppliers:     (supplR.data  ?? []) as SuppRow[],
        procurement:   (procR.data   ?? []) as ProcRow[],
        profiles:      (profilesR.data ?? []) as ProfileRow[],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load investor metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  // Fetch strategic KPI targets separately (platform-wide, not date-filtered)
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("strategic_kpi_targets")
      .select("id, target_name, target_category, target_value, current_value, unit, period_end, status, priority, progress_percentage, milestones:strategic_milestones(milestone_name, milestone_status, due_date)")
      .not("status", "eq", "Cancelled")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setKpiTargets((data ?? []) as unknown as KPITargetIM[]));
  }, [isAdmin]);

  // ── Date filter ───────────────────────────────────────────────────────────

  const { from: dFrom, to: dTo } = useMemo(
    () => getDateBounds(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo],
  );

  const d = useMemo((): DashData | null => {
    if (!rawData) return null;
    if (!dFrom && !dTo) return rawData;
    const f = <T extends { created_at: string }>(arr: T[]): T[] => arr.filter(r => inRange(r.created_at, dFrom, dTo));
    return {
      ...rawData,
      jobs: f(rawData.jobs), quotations: f(rawData.quotations), obligations: f(rawData.obligations),
      held: f(rawData.held), relInstrs: f(rawData.relInstrs), settlements: f(rawData.settlements),
      netStmts: f(rawData.netStmts), fees: f(rawData.fees), members: f(rawData.members),
      usage: rawData.usage, overages: f(rawData.overages), spps: f(rawData.spps),
      capital: f(rawData.capital), offers: f(rawData.offers), partnerAccess: f(rawData.partnerAccess),
      creditPacks: f(rawData.creditPacks), risks: f(rawData.risks), disputes: f(rawData.disputes),
      liabilities: f(rawData.liabilities), claimRes: f(rawData.claimRes),
      milestones: f(rawData.milestones), procurement: f(rawData.procurement),
      // non-date-filtered:
      exposure: rawData.exposure, suppliers: rawData.suppliers, profiles: rawData.profiles,
    };
  }, [rawData, dFrom, dTo]);

  // ── Export helpers ────────────────────────────────────────────────────────

  const handleCopySummary = () => {
    if (!d) return;
    const s = buildInvestorSummary(d);
    const text = [
      `NEXUM SECUREFLOW — INVESTOR METRICS SUMMARY`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `TRACTION`,
      s.traction,
      ``,
      `PAYMENT VOLUME`,
      s.paymentVolume,
      ``,
      `REVENUE SIGNAL`,
      s.revenueSignal,
      ``,
      `RISK SIGNAL`,
      s.riskSignal,
      ``,
      `CAPITAL PIPELINE`,
      s.capitalPipeline,
      ``,
      `TOP HIGHLIGHTS`,
      ...s.highlights.map((h, i) => `${i + 1}. ${h}`),
      ``,
      `TOP RISKS TO RESOLVE`,
      ...s.risks.map((r, i) => `${i + 1}. ${r}`),
      ``,
      `This summary is generated from internal system data only. It does not constitute financial, legal, or investment advice.`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => { setCopyMsg("Copied!"); setTimeout(() => setCopyMsg(""), 2500); });
  };

  const handleExportJSON = () => {
    if (!d) return;
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), data: d }, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = `nexum-investor-metrics-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleBoardReport = () => {
    if (!d) return;
    const s = buildInvestorSummary(d);
    const html = `<!DOCTYPE html><html><head><title>Nexum Board Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;color:#1a1a2e;line-height:1.6}
h1{color:#1a1a2e;border-bottom:2px solid #1a1a2e;padding-bottom:8px}
h2{color:#2d3a8c;margin-top:32px}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
.kpi{border:1px solid #e0e0e0;border-radius:8px;padding:12px}
.kpi-value{font-size:1.5rem;font-weight:bold;color:#2d3a8c}
.kpi-label{font-size:.8rem;color:#666;margin-top:4px}
ul{padding-left:20px} li{margin:6px 0}
.disclaimer{font-size:.75rem;color:#999;border-top:1px solid #eee;padding-top:16px;margin-top:32px}
@media print{.no-print{display:none}}</style></head>
<body>
<h1>Nexum SecureFlow — Board Metrics Report</h1>
<p><strong>Generated:</strong> ${new Date().toLocaleString()} &nbsp; | &nbsp; <strong>Period:</strong> ${dateRange === "all" ? "All Time" : dateRange}</p>
<h2>Executive Traction</h2><p>${s.traction}</p>
<h2>Payment Volume</h2><p>${s.paymentVolume}</p>
<h2>Revenue Signal</h2><p>${s.revenueSignal}</p>
<h2>Risk Signal</h2><p>${s.riskSignal}</p>
<h2>Capital Pipeline</h2><p>${s.capitalPipeline}</p>
<h2>Top ${s.highlights.length} Investor Highlights</h2><ul>${s.highlights.map(h => `<li>${h}</li>`).join("")}</ul>
<h2>Top ${s.risks.length} Risks to Resolve Before Fundraising</h2><ul>${s.risks.map(r => `<li>${r}</li>`).join("")}</ul>
${kpiTargets.length > 0 ? `<h2>Strategic KPI Target Progress</h2><table style="width:100%;border-collapse:collapse;font-size:.85rem"><thead><tr style="border-bottom:2px solid #e0e0e0"><th style="text-align:left;padding:6px">Target</th><th style="padding:6px">Category</th><th style="text-align:right;padding:6px">Progress</th><th style="text-align:center;padding:6px">Status</th></tr></thead><tbody>${kpiTargets.map(t=>`<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:6px">${t.target_name}</td><td style="padding:6px;color:#666">${t.target_category}</td><td style="padding:6px;text-align:right">${t.current_value.toLocaleString()}/${t.target_value.toLocaleString()}${t.unit?` ${t.unit}`:""} (${Math.min(100,t.progress_percentage).toFixed(0)}%)</td><td style="padding:6px;text-align:center"><b>${t.status}</b></td></tr>`).join("")}</tbody></table><p style="font-size:.8rem;color:#666;margin-top:8px">Achieved: ${kpiTargets.filter(t=>t.status==="Achieved").length} · On Track: ${kpiTargets.filter(t=>t.status==="On Track").length} · At Risk: ${kpiTargets.filter(t=>t.status==="At Risk").length} · Behind/Missed: ${kpiTargets.filter(t=>t.status==="Behind"||t.status==="Missed").length}</p>` : ""}
<div class="disclaimer">This report is generated from Nexum SecureFlow internal operating data. It does not constitute financial, legal, or investment advice. All metrics require independent verification before investor presentation.</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!isAdmin && !loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-slate-500 text-sm">Access restricted to admin only.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading investor metrics…</p>
      </div>
    );
  }
  if (error || !d) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-red-400 text-sm">{error ?? "No data"}</p>
      </div>
    );
  }

  // ── All derived KPIs ──────────────────────────────────────────────────────

  // Section 1 — Traction
  const totalJobs         = d.jobs.length;
  const activeJobs        = d.jobs.filter(j => !["Completed","Cancelled","Closed"].includes(j.job_status)).length;
  const completedJobs     = d.jobs.filter(j => j.job_status === "Completed").length;
  const cancelledJobs     = d.jobs.filter(j => j.job_status === "Cancelled").length;
  const totalQuots        = d.quotations.length;
  const acceptedQuots     = d.quotations.filter(q => ["Accepted","Converted"].includes(q.quotation_status)).length;
  const convertedQuots    = d.quotations.filter(q => q.quotation_status === "Converted").length;
  const quotAcceptRate    = totalQuots > 0 ? (acceptedQuots / totalQuots) * 100 : 0;
  const quotConvertRate   = totalQuots > 0 ? (convertedQuots / totalQuots) * 100 : 0;
  const activeProviders   = new Set(d.jobs.filter(j => j.service_provider).map(j => j.service_provider!)).size;
  const activeCustomers   = new Set(d.jobs.filter(j => j.customer).map(j => j.customer!)).size;
  const providerProfiles  = d.profiles.filter(p => p.role === "service_provider").length;
  const customerProfiles  = d.profiles.filter(p => p.role === "customer").length;
  const activeSuppCount   = d.suppliers.filter(s => !["Blocked"].includes(s.supplier_status)).length;
  const totalProcOrders   = d.procurement.length;

  // Section 2 — GMV / Flow
  const totalJobValue     = d.jobs.reduce((s, j) => s + (j.job_value ?? 0), 0);
  const totalSecuredAmt   = d.jobs.reduce((s, j) => s + (j.total_secured_amount ?? 0), 0);
  const totalObligations  = d.obligations.reduce((s, o) => s + (o.amount ?? 0), 0);
  const totalHeld         = d.held.filter(h => h.holding_status === "Held").reduce((s, h) => s + (h.amount ?? 0), 0);
  const totalRelElig      = d.netStmts.filter(n => ["Generated","Approved"].includes(n.statement_status)).reduce((s, n) => s + (n.net_release_eligible ?? 0), 0);
  const totalReleased     = d.settlements.filter(s => ["Completed","Reconciled"].includes(s.settlement_status)).reduce((s, r) => s + (r.settlement_amount ?? 0), 0);
  const totalReconciled   = d.settlements.filter(s => s.settlement_status === "Reconciled").reduce((s, r) => s + (r.settlement_amount ?? 0), 0);
  const sppAdvanceVol     = d.spps.filter(s => ["Active","Advance Paid","Completed"].includes(s.spp_status)).reduce((s, p) => s + (p.advance_amount ?? 0), 0);
  const procOrderValue    = d.procurement.reduce((s, p) => s + (p.order_value_amount ?? 0), 0);

  // Section 3 — Revenue
  const activeMemberRows  = d.members.filter(m => m.membership_status === "Active");
  const memberARR         = activeMemberRows.reduce((s, m) => s + ((m.plan as MemberRow["plan"])?.annual_fee ?? 0), 0);
  const totalFees         = d.fees.reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const approvedFees      = d.fees.filter(f => f.fee_status === "Approved").reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const waivedFees        = d.fees.filter(f => f.fee_status === "Waived").reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const overageBilling    = d.overages.reduce((s, o) => s + (o.total_overage_amount ?? 0), 0);
  const avgRevPerProvider = providerProfiles > 0 ? memberARR / providerProfiles : 0;
  const takeRate          = totalSecuredAmt > 0 ? (totalFees / totalSecuredAmt) * 100 : 0;
  const estimatedARR      = memberARR + (totalFees * 12); // rough annualisation if fees are ~monthly

  // Section 4 — Payment Control
  const proofUploaded     = d.obligations.filter(o => o.status === "Proof Uploaded").length;
  const reconMatched      = d.held.filter(h => h.holding_status === "Matched").length;
  const paymentSecured    = d.held.filter(h => h.holding_status === "Held").length;
  const relApproved       = d.netStmts.filter(n => n.statement_status === "Approved").length;
  const relInstructed     = d.relInstrs.filter(r => r.instruction_status === "Instructed").length;
  const settlReconciled   = d.settlements.filter(s => s.settlement_status === "Reconciled").length;
  const disputedVolume    = d.disputes.filter(dsp => ["Open","Under Review","Escalated"].includes(dsp.status)).reduce((s, dsp) => s + (dsp.claim_amount ?? 0), 0);

  // Section 5 — Risk
  const openRisks         = d.risks.filter(r => !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const critRisks         = d.risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const openDisputes      = d.disputes.filter(dsp => ["Open","Under Review","Escalated"].includes(dsp.status)).length;
  const openLiabilities   = d.liabilities.filter(l => ["Open","Under Review","Pending"].includes(l.liability_review_status)).length;
  const activeReserves    = d.claimRes.filter(c => c.reserve_status === "Active").length;
  const reservedAmt       = d.claimRes.filter(c => c.reserve_status === "Active").reduce((s, c) => s + (c.reserve_amount ?? 0), 0);
  const relBlockedAmt     = d.disputes.filter(d2 => ["Open","Under Review","Escalated"].includes(d2.status)).reduce((s, d2) => s + (d2.claim_amount ?? 0), 0) +
                            d.claimRes.filter(c => c.reserve_status === "Active").reduce((s, c) => s + (c.reserve_amount ?? 0), 0);
  const watchlistSupp     = d.suppliers.filter(s => s.supplier_status === "Watchlist").length;
  const blockedSupp       = d.suppliers.filter(s => s.supplier_status === "Blocked").length;

  // Section 6 — Supplier / Procurement
  const activeSPPs        = d.spps.filter(s => ["Active","Advance Paid"].includes(s.spp_status)).length;
  const milVerified       = d.milestones.filter(m => m.milestone_status === "Verified" || m.milestone_status === "Released").length;
  const milRelElig        = d.milestones.filter(m => m.milestone_status === "Release Eligible").length;
  const totalExposure     = d.exposure.reduce((s, e) => s + (e.current_active_exposure ?? 0), 0);
  const newSuppliers      = d.suppliers.filter(s => s.supplier_status === "New").length;
  const procDiscrepant    = d.procurement.filter(p => p.discrepancy_flagged).length;
  const procBlocked       = d.procurement.filter(p => ["Blocked","On Hold","Disputed"].includes(p.procurement_status)).length;

  // Section 7 — Capital Pipeline
  const capAssessed       = d.capital.length;
  const capEligible       = d.capital.filter(c => c.readiness_status === "Eligible").length;
  const capCondEligible   = d.capital.filter(c => c.readiness_status === "Conditionally Eligible").length;
  const capPriority       = d.capital.filter(c => c.readiness_score >= 70).length;
  const simOffers         = d.offers.filter(o => ["Simulated","Interested"].includes(o.offer_status)).length;
  const totalOfferAmt     = d.offers.filter(o => !["Rejected","Expired"].includes(o.offer_status)).reduce((s, o) => s + (o.offer_amount ?? 0), 0);
  const partnerShared     = d.partnerAccess.filter(p => p.access_status === "Active").length;
  const cpGenerated       = d.creditPacks.filter(c => c.pack_status === "Generated").length;
  const partnerInterested = d.partnerAccess.filter(p => p.partner_interest_status === "Interested").length;

  // Section 8 — Membership / SaaS
  const planGroups        = activeMemberRows.reduce<Record<string, number>>((acc, m) => {
    const name = (m.plan as MemberRow["plan"])?.plan_name ?? "Unknown";
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const trialMembers      = d.members.filter(m => m.membership_status === "Trial").length;
  const suspendedMembers  = d.members.filter(m => ["Suspended","Expired"].includes(m.membership_status)).length;
  const expiringSoon      = d.members.filter(m => m.expires_at && m.membership_status === "Active" && new Date(m.expires_at) < new Date(Date.now() + 30 * 86400000)).length;
  const overQuotaProviders = d.usage.filter(u => u.quota_limit && u.usage_count > u.quota_limit).length;
  const nearQuotaProviders = d.usage.filter(u => u.quota_limit && u.usage_count >= u.quota_limit * 0.9 && u.usage_count < u.quota_limit).length;
  const startOfMonth      = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const usageThisMonth    = d.usage.filter(u => u.period_start >= startOfMonth).length;

  // Section 9 — Unit Economics
  const avgJobValue       = totalJobs > 0 ? totalJobValue / totalJobs : 0;
  const avgSecuredAmt     = totalJobs > 0 ? totalSecuredAmt / totalJobs : 0;
  const avgFeePerJob      = totalJobs > 0 ? totalFees / totalJobs : 0;
  const disputesPer100    = totalJobs > 0 ? (openDisputes / totalJobs) * 100 : 0;
  const avgSPPPerJob      = totalJobs > 0 ? activeSPPs / totalJobs : 0;
  const completionRate    = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  // Investor summary
  const investorSummary   = buildInvestorSummary(d);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200 p-6">

      {/* Nav */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <a href="/admin/command-center"      className="hover:text-slate-300 transition">← Command Center</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/executive-dashboard" className="hover:text-slate-300 transition">Executive Dashboard</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/risk-register"       className="hover:text-slate-300 transition">Risk Register</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/credit-packs"        className="hover:text-slate-300 transition">Credit Packs</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/kpi-targets"         className="hover:text-slate-300 transition">KPI Targets</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/data-room"           className="hover:text-slate-300 transition">Data Room</a>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Board / Investor Metrics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Traction · GMV · Revenue · Risk · Capital — Admin only · Rule-based · No external analytics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCopySummary} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition">
            {copyMsg || "📋 Copy Summary"}
          </button>
          <button onClick={handleExportJSON} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition">
            ⬇ Export JSON
          </button>
          <button onClick={handleBoardReport} className="px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/25 text-xs transition">
            📄 Board Report
          </button>
          <a
            href="/admin/data-room/items/new?category=Governance&label=Investor+Metrics+Report"
            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-xs transition"
          >
            + Add to Data Room
          </a>
          <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition">
            🖨 Print
          </button>
          <button onClick={fetchAll} className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 text-xs transition">
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="mb-6 rounded-xl border border-slate-700/40 bg-slate-900/40 p-4 flex flex-wrap gap-3 items-center">
        {([["all","All Time"],["month","This Month"],["last_month","Last Month"],["90d","Last 90d"],["custom","Custom"]] as [DateRange, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setDateRange(k)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition border ${dateRange === k ? "bg-blue-500/20 border-blue-500/40 text-blue-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
        {dateRange === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none" />
            <span className="text-slate-600 text-xs">→</span>
            <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none" />
          </>
        )}
        <span className="text-[10px] text-slate-600 ml-auto">{totalJobs} job{totalJobs !== 1 ? "s" : ""} in period</span>
      </div>

      {/* ── Section 10: Investor Summary ─────────────────────────────────────── */}
      <div className="mb-8 rounded-xl border border-indigo-500/25 bg-indigo-500/5">
        <button
          onClick={() => setSummaryOpen(o => !o)}
          className="w-full px-5 py-3 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <span className="text-sm font-semibold text-indigo-300">Investor Summary</span>
            <span className="text-[10px] text-indigo-500/60">Rule-based · Internal data only</span>
          </div>
          <span className="text-slate-600 text-xs">{summaryOpen ? "▲" : "▼"}</span>
        </button>
        {summaryOpen && (
          <div className="border-t border-indigo-500/15 px-5 py-4 space-y-4">
            {/* Summary paragraphs */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                { label: "Traction",        content: investorSummary.traction },
                { label: "Payment Volume",  content: investorSummary.paymentVolume },
                { label: "Revenue Signal",  content: investorSummary.revenueSignal },
                { label: "Risk Signal",     content: investorSummary.riskSignal },
                { label: "Capital Pipeline", content: investorSummary.capitalPipeline },
              ].map(item => (
                <div key={item.label} className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">{item.label}</div>
                  <div className="text-slate-300 leading-relaxed">{item.content}</div>
                </div>
              ))}
            </div>

            {/* Top highlights */}
            {investorSummary.highlights.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-emerald-500 mb-2">🟢 Top {investorSummary.highlights.length} Investor Highlights</div>
                <ul className="space-y-1.5">
                  {investorSummary.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-emerald-500 shrink-0 font-bold">{i + 1}.</span> {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top risks */}
            {investorSummary.risks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-500 mb-2">🔴 Top {investorSummary.risks.length} Risks to Resolve Before Fundraising</div>
                <ul className="space-y-1.5">
                  {investorSummary.risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-red-400 shrink-0 font-bold">{i + 1}.</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] text-slate-600">
              This summary is generated from Nexum SecureFlow internal data only. It does not constitute financial, legal, or investment advice. All metrics require independent verification before investor presentation.
            </p>
          </div>
        )}
      </div>

      {/* ── Section 1: Traction ──────────────────────────────────────────────── */}
      <Section title="1 · Traction Metrics" id="traction">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <KPI label="Total Secured Jobs"      value={fmt(totalJobs)}         color="text-white" />
          <KPI label="Active Jobs"             value={fmt(activeJobs)}        color="text-blue-400" />
          <KPI label="Completed Jobs"          value={fmt(completedJobs)}     color="text-emerald-400" />
          <KPI label="Job Completion Rate"     value={fmtPct(completionRate)} color="text-emerald-400" />
          <KPI label="Quotations Issued"       value={fmt(totalQuots)}        color="text-white" />
          <KPI label="Quotation Acceptance %"  value={fmtPct(quotAcceptRate)} color={quotAcceptRate > 30 ? "text-emerald-400" : "text-amber-400"} sub={`${acceptedQuots}/${totalQuots} accepted`} />
          <KPI label="Quotation Convert %"     value={fmtPct(quotConvertRate)} color="text-indigo-400" sub={`${convertedQuots} converted to jobs`} />
          <KPI label="Active Providers"        value={fmt(activeProviders)}   color="text-purple-400" sub={`${providerProfiles} registered`} />
          <KPI label="Active Customers"        value={fmt(activeCustomers)}   color="text-cyan-400"   sub={`${customerProfiles} registered`} />
          <KPI label="Active Supplier Profiles" value={fmt(activeSuppCount)} color="text-amber-400" />
          <KPI label="Procurement Orders"      value={fmt(totalProcOrders)}   color="text-white" />
          <KPI label="Cancelled Jobs"          value={fmt(cancelledJobs)}     color={cancelledJobs > 0 ? "text-slate-400" : "text-slate-600"} />
        </div>
      </Section>

      {/* ── Section 2: GMV / Flow ────────────────────────────────────────────── */}
      <Section title="2 · GMV & Payment Flow Metrics" id="gmv">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KPI label="Total Job Value (GMV)"      value={fmtMYR(totalJobValue)}     color="text-white"        sub="All jobs in period" />
          <KPI label="Total Secured Amount"       value={fmtMYR(totalSecuredAmt)}   color="text-blue-400"     sub="Secured through Nexum" />
          <KPI label="Total Payment Obligations"  value={fmtMYR(totalObligations)}  color="text-amber-400"    sub="Deposit + balance total" />
          <KPI label="Payment Secured (Held)"     value={fmtMYR(totalHeld)}         color="text-emerald-400"  sub="In holding account" />
          <KPI label="Release Eligible"           value={fmtMYR(totalRelElig)}      color="text-blue-400"     sub="Awaiting release instruction" />
          <KPI label="Total Released"             value={fmtMYR(totalReleased)}     color="text-emerald-400"  sub="Settled to provider" />
          <KPI label="Total Reconciled"           value={fmtMYR(totalReconciled)}   color="text-emerald-400"  sub="Settlement + recon complete" />
          <KPI label="Supplier Advance Protected" value={fmtMYR(sppAdvanceVol)}     color="text-indigo-400"   sub="SPP advance flows" />
          <KPI label="Procurement Order Value"    value={fmtMYR(procOrderValue)}    color="text-purple-400"   sub="Total PO value" />
        </div>
      </Section>

      {/* ── Section 3: Revenue ───────────────────────────────────────────────── */}
      <Section title="3 · Revenue Metrics" id="revenue">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KPI label="Membership ARR"           value={fmtMYR(memberARR)}          color="text-purple-400"  sub={`${activeMemberRows.length} active members`} />
          <KPI label="Est. ARR (Fees + Members)" value={fmtMYR(memberARR + approvedFees * 12)} color="text-purple-400" note="Illustrative — not audited" />
          <KPI label="Service Fees Calculated"  value={fmtMYR(totalFees)}          color="text-indigo-400"  sub="All statuses" />
          <KPI label="Service Fees Approved"    value={fmtMYR(approvedFees)}       color="text-emerald-400" />
          <KPI label="Fees Waived"              value={fmtMYR(waivedFees)}         color="text-slate-400"   />
          <KPI label="Overage Billing"          value={fmtMYR(overageBilling)}     color={overageBilling > 0 ? "text-amber-400" : "text-slate-400"} />
          <KPI label="Avg Revenue / Provider"   value={fmtMYR(avgRevPerProvider)}  color="text-indigo-400"  sub="Membership ARR ÷ profiles" />
          <KPI label="Take Rate (Fees / Secured)" value={fmtPct(takeRate)}         color={takeRate > 0 ? "text-cyan-400" : "text-slate-500"} sub="Service fees ÷ secured amount" note={takeRate === 0 ? "No fees calculated yet" : undefined} />
        </div>

        {/* Plan breakdown */}
        {Object.keys(planGroups).length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3">
            <div className="text-[10px] font-medium text-slate-500 mb-2">Active Members by Plan</div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(planGroups).map(([name, count]) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">{name}:</span>
                  <span className="text-white font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 4: Payment Control ───────────────────────────────────────── */}
      <Section title="4 · Payment Control Metrics" id="payment-control">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KPI label="Proof Uploaded"          value={fmt(proofUploaded)}    color="text-amber-400"  />
          <KPI label="Reconciliation Matched"  value={fmt(reconMatched)}     color="text-emerald-400" />
          <KPI label="Payment Secured"         value={fmt(paymentSecured)}   color="text-emerald-400" />
          <KPI label="Release Approved"        value={fmt(relApproved)}      color="text-blue-400"   />
          <KPI label="Release Instructed"      value={fmt(relInstructed)}    color="text-indigo-400" />
          <KPI label="Settlement Reconciled"   value={fmt(settlReconciled)}  color="text-emerald-400" />
          <KPI label="Disputed Volume"         value={fmtMYR(disputedVolume)} color={disputedVolume > 0 ? "text-red-400" : "text-slate-400"} />
          <KPI label="Avg. Cycle Time"         value="—" color="text-slate-500" note="Requires timestamped event log" />
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Average payment secured time and release cycle time require event-level timestamps — add created_at tracking to future milestone log. No money is released automatically.</p>
      </Section>

      {/* ── Section 5: Risk Metrics ──────────────────────────────────────────── */}
      <Section title="5 · Risk Metrics" id="risk">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KPI label="Open Risks"                  value={fmt(openRisks)}         color={openRisks > 0 ? "text-amber-400" : "text-slate-400"}  note="→ Risk Register" />
          <KPI label="Critical Risks"              value={fmt(critRisks)}          color={critRisks > 0 ? "text-red-400" : "text-slate-400"}   />
          <KPI label="Open Disputes"               value={fmt(openDisputes)}       color={openDisputes > 0 ? "text-red-400" : "text-slate-400"} />
          <KPI label="Open Liability Reviews"      value={fmt(openLiabilities)}    color={openLiabilities > 0 ? "text-orange-400" : "text-slate-400"} />
          <KPI label="Active Claim Reserves"       value={fmt(activeReserves)}     color={activeReserves > 0 ? "text-amber-400" : "text-slate-400"} sub={fmtMYR(reservedAmt)} />
          <KPI label="Release Blocked Amount"      value={fmtMYR(relBlockedAmt)}   color={relBlockedAmt > 0 ? "text-red-400" : "text-slate-400"} />
          <KPI label="Watchlist Suppliers"         value={fmt(watchlistSupp)}      color={watchlistSupp > 0 ? "text-orange-400" : "text-slate-400"} />
          <KPI label="Blocked Suppliers"           value={fmt(blockedSupp)}        color={blockedSupp > 0 ? "text-red-400" : "text-slate-400"} />
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Risk metrics are internal operational signals. They do not constitute legal, compliance, or fraud conclusions. Customer/provider watchlist requires company-level risk flag — tracked via profiles/companies table.</p>
      </Section>

      {/* ── Section 6: Supplier / Procurement ───────────────────────────────── */}
      <Section title="6 · Supplier & Procurement Metrics" id="supplier">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KPI label="Active SPP Flows"            value={fmt(activeSPPs)}        color="text-blue-400"    sub="Supplier advance protected" />
          <KPI label="SPP Advance Volume"          value={fmtMYR(sppAdvanceVol)}  color="text-indigo-400"  />
          <KPI label="Milestones Verified / Released" value={fmt(milVerified)}    color="text-emerald-400" />
          <KPI label="Milestones Release Eligible" value={fmt(milRelElig)}        color="text-blue-400"   />
          <KPI label="Supplier Exposure Active"    value={fmtMYR(totalExposure)}  color={totalExposure > 500000 ? "text-orange-400" : "text-emerald-400"} />
          <KPI label="New Suppliers"               value={fmt(newSuppliers)}      color="text-amber-400"  sub="Status: New" />
          <KPI label="Watchlist Suppliers"         value={fmt(watchlistSupp)}     color={watchlistSupp > 0 ? "text-orange-400" : "text-slate-400"} />
          <KPI label="Procurement Discrepancies"   value={fmt(procDiscrepant)}    color={procDiscrepant > 0 ? "text-amber-400" : "text-slate-400"} />
          <KPI label="Procurement Blocked"         value={fmt(procBlocked)}       color={procBlocked > 0 ? "text-red-400" : "text-slate-400"} />
        </div>
      </Section>

      {/* ── Section 7: Capital Pipeline ─────────────────────────────────────── */}
      <Section title="7 · Capital Pipeline Metrics" id="capital" >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KPI label="Companies Assessed"         value={fmt(capAssessed)}         color="text-white"        />
          <KPI label="Eligible Companies"         value={fmt(capEligible)}         color="text-cyan-400"     />
          <KPI label="Conditionally Eligible"     value={fmt(capCondEligible)}     color="text-cyan-400"     />
          <KPI label="Priority (Score ≥70)"       value={fmt(capPriority)}         color="text-cyan-400"     />
          <KPI label="Simulated Offers Active"    value={fmt(simOffers)}           color="text-blue-400"     />
          <KPI label="Total Simulated Offer Amt"  value={fmtMYR(totalOfferAmt)}   color="text-blue-400"     sub="Eligible + simulated" />
          <KPI label="Partner Access Shared"      value={fmt(partnerShared)}       color="text-indigo-400"   />
          <KPI label="Partner Interest Confirmed" value={fmt(partnerInterested)}   color={partnerInterested > 0 ? "text-emerald-400" : "text-slate-400"} />
          <KPI label="Credit Packs Generated"     value={fmt(cpGenerated)}         color="text-indigo-400"   />
        </div>
      </Section>

      {/* ── Section 8: Membership / SaaS ────────────────────────────────────── */}
      <Section title="8 · Membership & SaaS Metrics" id="membership">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(planGroups).map(([plan, count]) => (
            <KPI key={plan} label={`${plan} Members`} value={fmt(count)} color="text-purple-400" />
          ))}
          <KPI label="Trial Members"          value={fmt(trialMembers)}        color="text-amber-400"    />
          <KPI label="Upgrade Candidates"     value={fmt(nearQuotaProviders + overQuotaProviders)} color="text-blue-400" sub="Near + over quota" />
          <KPI label="Over Quota Providers"   value={fmt(overQuotaProviders)}  color={overQuotaProviders > 0 ? "text-orange-400" : "text-slate-400"} />
          <KPI label="Renewals Due ≤30d"      value={fmt(expiringSoon)}        color={expiringSoon > 0 ? "text-orange-400" : "text-slate-400"} />
          <KPI label="Suspended / Expired"    value={fmt(suspendedMembers)}    color={suspendedMembers > 0 ? "text-red-400" : "text-slate-400"} note={suspendedMembers > 0 ? "Churn risk" : undefined} />
          <KPI label="Usage Records (Month)"  value={fmt(usageThisMonth)}      color="text-white"       />
          <KPI label="Membership ARR"         value={fmtMYR(memberARR)}        color="text-purple-400"  />
        </div>
      </Section>

      {/* ── Section 9: Unit Economics ────────────────────────────────────────── */}
      <Section title="9 · Unit Economics" id="unit-economics">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <KPI label="Avg Job Value"              value={fmtMYR(avgJobValue)}    color="text-white"    />
          <KPI label="Avg Secured Amount"         value={fmtMYR(avgSecuredAmt)}  color="text-blue-400"  />
          <KPI label="Avg Service Fee / Job"      value={fmtMYR(avgFeePerJob)}   color="text-indigo-400" note={avgFeePerJob === 0 ? "No fees yet" : undefined} />
          <KPI label="Disputes per 100 Jobs"      value={fmtPct(disputesPer100)} color={disputesPer100 > 5 ? "text-orange-400" : "text-emerald-400"} />
          <KPI label="SPP Flows per Job"          value={fmt(avgSPPPerJob, 2)}   color="text-purple-400"  sub="Active SPPs ÷ total jobs" />
          <KPI label="Job Completion Rate"        value={fmtPct(completionRate)} color={completionRate > 70 ? "text-emerald-400" : "text-amber-400"} />
          <KPI label="Take Rate"                  value={fmtPct(takeRate)}       color="text-cyan-400"   sub="Fees ÷ secured amount" note={takeRate === 0 ? "No approved fees yet" : undefined} />
          <KPI label="Est. Contribution Margin"   value="—" color="text-slate-500" note="Add COGS tracking for full margin" />
        </div>
        <p className="mt-2 text-[10px] text-slate-600">
          Unit economics are calculated from internal platform data. Contribution margin requires cost-of-goods-sold (COGS) inputs not yet tracked in the system. Average cycle times require event-level timestamp logging.
        </p>
      </Section>

      {/* ── Section 10: Strategic KPI Targets ───────────────────────────────── */}
      <Section title="10 · Strategic KPI Targets" id="kpi-targets">
        {kpiTargets.length === 0 ? (
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-5 py-6 text-center">
            <p className="text-slate-500 text-sm">No strategic targets set yet.</p>
            <a href="/admin/kpi-targets/new" className="text-xs text-indigo-400 hover:underline mt-1 inline-block">
              + Create your first strategic target
            </a>
          </div>
        ) : (() => {
          const kpiAchieved  = kpiTargets.filter(t => t.status === "Achieved");
          const kpiOnTrack   = kpiTargets.filter(t => t.status === "On Track");
          const kpiAtRisk    = kpiTargets.filter(t => t.status === "At Risk");
          const kpiBehind    = kpiTargets.filter(t => t.status === "Behind" || t.status === "Missed");
          const kpiCritical  = kpiTargets.filter(t => t.priority === "Critical" && t.status !== "Achieved");
          const allMs        = kpiTargets.flatMap(t => t.milestones ?? []);
          const overdueMs    = allMs.filter(m => m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled" && m.due_date && m.due_date < new Date().toISOString().slice(0, 10));
          const upcomingMs   = allMs.filter(m => {
            if (m.milestone_status === "Completed" || m.milestone_status === "Cancelled" || !m.due_date) return false;
            const diff = (new Date(m.due_date).getTime() - Date.now()) / 86400000;
            return diff >= 0 && diff <= 30;
          });

          return (
            <div className="space-y-4">
              {/* Summary widgets */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPI label="Achieved"         value={fmt(kpiAchieved.length)}  color="text-emerald-400" />
                <KPI label="On Track"         value={fmt(kpiOnTrack.length)}   color="text-blue-400" />
                <KPI label="At Risk"          value={fmt(kpiAtRisk.length)}    color={kpiAtRisk.length > 0 ? "text-amber-400" : "text-slate-500"} />
                <KPI label="Behind / Missed"  value={fmt(kpiBehind.length)}    color={kpiBehind.length > 0 ? "text-red-400" : "text-slate-500"} />
                <KPI label="Overdue Milestones" value={fmt(overdueMs.length)}  color={overdueMs.length > 0 ? "text-orange-400" : "text-slate-500"} />
                <KPI label="Milestones Due ≤30d" value={fmt(upcomingMs.length)} color={upcomingMs.length > 0 ? "text-amber-400" : "text-slate-500"} />
              </div>

              {/* Critical targets */}
              {kpiCritical.length > 0 && (
                <div className="rounded-xl border border-red-800/50 bg-red-950/20 px-4 py-3">
                  <p className="text-xs font-semibold text-red-400 mb-2">⚠ Critical Priority Targets</p>
                  <div className="space-y-1.5">
                    {kpiCritical.slice(0, 5).map(t => (
                      <div key={t.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-300 truncate">{t.target_name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="w-20 bg-slate-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${Math.min(100, t.progress_percentage)}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400">{fmt(t.progress_percentage, 0)}%</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            t.status === "Behind" ? "bg-red-950 text-red-400 border-red-800" :
                            t.status === "At Risk" ? "bg-amber-950 text-amber-400 border-amber-800" :
                            "bg-slate-800 text-slate-400 border-slate-700"
                          }`}>{t.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Targets table */}
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/20 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/40">
                      <th className="text-left px-4 py-2 text-slate-500 font-medium">Target</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium hidden sm:table-cell">Category</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">Progress</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium hidden md:table-cell">Value</th>
                      <th className="text-center px-3 py-2 text-slate-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiTargets.map(t => (
                      <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition">
                        <td className="px-4 py-2">
                          <a href={`/admin/kpi-targets/${t.id}`} className="text-slate-200 hover:text-blue-300 transition">{t.target_name}</a>
                        </td>
                        <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">{t.target_category}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-700 rounded-full h-1.5 hidden md:block">
                              <div className={`h-1.5 rounded-full ${t.status === "Achieved" ? "bg-emerald-500" : t.progress_percentage >= 80 ? "bg-blue-500" : t.progress_percentage >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${Math.min(100, t.progress_percentage)}%` }} />
                            </div>
                            <span className="text-slate-300">{fmt(t.progress_percentage, 0)}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400 hidden md:table-cell">
                          {t.current_value.toLocaleString()} / {t.target_value.toLocaleString()}{t.unit ? ` ${t.unit}` : ""}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            t.status === "Achieved"    ? "bg-emerald-950 text-emerald-400 border-emerald-800" :
                            t.status === "On Track"    ? "bg-blue-950 text-blue-400 border-blue-800" :
                            t.status === "At Risk"     ? "bg-amber-950 text-amber-400 border-amber-800" :
                            t.status === "Behind"      ? "bg-red-950 text-red-400 border-red-800" :
                            t.status === "Missed"      ? "bg-red-950/80 text-red-500 border-red-900" :
                            "bg-slate-800 text-slate-400 border-slate-700"
                          }`}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-600">{kpiTargets.length} active target{kpiTargets.length !== 1 ? "s" : ""}. Use Recalculate Actuals on the KPI Targets page to refresh live data.</p>
                <a href="/admin/kpi-targets" className="text-xs text-indigo-400 hover:underline">Manage Targets →</a>
              </div>
            </div>
          );
        })()}
      </Section>

      {/* Compliance footer */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/20 px-5 py-3 text-[10px] text-slate-600 space-y-1">
        <p>All metrics on this page are derived from Nexum SecureFlow internal operating data. They do not constitute financial statements, audited accounts, or investment advice.</p>
        <p>Metrics require independent verification before use in investor presentations, board reports, or regulatory filings.</p>
        <p>No money is released automatically. No external analytics tools are connected. This dashboard queries internal Supabase data only.</p>
      </div>
    </div>
  );
}
