"use client";

// ─── /admin/executive-dashboard ──────────────────────────────────────────────
// Admin-only. Executive Risk & Revenue Dashboard v1.
// 10 sections + Brain executive summary + action required + export.
// No external APIs. No auto-release. No payment gateway.

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Date filter helpers ───────────────────────────────────────────────────────

type DateRange = "today" | "7d" | "month" | "last_month" | "custom" | "all";

function getDateBounds(range: DateRange, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => d.toISOString();

  if (range === "all") return { from: null, to: null };
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: iso(start), to: iso(now) };
  }
  if (range === "7d") {
    const start = new Date(now); start.setDate(now.getDate() - 7);
    return { from: iso(start), to: iso(now) };
  }
  if (range === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(start), to: iso(now) };
  }
  if (range === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(start), to: iso(end) };
  }
  if (range === "custom") {
    return {
      from: custom.from ? `${custom.from}T00:00:00.000Z` : null,
      to:   custom.to   ? `${custom.to}T23:59:59.999Z`   : null,
    };
  }
  return { from: null, to: null };
}

function inRange(dateStr: string | null | undefined, from: string | null, to: string | null): boolean {
  if (!dateStr) return true;
  if (from && dateStr < from) return false;
  if (to   && dateStr > to)   return false;
  return true;
}

function fmt(n: number, currency?: string): string {
  const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  return currency ? `${currency} ${s}` : s;
}

// ── Row types (minimal, what we actually select) ──────────────────────────────

interface JobRow    { job_reference: string; job_value: number; currency: string; payment_status: string; job_status: string; created_at: string; total_secured_amount: number | null; risk_level: string | null; }
interface ObRow     { id: string; job_reference: string | null; amount: number; currency: string; status: string; obligation_type: string; created_at: string; }
interface HeldRow   { id: string; job_reference: string | null; amount: number; currency: string; holding_status: string; created_at: string; }
interface ReconRow  { id: string; job_reference: string | null; reconciliation_status: string; held_amount: number | null; currency: string; created_at: string; }
interface RelInstr  { id: string; job_reference: string | null; amount: number; currency: string; instruction_status: string; created_at: string; }
interface Settlement{ id: string; job_reference: string | null; settlement_amount: number | null; currency: string; settlement_status: string; created_at: string; }
interface NetStmt   { id: string; job_reference: string | null; statement_status: string; net_release_eligible: number | null; total_released: number | null; outstanding_amount: number | null; currency: string; created_at: string; }
interface ClaimRes  { id: string; job_reference: string | null; reserve_amount: number; currency: string; reserve_status: string; created_at: string; }
interface Dispute   { id: string; job_reference: string | null; status: string; severity: string; claim_amount: number | null; currency: string; created_at: string; }
interface Liability { id: string; job_reference: string | null; liability_review_status: string; claimed_amount: number | null; currency: string; created_at: string; }
interface RiskRow   { id: string; risk_category: string | null; risk_severity: string; risk_status: string; due_date: string | null; source_type: string | null; job_reference: string | null; risk_title: string; created_at: string; }
interface MitigRow  { id: string; risk_id: string; status: string; due_at: string | null; created_at: string; }
interface MemberRow { id: string; provider_company_id: string; plan_id: string | null; membership_status: string; created_at: string; expires_at: string | null; plan?: { plan_name: string; annual_fee: number | null } | null; }
interface UsageRow  { id: string; provider_company_id: string; usage_type: string; usage_count: number; quota_limit: number | null; period_start: string; }
interface OverageRow{ id: string; provider_company_id: string; total_overage_amount: number; status: string; created_at: string; }
interface FeeRow    { id: string; job_reference: string | null; fee_type: string; fee_amount: number; currency: string; fee_status: string; created_at: string; }
interface SppRow    { id: string; job_reference: string | null; advance_amount: number | null; currency: string; spp_status: string; supplier_name: string | null; created_at: string; }
interface ExposRow  { id: string; supplier_id: string | null; recommended_max_advance_amount: number | null; current_active_exposure: number | null; currency: string; }
interface CapRow    { id: string; readiness_status: string; readiness_score: number; max_recommended_amount: number | null; currency: string; assessment_type: string; created_at: string; }
interface OfferRow  { id: string; product_type: string; offer_status: string; offer_amount: number; currency: string; created_at: string; }
interface ExportRow { id: string; job_reference: string | null; export_type: string; export_status: string; gross_amount: number; currency: string; created_at: string; }
interface ProcRow   { id: string; job_reference: string | null; procurement_status: string; order_value_amount: number | null; currency: string; advance_required_amount: number | null; discrepancy_flagged: boolean; created_at: string; }
interface MilRow    { id: string; job_reference: string | null; milestone_status: string; evidence_status: string; milestone_name: string | null; }
interface SupplRow  { id: string; supplier_name: string; supplier_status: string; }
interface CreditPkRow { id: string; pack_status: string; created_at: string; }

// ── All data shape ─────────────────────────────────────────────────────────────

interface DashData {
  jobs:        JobRow[];
  obligations: ObRow[];
  held:        HeldRow[];
  recon:       ReconRow[];
  relInstrs:   RelInstr[];
  settlements: Settlement[];
  netStmts:    NetStmt[];
  claimRes:    ClaimRes[];
  disputes:    Dispute[];
  liabilities: Liability[];
  risks:       RiskRow[];
  mitigations: MitigRow[];
  members:     MemberRow[];
  usage:       UsageRow[];
  overages:    OverageRow[];
  fees:        FeeRow[];
  spps:        SppRow[];
  exposure:    ExposRow[];
  capital:     CapRow[];
  offers:      OfferRow[];
  exports:     ExportRow[];
  procurement: ProcRow[];
  milestones:  MilRow[];
  suppliers:   SupplRow[];
  creditPacks: CreditPkRow[];
}

// ── Stat card component ───────────────────────────────────────────────────────

function StatCard({ label, value, color = "text-white", sub, link }: {
  label: string; value: string | number; color?: string; sub?: string; link?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3 h-full">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1 font-medium">{label}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
  if (link) return <a href={link} className="hover:opacity-80 transition">{inner}</a>;
  return inner;
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, link, linkLabel }: { title: string; children: React.ReactNode; link?: string; linkLabel?: string; }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
        {link && <a href={link} className="text-[10px] text-blue-400 hover:text-blue-300">{linkLabel ?? "View →"}</a>}
      </div>
      {children}
    </section>
  );
}

// ── Brain summary ─────────────────────────────────────────────────────────────

function buildBrainSummary(d: DashData): string[] {
  const lines: string[] = [];

  // Money flow issues
  const mismatch  = d.recon.filter(r => ["Mismatch","Failed","Unmatched"].includes(r.reconciliation_status)).length;
  const overdueOb = d.obligations.filter(o => o.status === "Overdue").length;
  const disputed  = d.disputes.filter(d2 => ["Open","Under Review","Escalated"].includes(d2.status)).length;
  if (mismatch  > 0) lines.push(`⚠ ${mismatch} payment reconciliation mismatch${mismatch !== 1 ? "es" : ""} require admin resolution.`);
  if (overdueOb > 0) lines.push(`⚠ ${overdueOb} payment obligation${overdueOb !== 1 ? "s" : ""} are overdue.`);
  if (disputed  > 0) lines.push(`⚠ ${disputed} open dispute${disputed !== 1 ? "s" : ""} — some may be blocking final release.`);

  // Risks
  const critRisk = d.risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const overdueRisk = d.risks.filter(r => r.due_date && new Date(r.due_date) < new Date() && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const overriddenControl = d.risks.filter(r => r.source_type === "internal_control_override").length;
  if (critRisk > 0) lines.push(`🔴 ${critRisk} Critical operational risk${critRisk !== 1 ? "s" : ""} require immediate management attention.`);
  if (overdueRisk > 0) lines.push(`⏰ ${overdueRisk} overdue risk${overdueRisk !== 1 ? "s" : ""} past their due date.`);
  if (overriddenControl > 0) lines.push(`↷ ${overriddenControl} risk${overriddenControl !== 1 ? "s" : ""} generated from internal control overrides.`);

  // Revenue opportunities
  const pendingFees = d.fees.filter(f => f.fee_status === "Pending Approval").length;
  const capEligible = d.capital.filter(c => ["Eligible","Conditionally Eligible","Approved"].includes(c.readiness_status)).length;
  const activeOffers = d.offers.filter(o => o.offer_status === "Interested").length;
  if (pendingFees > 0) lines.push(`💰 ${pendingFees} service fee${pendingFees !== 1 ? "s" : ""} pending approval — review to confirm revenue.`);
  if (capEligible > 0) lines.push(`🏦 ${capEligible} capital-eligible company${capEligible !== 1 ? "ies" : ""} identified — potential financing pipeline.`);
  if (activeOffers > 0) lines.push(`📋 ${activeOffers} financing offer${activeOffers !== 1 ? "s" : ""} with partner interest — follow up to convert.`);

  // Supplier issues
  const watchlistSuppliers = d.suppliers.filter(s => ["Watchlist","Blocked"].includes(s.supplier_status)).length;
  const missingEvidence = d.milestones.filter(m => ["Evidence Requested","Pending"].includes(m.milestone_status) && ["Not Uploaded","Rejected"].includes(m.evidence_status)).length;
  const discrepantPO = d.procurement.filter(p => p.discrepancy_flagged).length;
  if (watchlistSuppliers > 0) lines.push(`🚩 ${watchlistSuppliers} supplier${watchlistSuppliers !== 1 ? "s" : ""} on watchlist or blocked — check open exposure.`);
  if (missingEvidence > 0) lines.push(`📄 ${missingEvidence} supplier milestone${missingEvidence !== 1 ? "s" : ""} missing required evidence.`);
  if (discrepantPO > 0) lines.push(`⚡ ${discrepantPO} procurement order${discrepantPO !== 1 ? "s" : ""} flagged with discrepancies.`);

  // Capital pipeline
  const creditPending = d.creditPacks.filter(c => ["Generated","Pending Review"].includes(c.pack_status)).length;
  if (creditPending > 0) lines.push(`📦 ${creditPending} credit pack${creditPending !== 1 ? "s" : ""} pending review or partner access.`);

  // Recommended actions
  const releaseEligible = d.netStmts.filter(s => s.statement_status === "Approved").length;
  if (releaseEligible > 0) lines.push(`✅ ${releaseEligible} net settlement${releaseEligible !== 1 ? "s" : ""} approved — ready to instruct finance release.`);

  return lines;
}

// ── Top action items ──────────────────────────────────────────────────────────

interface ActionItem { priority: "Critical" | "High" | "Medium"; label: string; count: number; link?: string; }

function buildActionItems(d: DashData): ActionItem[] {
  const items: ActionItem[] = [];

  const critRisks = d.risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  if (critRisks > 0) items.push({ priority: "Critical", label: "Critical risk unresolved", count: critRisks, link: "/admin/risk-register" });

  const relPending = d.netStmts.filter(s => s.statement_status === "Pending Approval").length;
  if (relPending > 0) items.push({ priority: "Critical", label: "Release pending approval", count: relPending });

  const reconMismatch = d.recon.filter(r => ["Mismatch","Failed","Unmatched"].includes(r.reconciliation_status)).length;
  if (reconMismatch > 0) items.push({ priority: "Critical", label: "Reconciliation mismatch", count: reconMismatch });

  const disputeBlock = d.disputes.filter(d2 => ["Open","Under Review","Escalated"].includes(d2.status) && d2.severity === "Critical").length;
  if (disputeBlock > 0) items.push({ priority: "Critical", label: "Critical dispute blocking release", count: disputeBlock });

  const missingEvidence = d.milestones.filter(m => ["Not Uploaded","Rejected"].includes(m.evidence_status)).length;
  if (missingEvidence > 0) items.push({ priority: "High", label: "Supplier milestone missing evidence", count: missingEvidence });

  const watchSupplier = d.suppliers.filter(s => ["Watchlist","Blocked"].includes(s.supplier_status)).length;
  if (watchSupplier > 0) items.push({ priority: "High", label: "Watchlist supplier with open exposure", count: watchSupplier, link: "/admin/suppliers" });

  const overdueOb = d.obligations.filter(o => o.status === "Overdue").length;
  if (overdueOb > 0) items.push({ priority: "High", label: "High-value payment not secured / overdue", count: overdueOb });

  const pendingFees = d.fees.filter(f => f.fee_status === "Pending Approval").length;
  if (pendingFees > 0) items.push({ priority: "Medium", label: "Overage billing / fee pending approval", count: pendingFees });

  const capEligible = d.capital.filter(c => c.readiness_status === "Eligible" && !d.offers.some(o => o.offer_status === "Interested")).length;
  if (capEligible > 0) items.push({ priority: "Medium", label: "Capital opportunity requiring review", count: capEligible, link: "/admin/credit-packs" });

  const discrepantPO = d.procurement.filter(p => p.discrepancy_flagged).length;
  if (discrepantPO > 0) items.push({ priority: "Medium", label: "Procurement discrepancy unresolved", count: discrepantPO, link: "/admin/procurement-orders" });

  return items.sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2 };
    return order[a.priority] - order[b.priority];
  }).slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ExecutiveDashboardPage() {
  const [data,         setData]         = useState<DashData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [dateRange,    setDateRange]    = useState<DateRange>("all");
  const [customFrom,   setCustomFrom]   = useState("");
  const [customTo,     setCustomTo]     = useState("");
  const [brainOpen,    setBrainOpen]    = useState(true);
  const [copyMsg,      setCopyMsg]      = useState("");

  // ── Auth check ──────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (p?.role === "admin") setIsAdmin(true);
    })();
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        jobsR, obR, heldR, reconR, relR, settlR, netR,
        claimR, dispR, liabR, riskR, mitigR,
        membR, usageR, overageR, feeR, sppR, exposR,
        capR, offerR, exportR, procR, milR, supplR, cpR,
      ] = await Promise.all([
        supabase.from("secured_jobs").select("job_reference, job_value, currency, payment_status, job_status, created_at, total_secured_amount, risk_level").order("created_at", { ascending: false }).limit(1000),
        supabase.from("payment_obligations").select("id, job_reference, amount, currency, status, obligation_type, created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("held_payments").select("id, job_reference, amount, currency, holding_status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("holding_account_reconciliations").select("id, job_reference, reconciliation_status, held_amount, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("release_instructions").select("id, job_reference, amount, currency, instruction_status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("release_settlements").select("id, job_reference, settlement_amount, currency, settlement_status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("net_settlement_statements").select("id, job_reference, statement_status, net_release_eligible, total_released, outstanding_amount, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("claim_reserves").select("id, job_reference, reserve_amount, currency, reserve_status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("dispute_cases").select("id, job_reference, status, severity, claim_amount, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("liability_reviews").select("id, job_reference, liability_review_status, claimed_amount, currency, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("operational_risk_register").select("id, risk_category, risk_severity, risk_status, due_date, source_type, job_reference, risk_title, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("risk_mitigation_actions").select("id, risk_id, status, due_at, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("memberships").select("id, provider_company_id, plan_id, membership_status, created_at, expires_at, plan:membership_plans(plan_name, annual_fee)").order("created_at", { ascending: false }).limit(500),
        supabase.from("usage_metering_records").select("id, provider_company_id, usage_type, usage_count, quota_limit, period_start").order("period_start", { ascending: false }).limit(500),
        supabase.from("overage_billing_summaries").select("id, provider_company_id, total_overage_amount, status, created_at").order("created_at", { ascending: false }).limit(300),
        supabase.from("nexum_service_fees").select("id, job_reference, fee_type, fee_amount, currency, fee_status, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("supplier_payment_protections").select("id, job_reference, advance_amount, currency, spp_status, supplier_name, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("supplier_exposure_limits").select("id, supplier_id, recommended_max_advance_amount, current_active_exposure, currency").limit(200),
        supabase.from("capital_readiness_assessments").select("id, readiness_status, readiness_score, max_recommended_amount, currency, assessment_type, created_at").order("created_at", { ascending: false }).limit(200),
        supabase.from("simulated_financing_offers").select("id, product_type, offer_status, offer_amount, currency, created_at").order("created_at", { ascending: false }).limit(200),
        supabase.from("accounting_exports").select("id, job_reference, export_type, export_status, gross_amount, currency, created_at").order("created_at", { ascending: false }).limit(300),
        supabase.from("procurement_orders").select("id, job_reference, procurement_status, order_value_amount, currency, advance_required_amount, discrepancy_flagged, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("supplier_release_milestones").select("id, job_reference, milestone_status, evidence_status, milestone_name").order("created_at", { ascending: false }).limit(500),
        supabase.from("supplier_counterparties").select("id, supplier_name, supplier_status").limit(500),
        supabase.from("credit_packs").select("id, pack_status, created_at").order("created_at", { ascending: false }).limit(200),
      ]);

      setData({
        jobs:        (jobsR.data  ?? []) as JobRow[],
        obligations: (obR.data    ?? []) as ObRow[],
        held:        (heldR.data  ?? []) as HeldRow[],
        recon:       (reconR.data ?? []) as ReconRow[],
        relInstrs:   (relR.data   ?? []) as RelInstr[],
        settlements: (settlR.data ?? []) as Settlement[],
        netStmts:    (netR.data   ?? []) as NetStmt[],
        claimRes:    (claimR.data ?? []) as ClaimRes[],
        disputes:    (dispR.data  ?? []) as Dispute[],
        liabilities: (liabR.data  ?? []) as Liability[],
        risks:       (riskR.data  ?? []) as RiskRow[],
        mitigations: (mitigR.data ?? []) as MitigRow[],
        members:     (membR.data  ?? []) as unknown as MemberRow[],
        usage:       (usageR.data ?? []) as UsageRow[],
        overages:    (overageR.data ?? []) as OverageRow[],
        fees:        (feeR.data   ?? []) as FeeRow[],
        spps:        (sppR.data   ?? []) as SppRow[],
        exposure:    (exposR.data ?? []) as ExposRow[],
        capital:     (capR.data   ?? []) as CapRow[],
        offers:      (offerR.data ?? []) as OfferRow[],
        exports:     (exportR.data ?? []) as ExportRow[],
        procurement: (procR.data  ?? []) as ProcRow[],
        milestones:  (milR.data   ?? []) as MilRow[],
        suppliers:   (supplR.data ?? []) as SupplRow[],
        creditPacks: (cpR.data    ?? []) as CreditPkRow[],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin, fetchAll]);

  // ── Date-filtered derived data ───────────────────────────────────────────────

  const { from: dFrom, to: dTo } = useMemo(
    () => getDateBounds(dateRange, { from: customFrom, to: customTo }),
    [dateRange, customFrom, customTo],
  );

  const d = useMemo((): DashData | null => {
    if (!data) return null;
    if (!dFrom && !dTo) return data;
    const f = <T extends { created_at: string }>(arr: T[]): T[] => arr.filter(r => inRange(r.created_at, dFrom, dTo));
    return {
      ...data,
      jobs:        f(data.jobs),
      obligations: f(data.obligations),
      held:        f(data.held),
      recon:       f(data.recon),
      relInstrs:   f(data.relInstrs),
      settlements: f(data.settlements),
      netStmts:    f(data.netStmts),
      claimRes:    f(data.claimRes),
      disputes:    f(data.disputes),
      liabilities: f(data.liabilities),
      risks:       f(data.risks),
      fees:        f(data.fees),
      spps:        f(data.spps),
      exports:     f(data.exports),
      procurement: f(data.procurement),
      creditPacks: f(data.creditPacks),
    };
  }, [data, dFrom, dTo]);

  // ── Export helpers ───────────────────────────────────────────────────────────

  const handleCopySummary = () => {
    if (!d) return;
    const lines = buildBrainSummary(d);
    const text = `Nexum Executive Summary — ${new Date().toLocaleDateString()}\n\n${lines.join("\n")}`;
    navigator.clipboard.writeText(text).then(() => { setCopyMsg("Copied!"); setTimeout(() => setCopyMsg(""), 2000); });
  };

  const handleExportJSON = () => {
    if (!d) return;
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `nexum-executive-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Not admin ───────────────────────────────────────────────────────────────

  if (!isAdmin && !loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-slate-500 text-sm">Access restricted to admin only.</div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading executive dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!d) return null;

  // ── Derived metrics ─────────────────────────────────────────────────────────

  // Section 1 — Executive Snapshot
  const activeJobs          = d.jobs.filter(j => !["Completed","Cancelled","Closed"].includes(j.job_status));
  const totalJobValue       = d.jobs.reduce((s, j) => s + (j.job_value ?? 0), 0);
  const totalSecuredAmt     = d.jobs.reduce((s, j) => s + (j.total_secured_amount ?? 0), 0);
  const totalHeld           = d.held.filter(h => h.holding_status === "Held").reduce((s, h) => s + (h.amount ?? 0), 0);
  const releaseEligibleAmt  = d.netStmts.filter(s => ["Approved","Generated"].includes(s.statement_status)).reduce((s, n) => s + (n.net_release_eligible ?? 0), 0);
  const relPendingApproval  = d.netStmts.filter(s => s.statement_status === "Pending Approval").length;
  const totalReleased       = d.settlements.filter(s => ["Completed","Reconciled"].includes(s.settlement_status)).reduce((s, r) => s + (r.settlement_amount ?? 0), 0);
  const openDisputes        = d.disputes.filter(dsp => ["Open","Under Review","Escalated"].includes(dsp.status)).length;
  const openCritRisks       = d.risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const feesCalc            = d.fees.reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const memberRevenue       = d.members.filter(m => m.membership_status === "Active").reduce((s, m) => s + ((m.plan as MemberRow["plan"])?.annual_fee ?? 0), 0);
  const capOpportunities    = d.capital.filter(c => ["Eligible","Conditionally Eligible"].includes(c.readiness_status)).length;

  // Section 2 — Money Flow
  const moneyFlow = [
    { label: "Awaiting Payment",       value: d.obligations.filter(o => o.status === "Pending").length,                       color: "text-slate-400" },
    { label: "Proof Uploaded",         value: d.obligations.filter(o => o.status === "Proof Uploaded").length,                color: "text-amber-400" },
    { label: "Reconciliation Pending", value: d.recon.filter(r => r.reconciliation_status === "Pending").length,              color: "text-amber-400" },
    { label: "Payment Secured",        value: d.held.filter(h => h.holding_status === "Held").length,                         color: "text-emerald-400" },
    { label: "Release Eligible",       value: d.netStmts.filter(s => ["Generated","Approved"].includes(s.statement_status)).length, color: "text-blue-400" },
    { label: "Release Approved",       value: d.netStmts.filter(s => s.statement_status === "Approved").length,               color: "text-blue-400" },
    { label: "Release Instructed",     value: d.relInstrs.filter(r => r.instruction_status === "Instructed").length,          color: "text-indigo-400" },
    { label: "Released",               value: d.settlements.filter(s => s.settlement_status === "Completed").length,          color: "text-emerald-400" },
    { label: "Settlement Reconciled",  value: d.settlements.filter(s => s.settlement_status === "Reconciled").length,         color: "text-emerald-400" },
    { label: "Disputed / Reserved",    value: openDisputes + d.claimRes.filter(c => c.reserve_status === "Active").length,    color: "text-red-400" },
  ];

  // Section 3 — Risk Overview
  const openRisks     = d.risks.filter(r => !["Resolved","Closed","Accepted"].includes(r.risk_status));
  const riskByCategory = openRisks.reduce<Record<string, number>>((acc, r) => {
    const cat = r.risk_category ?? "Other";
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});
  const riskByCatArr   = Object.entries(riskByCategory).sort(([,a],[,b]) => b - a).slice(0, 8);
  const overdueRisks   = openRisks.filter(r => r.due_date && new Date(r.due_date) < new Date()).length;
  const overdueActions = d.mitigations.filter(m => m.due_at && new Date(m.due_at) < new Date() && !["Completed","Dismissed"].includes(m.status)).length;
  const suppExposRisk  = d.risks.filter(r => r.risk_category === "Supplier Risk" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const paymentRisk    = d.risks.filter(r => ["Payment Risk","Bank Reconciliation Risk"].includes(r.risk_category ?? "") && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const complianceRisk = d.risks.filter(r => r.risk_category === "Compliance Wording Risk" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;

  // Section 4 — Revenue Overview
  const startOfMonth     = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const feesThisMonth    = d.fees.filter(f => f.created_at >= startOfMonth).reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const feesApproved     = d.fees.filter(f => f.fee_status === "Approved").reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const feesWaived       = d.fees.filter(f => f.fee_status === "Waived").reduce((s, f) => s + (f.fee_amount ?? 0), 0);
  const overageTotal     = d.overages.filter(o => o.status === "Pending").reduce((s, o) => s + (o.total_overage_amount ?? 0), 0);
  const exportsPending   = d.exports.filter(e => e.export_status === "Pending").length;
  const jobsMissingFee   = d.jobs.filter(j => !d.fees.some(f => f.job_reference === j.job_reference)).length;

  // Section 5 — Supplier / Procurement Exposure
  const totalExposure    = d.exposure.reduce((s, e) => s + (e.current_active_exposure ?? 0), 0);
  const activeSPPs       = d.spps.filter(s => ["Active","Advance Paid"].includes(s.spp_status)).length;
  const sppAdvanceTotal  = d.spps.filter(s => ["Active","Advance Paid"].includes(s.spp_status)).reduce((s, p) => s + (p.advance_amount ?? 0), 0);
  const milPendingEvid   = d.milestones.filter(m => ["Not Uploaded","Rejected"].includes(m.evidence_status)).length;
  const milReleaseElig   = d.milestones.filter(m => m.milestone_status === "Release Eligible").length;
  const watchSupplCount  = d.suppliers.filter(s => ["Watchlist","Blocked"].includes(s.supplier_status)).length;
  const procBlocked      = d.procurement.filter(p => ["Blocked","On Hold","Disputed"].includes(p.procurement_status)).length;
  const discrepantPO     = d.procurement.filter(p => p.discrepancy_flagged).length;

  // Section 6 — Release Pipeline
  const relEligNotApproved  = d.netStmts.filter(s => s.statement_status === "Generated").length;
  const relPendingChecker   = d.netStmts.filter(s => s.statement_status === "Pending Approval").length;
  const relInstructed       = d.relInstrs.filter(r => r.instruction_status === "Instructed").length;
  const settlementsActive   = d.settlements.filter(s => ["Processing","Pending"].includes(s.settlement_status)).length;
  const settlementsUnrecon  = d.settlements.filter(s => ["Mismatch","Failed"].includes(s.settlement_status)).length;
  const relBlockedDispute   = d.disputes.filter(dsp => ["Open","Under Review","Escalated"].includes(dsp.status)).length;
  const relBlockedClaim     = d.claimRes.filter(c => c.reserve_status === "Active").length;
  const relBlockedLiab      = d.liabilities.filter(l => ["Open","Under Review","Pending"].includes(l.liability_review_status)).length;

  // Section 7 — Membership & Usage
  const activeMembers   = d.members.filter(m => m.membership_status === "Active").length;
  const trialMembers    = d.members.filter(m => m.membership_status === "Trial").length;
  const nearQuota       = d.usage.filter(u => u.quota_limit && u.usage_count >= u.quota_limit * 0.9 && u.usage_count < u.quota_limit).length;
  const overQuota       = d.usage.filter(u => u.quota_limit && u.usage_count > u.quota_limit).length;
  const expiringSoon    = d.members.filter(m => {
    if (!m.expires_at || m.membership_status !== "Active") return false;
    return new Date(m.expires_at) < new Date(Date.now() + 30 * 86400000);
  }).length;
  const overageEstimate = d.overages.reduce((s, o) => s + (o.total_overage_amount ?? 0), 0);

  // Section 8 — Capital Pipeline
  const capEligible    = d.capital.filter(c => c.readiness_status === "Eligible").length;
  const capPriority    = d.capital.filter(c => c.readiness_score >= 70).length;
  const offersActive   = d.offers.filter(o => ["Simulated","Interested"].includes(o.offer_status)).length;
  const offersInterest = d.offers.filter(o => o.offer_status === "Interested").length;
  const cpGenerated    = d.creditPacks.filter(c => c.pack_status === "Generated").length;
  const cpPending      = d.creditPacks.filter(c => ["Generated","Pending Review"].includes(c.pack_status)).length;

  // Brain summary
  const brainLines = buildBrainSummary(d);
  const actionItems = buildActionItems(d);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200 p-6">

      {/* Nav */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <a href="/admin/command-center"   className="hover:text-slate-300 transition">← Command Center</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/risk-register"    className="hover:text-slate-300 transition">Risk Register</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/jobs"             className="hover:text-slate-300 transition">Jobs</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/credit-packs"     className="hover:text-slate-300 transition">Credit Packs</a>
        <span className="text-slate-700">·</span>
        <a href="/admin/suppliers"        className="hover:text-slate-300 transition">Suppliers</a>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Executive Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Risk · Revenue · Operations · Capital — Admin only</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Export buttons */}
          <button onClick={handleCopySummary} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition">
            {copyMsg || "📋 Copy Summary"}
          </button>
          <button onClick={handleExportJSON} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition">
            ⬇ Export JSON
          </button>
          <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition">
            🖨 Print
          </button>
          <button onClick={fetchAll} className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 text-xs transition">
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="mb-6 rounded-xl border border-slate-700/40 bg-slate-900/40 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex gap-1.5 flex-wrap">
          {([["all","All Time"],["today","Today"],["7d","Last 7d"],["month","This Month"],["last_month","Last Month"],["custom","Custom"]] as [DateRange, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setDateRange(k)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition border ${dateRange === k ? "bg-blue-500/20 border-blue-500/40 text-blue-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {dateRange === "custom" && (
          <div className="flex gap-2 items-center">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none" />
            <span className="text-slate-600 text-xs">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none" />
          </div>
        )}
        <span className="text-[10px] text-slate-600 ml-auto">
          {d.jobs.length} job{d.jobs.length !== 1 ? "s" : ""} in range
        </span>
      </div>

      {/* ── Brain Executive Summary ─────────────────────────────────────────── */}
      <div className="mb-8 rounded-xl border border-indigo-500/25 bg-indigo-500/5">
        <button
          onClick={() => setBrainOpen(o => !o)}
          className="w-full px-5 py-3 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <span className="text-sm font-semibold text-indigo-300">Nexum Brain — Executive Summary</span>
            <span className="text-[10px] text-indigo-500/60">Rule-based · No external AI called</span>
          </div>
          <span className="text-slate-600 text-xs">{brainOpen ? "▲" : "▼"}</span>
        </button>
        {brainOpen && (
          <div className="border-t border-indigo-500/15 px-5 py-4">
            {brainLines.length === 0 ? (
              <p className="text-sm text-slate-500">No significant signals detected in the selected time range. All systems appear normal.</p>
            ) : (
              <ul className="space-y-2">
                {brainLines.map((line, i) => (
                  <li key={i} className="text-sm text-slate-300 leading-relaxed">{line}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[10px] text-slate-600">
              This summary is generated from internal system signals only. It does not constitute legal, compliance, or fraud conclusions. All signals require human review.
            </p>
          </div>
        )}
      </div>

      {/* ── Section 1: Executive Snapshot ──────────────────────────────────── */}
      <Section title="1 · Executive Snapshot">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Active Jobs"           value={activeJobs.length}         link="/admin/jobs" />
          <StatCard label="Total Job Value"       value={`MYR ${fmt(totalJobValue)}`} color="text-blue-400" />
          <StatCard label="Total Secured"         value={`MYR ${fmt(totalSecuredAmt)}`} color="text-emerald-400" />
          <StatCard label="Payment Held"          value={`MYR ${fmt(totalHeld)}`}   color="text-amber-400" />
          <StatCard label="Release Eligible"      value={`MYR ${fmt(releaseEligibleAmt)}`} color="text-blue-400" />
          <StatCard label="Pending Release Approval" value={relPendingApproval}     color={relPendingApproval > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Total Released"        value={`MYR ${fmt(totalReleased)}`} color="text-emerald-400" />
          <StatCard label="Open Disputes"         value={openDisputes}              color={openDisputes > 0 ? "text-red-400" : "text-slate-400"} link="/admin/disputes" />
          <StatCard label="Critical Risks Open"   value={openCritRisks}             color={openCritRisks > 0 ? "text-red-400" : "text-slate-400"} link="/admin/risk-register" />
          <StatCard label="Service Fees Calculated" value={`MYR ${fmt(feesCalc)}`} color="text-indigo-400" />
          <StatCard label="Membership Revenue"    value={`MYR ${fmt(memberRevenue)}`} color="text-purple-400" />
          <StatCard label="Capital Opportunities" value={capOpportunities}           color="text-cyan-400" link="/admin/credit-packs" />
        </div>
      </Section>

      {/* ── Section 2: Money Flow ───────────────────────────────────────────── */}
      <Section title="2 · Money Flow Overview">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {moneyFlow.map(m => (
            <div key={m.label} className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3 text-center">
              <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
              <div className="text-[10px] text-slate-500 mt-1 leading-tight">{m.label}</div>
            </div>
          ))}
        </div>
        {d.recon.filter(r => ["Mismatch","Failed","Unmatched"].includes(r.reconciliation_status)).length > 0 && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-xs text-red-300">
            🚨 {d.recon.filter(r => ["Mismatch","Failed","Unmatched"].includes(r.reconciliation_status)).length} reconciliation mismatch{d.recon.filter(r => ["Mismatch","Failed","Unmatched"].includes(r.reconciliation_status)).length !== 1 ? "es" : ""} require admin resolution.
          </div>
        )}
      </Section>

      {/* ── Section 3: Risk Overview ────────────────────────────────────────── */}
      <Section title="3 · Risk Overview" link="/admin/risk-register" linkLabel="Full Register →">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <StatCard label="Open Risks"             value={openRisks.length}        color="text-amber-400" />
          <StatCard label="Critical Risks"         value={openCritRisks}           color={openCritRisks > 0 ? "text-red-400" : "text-slate-400"} />
          <StatCard label="Overdue Risks"          value={overdueRisks}            color={overdueRisks > 0 ? "text-orange-400" : "text-slate-400"} />
          <StatCard label="Overdue Mitigation Actions" value={overdueActions}      color={overdueActions > 0 ? "text-orange-400" : "text-slate-400"} />
          <StatCard label="Supplier Risk Exposure" value={suppExposRisk}           color={suppExposRisk > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Compliance Wording Risk" value={complianceRisk}         color={complianceRisk > 0 ? "text-amber-400" : "text-slate-400"} />
        </div>
        {riskByCatArr.length > 0 && (
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3">
            <p className="text-[10px] font-medium text-slate-500 mb-2">Open Risks by Category</p>
            <div className="space-y-1.5">
              {riskByCatArr.map(([cat, count]) => {
                const pct = Math.round((count / Math.max(openRisks.length, 1)) * 100);
                return (
                  <div key={cat} className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-300 w-44 truncate">{cat}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full bg-amber-500/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-amber-400 font-medium shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-600">
          Operational risk entries are internal signals only. They do not constitute legal or compliance conclusions. No auto-blocking.
        </p>
      </Section>

      {/* ── Section 4: Revenue Overview ─────────────────────────────────────── */}
      <Section title="4 · Revenue Overview">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Membership Annual Value"    value={`MYR ${fmt(memberRevenue)}`}   color="text-purple-400" />
          <StatCard label="Service Fees This Month"    value={`MYR ${fmt(feesThisMonth)}`}   color="text-indigo-400" />
          <StatCard label="Approved Service Fees"      value={`MYR ${fmt(feesApproved)}`}    color="text-emerald-400" />
          <StatCard label="Fees Pending Approval"      value={d.fees.filter(f => f.fee_status === "Pending Approval").length} color={d.fees.filter(f => f.fee_status === "Pending Approval").length > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Waived Fees"                value={`MYR ${fmt(feesWaived)}`}      color="text-slate-400" />
          <StatCard label="Overage Billing Pending"    value={`MYR ${fmt(overageTotal)}`}    color={overageTotal > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Accounting Exports Pending" value={exportsPending}                  color={exportsPending > 0 ? "text-amber-400" : "text-slate-400"} link="/admin/accounting-exports" />
          <StatCard label="Jobs Missing Fee Calc"      value={jobsMissingFee}                  color={jobsMissingFee > 0 ? "text-orange-400" : "text-slate-400"} />
        </div>
      </Section>

      {/* ── Section 5: Supplier / Procurement Exposure ──────────────────────── */}
      <Section title="5 · Supplier & Procurement Exposure" link="/admin/suppliers" linkLabel="Suppliers →">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Active Advance Exposure"     value={`MYR ${fmt(totalExposure)}`}    color={totalExposure > 100000 ? "text-orange-400" : "text-emerald-400"} />
          <StatCard label="Active SPP Flows"            value={activeSPPs}                       color="text-blue-400" />
          <StatCard label="SPP Advance Total"           value={`MYR ${fmt(sppAdvanceTotal)}`}   color="text-amber-400" />
          <StatCard label="Milestones Pending Evidence" value={milPendingEvid}                    color={milPendingEvid > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Milestones Release Eligible" value={milReleaseElig}                   color="text-emerald-400" />
          <StatCard label="Watchlist Suppliers"         value={watchSupplCount}                  color={watchSupplCount > 0 ? "text-red-400" : "text-slate-400"} link="/admin/suppliers" />
          <StatCard label="Procurement Gates Blocked"   value={procBlocked}                     color={procBlocked > 0 ? "text-red-400" : "text-slate-400"} link="/admin/procurement-orders" />
          <StatCard label="Procurement Discrepancies"   value={discrepantPO}                    color={discrepantPO > 0 ? "text-amber-400" : "text-slate-400"} link="/admin/procurement-orders" />
        </div>
      </Section>

      {/* ── Section 6: Release Pipeline ─────────────────────────────────────── */}
      <Section title="6 · Release Pipeline">
        <div className="space-y-2">
          {[
            { label: "Release Eligible — Not Yet Approved",   value: relEligNotApproved, color: "bg-blue-500/70" },
            { label: "Pending Checker / Dual Approval",       value: relPendingChecker,  color: "bg-amber-500/70" },
            { label: "Release Instructed to Finance",         value: relInstructed,      color: "bg-indigo-500/70" },
            { label: "Settlements Processing",                value: settlementsActive,  color: "bg-slate-500/70" },
            { label: "Settlements Not Reconciled",            value: settlementsUnrecon, color: "bg-red-500/70" },
            { label: "Blocked by Open Dispute",               value: relBlockedDispute,  color: "bg-red-500/70" },
            { label: "Blocked by Claim Reserve",              value: relBlockedClaim,    color: "bg-orange-500/70" },
            { label: "Blocked by Liability Review",           value: relBlockedLiab,     color: "bg-orange-500/70" },
          ].map(row => {
            const maxVal = Math.max(relEligNotApproved, relPendingChecker, relInstructed, settlementsActive, settlementsUnrecon, relBlockedDispute, relBlockedClaim, relBlockedLiab, 1);
            const pct = Math.round((row.value / maxVal) * 100);
            return (
              <div key={row.label} className="flex items-center gap-3 text-xs">
                <span className="text-slate-400 w-52 shrink-0 truncate">{row.label}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div className={`h-2 rounded-full ${row.color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-white font-medium w-8 text-right shrink-0">{row.value}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-slate-600">Release pipeline reflects internal workflow state. No money is released automatically.</p>
      </Section>

      {/* ── Section 7: Membership & Usage ───────────────────────────────────── */}
      <Section title="7 · Membership & Usage" link="/admin/memberships" linkLabel="Memberships →">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Active Members"          value={activeMembers}                     color="text-emerald-400" />
          <StatCard label="Trial Members"           value={trialMembers}                      color="text-amber-400" />
          <StatCard label="Near Quota (≥90%)"       value={nearQuota}                         color={nearQuota > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Over Quota"              value={overQuota}                          color={overQuota > 0 ? "text-red-400" : "text-slate-400"} />
          <StatCard label="Upgrade Candidates"      value={nearQuota + overQuota}             color="text-blue-400" />
          <StatCard label="Renewals Due ≤30d"       value={expiringSoon}                      color={expiringSoon > 0 ? "text-orange-400" : "text-slate-400"} />
          <StatCard label="Overage Billing Est."    value={`MYR ${fmt(overageEstimate)}`}    color={overageEstimate > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Active Overages Pending" value={d.overages.filter(o => o.status === "Pending").length} color="text-amber-400" />
        </div>
      </Section>

      {/* ── Section 8: Capital Pipeline ─────────────────────────────────────── */}
      <Section title="8 · Capital Pipeline" link="/admin/credit-packs" linkLabel="Credit Packs →">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Capital-Eligible Companies" value={capEligible}         color="text-cyan-400" />
          <StatCard label="Priority (Score ≥70)"       value={capPriority}         color="text-cyan-400" />
          <StatCard label="Simulated Offers Active"    value={offersActive}         color="text-blue-400" />
          <StatCard label="Partner Interest"           value={offersInterest}       color={offersInterest > 0 ? "text-emerald-400" : "text-slate-400"} />
          <StatCard label="Credit Packs Generated"     value={cpGenerated}          color="text-indigo-400" />
          <StatCard label="Credit Packs Pending Review" value={cpPending}           color={cpPending > 0 ? "text-amber-400" : "text-slate-400"} />
          <StatCard label="Offers Rejected / Expired"  value={d.offers.filter(o => ["Rejected","Expired"].includes(o.offer_status)).length} color="text-slate-400" />
          <StatCard label="Total Capital Sought"       value={`MYR ${fmt(d.capital.reduce((s, c) => s + (c.max_recommended_amount ?? 0), 0))}`} color="text-cyan-400" />
        </div>
      </Section>

      {/* ── Section 9: Action Required ──────────────────────────────────────── */}
      <Section title="9 · Action Required — Top Management Actions">
        {actionItems.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-xs text-emerald-400">
            ✓ No high-priority management actions identified in the selected time range.
          </div>
        ) : (
          <div className="space-y-2">
            {actionItems.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  item.priority === "Critical" ? "border-red-500/30 bg-red-500/5"    :
                  item.priority === "High"     ? "border-orange-500/30 bg-orange-500/5" :
                  "border-amber-500/20 bg-amber-500/5"
                }`}
              >
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                  item.priority === "Critical" ? "bg-red-500/15 text-red-400 border-red-500/30"        :
                  item.priority === "High"     ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
                  "bg-amber-500/15 text-amber-400 border-amber-500/30"
                }`}>{item.priority}</span>
                <span className="text-sm text-slate-200 flex-1">{item.label}</span>
                <span className={`text-lg font-bold ${
                  item.priority === "Critical" ? "text-red-400" :
                  item.priority === "High"     ? "text-orange-400" :
                  "text-amber-400"
                }`}>{item.count}</span>
                {item.link && (
                  <a href={item.link} className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0">View →</a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Compliance footer ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/20 px-5 py-3 text-[10px] text-slate-600 space-y-1">
        <p>This dashboard presents internal operational data only. It does not constitute legal, compliance, or fraud conclusions.</p>
        <p>No money is released automatically. All workflow actions require explicit human approval through the Nexum SecureFlow workflow.</p>
        <p>Data reflects the current state of the Nexum platform as of the last refresh. Use the ↺ Refresh button to reload.</p>
      </div>
    </div>
  );
}
