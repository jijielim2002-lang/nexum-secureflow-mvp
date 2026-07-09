"use client";
import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { calculateCompanyIntelligence } from "@/lib/companyIntelligence";
import { RISK_BADGE, FINANCING_BADGE } from "@/lib/companyIntelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthBucket {
  month:       string;
  job_count:   number;
  total_value: number;
  secured:     number;
  disputed:    number;
}

interface CounterpartyEntry { name: string; count: number; total_value: number }

interface IntelligenceReport {
  company: {
    id: string; name: string; company_type: string; email: string | null;
    phone: string | null; address: string | null; registration_no: string | null;
    is_active: boolean; created_at: string;
  };
  summary: {
    total_jobs: number; completed_jobs: number; active_jobs: number;
    cancelled_jobs: number; disputed_jobs: number;
    total_job_value: number; currency: string;
    monthly_job_value: number; monthly_job_count: number; avg_job_value: number;
    total_logistics_fee: null; total_cargo_value: null;
    total_secured_amount: number; total_payment_verified: number;
    total_released: number; outstanding_amount: number; dispute_amount: number;
    avg_payment_time_days: number | null; avg_delivery_time_days: number | null;
  };
  monthly: MonthBucket[];
  trade: {
    top_routes: CounterpartyEntry[];
    service_types: CounterpartyEntry[];
    top_origins: null; top_destinations: null; top_hs_codes: null;
    top_commodities: null; avg_cargo_value: null; avg_logistics_cost: null;
    logistics_pct_cargo: null; total_weight: null; total_volume: null;
  };
  counterparties: {
    as_provider: {
      job_count: number; top_customers: CounterpartyEntry[];
      completed_jobs: number; pod_uploaded_count: number; dispute_count: number;
      top_routes: CounterpartyEntry[];
    };
    as_customer: {
      job_count: number; top_providers: CounterpartyEntry[];
      confirmed_jobs: number; auto_confirmed_jobs: number; dispute_count: number;
    };
    buy_from_countries: null; sell_to_countries: null;
  };
  delivery: {
    pod_uploaded_count: number; customer_confirmed_count: number;
    auto_confirmed_count: number; dispute_raised_count: number;
    completed_count: number; delivery_confirmed_count: number;
    avg_days_payment_to_delivery: null; avg_days_pod_to_confirmation: null;
    avg_days_acceptance_to_secured: null;
  };
  payment_behaviour: { available: boolean; total_obligations?: number; verified_count?: number; pending_count?: number; overdue_count?: number; disputed_count?: number; proof_uploaded_count?: number; avg_proof_upload_hours: null; avg_verification_hours: null; exact_match_rate: null; amount_mismatch_count: null; currency_mismatch_count: null; late_payment_count: null; third_party_count: null; duplicate_reference_count: null };
  settlements: { available: boolean; settlement_count?: number; total_released?: number; reconciled_count?: number; mismatch_count?: number; failed_count?: number };
  cost_breakdown: { total_job_value: number; total_released: number; logistics_fee: null; cargo_value: null; duty_tax: null; insurance: null; additional_charges: null; platform_fee: null; claim_reserve: null; net_settlement: number | null };
  financeability: { available: boolean; avg_score: number | null; top_grade: string | null; scores_count: number; opportunities_count: number; total_opportunity: number; working_capital_count: number; total_wc_need: number; recommended_product: string | null; readiness: string | null; recommended_terms: string | null };
  exceptions: { total: number; active: number; critical: number; high: number; by_type: { type: string; count: number }[] };
  intel: Record<string, unknown> | null;
  provider_benchmark: Record<string, unknown> | null;
  customer_benchmark: Record<string, unknown> | null;
  risk_flags: string[];
  unavailable_fields: string[];
  generated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMYR(v: number | null | undefined): string {
  if (v == null) return "—";
  return `MYR ${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(v)}`;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-MY").format(v);
}

function fmtPct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("en-MY", { month: "short", year: "2-digit" });
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function IntelligenceReportPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params);
  return (
    <AuthGuard requiredRole="admin">
      <ReportInner companyId={companyId} />
    </AuthGuard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ReportInner({ companyId }: { companyId: string }) {
  const { profile } = useAuth();
  const [report,       setReport]       = useState<IntelligenceReport | null>(null);
  const [loadState,    setLoadState]    = useState<"loading" | "error" | "not_found" | "done">("loading");
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [recalcState,  setRecalcState]  = useState<"idle" | "loading" | "done" | "error">("idle");

  const load = useCallback(async () => {
    if (!companyId || companyId === "undefined") {
      setLoadState("not_found");
      return;
    }
    setLoadState("loading");
    setLoadError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    try {
      const res = await fetch(`/api/admin/company-intelligence-report/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) {
        setLoadState("not_found");
        return;
      }
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as IntelligenceReport;
      setReport(data);
      setLoadState("done");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unknown error");
      setLoadState("error");
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function handleRecalc() {
    if (!report) return;
    setRecalcState("loading");
    const { error } = await calculateCompanyIntelligence(
      companyId,
      report.company.name,
      report.company.company_type,
      profile?.id,
      profile?.full_name ?? "Nexum Admin",
    );
    if (error) {
      setRecalcState("error");
      setTimeout(() => setRecalcState("idle"), 3000);
    } else {
      setRecalcState("done");
      setTimeout(() => { setRecalcState("idle"); load(); }, 1000);
    }
  }

  function exportCSV() {
    if (!report) return;
    const { company: co, summary: s, monthly, trade, counterparties: cp, delivery: del, risk_flags } = report;
    const rows: string[][] = [
      ["Nexum SecureFlow — Company Intelligence Report v1"],
      [`Company: ${co.name} | Type: ${co.company_type} | Generated: ${new Date(report.generated_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT`],
      ["DISCLAIMER: System-derived analytics from self-reported trade data. Indicative scores only. Decision-support only — not a verified financial statement."],
      [],
      ["SUMMARY"],
      ["Metric", "Value"],
      ["Total Jobs", String(s.total_jobs)],
      ["Completed Jobs", String(s.completed_jobs)],
      ["Active Jobs", String(s.active_jobs)],
      ["Disputed Jobs", String(s.disputed_jobs)],
      ["Total Transaction Value (MYR)", String(s.total_job_value)],
      ["Monthly Transaction Value (MYR)", String(s.monthly_job_value)],
      ["Monthly Job Count", String(s.monthly_job_count)],
      ["Average Job Value (MYR)", String(s.avg_job_value)],
      ["Total Secured Amount (MYR)", String(s.total_secured_amount)],
      ["Total Payment Verified Count", String(s.total_payment_verified)],
      ["Total Released (MYR)", String(s.total_released)],
      ["Outstanding Amount (MYR)", String(s.outstanding_amount)],
      ["Dispute Amount (MYR)", String(s.dispute_amount)],
      ["Logistics Fee", "Not captured separately"],
      ["Cargo Value", "Not captured separately"],
      [],
      ["MONTHLY ANALYTICS"],
      ["Month", "Jobs", "Total Value (MYR)", "Secured (MYR)", "Disputes"],
      ...monthly.map((m) => [fmtMonth(m.month), String(m.job_count), String(m.total_value), String(m.secured), String(m.disputed)]),
      [],
      ["TOP ROUTES"],
      ["Route", "Job Count", "Total Value (MYR)"],
      ...trade.top_routes.map((r) => [r.name, String(r.count), String(r.total_value)]),
      [],
      ["SERVICE TYPES"],
      ["Service Type", "Job Count", "Total Value (MYR)"],
      ...trade.service_types.map((t) => [t.name, String(t.count), String(t.total_value)]),
      [],
      ["TOP CUSTOMERS (as Provider)"],
      ["Customer", "Job Count", "Total Value (MYR)"],
      ...cp.as_provider.top_customers.map((c) => [c.name, String(c.count), String(c.total_value)]),
      [],
      ["TOP PROVIDERS (as Customer)"],
      ["Provider", "Job Count", "Total Value (MYR)"],
      ...cp.as_customer.top_providers.map((p) => [p.name, String(p.count), String(p.total_value)]),
      [],
      ["DELIVERY PERFORMANCE"],
      ["Metric", "Value"],
      ["POD Uploaded", String(del.pod_uploaded_count)],
      ["Customer Confirmed", String(del.customer_confirmed_count)],
      ["Auto-Confirmed", String(del.auto_confirmed_count)],
      ["Disputes Raised", String(del.dispute_raised_count)],
      ["Delivery Confirmed", String(del.delivery_confirmed_count)],
      [],
      ["RISK FLAGS"],
      ...risk_flags.map((f) => [f]),
      [],
      ["UNAVAILABLE FIELDS (not yet captured in data model)"],
      ...report.unavailable_fields.map((f) => [f]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `nexum-intel-${co.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <Shell companyId={companyId}>
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-500">Loading intelligence report…</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (loadState === "not_found") {
    return (
      <Shell companyId={companyId}>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="mb-4 text-4xl">🔍</span>
          <p className="text-lg font-semibold text-slate-200">Company ID not found.</p>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Please open this report from the Companies page.
          </p>
          <Link
            href="/admin/companies"
            className="mt-6 rounded-lg border border-purple-500/30 bg-purple-500/10 px-5 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            ← Back to Companies
          </Link>
        </div>
      </Shell>
    );
  }

  if (loadState === "error") {
    return (
      <Shell companyId={companyId}>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-5">
          <p className="mb-1 text-sm font-semibold text-red-300">Failed to load report</p>
          <p className="font-mono text-xs text-red-400">{loadError}</p>
          <button onClick={load} className="mt-3 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  if (!report) return null;

  const { company: co, summary: s, monthly, trade, counterparties: cp,
          delivery: del, payment_behaviour: pb, settlements: sett,
          cost_breakdown: costs, financeability: fin, exceptions: exc,
          intel, provider_benchmark: provB, customer_benchmark: custB,
          risk_flags } = report;

  const isProvider = cp.as_provider.job_count > 0;
  const isCustomer = cp.as_customer.job_count > 0;

  const riskLevel  = (intel?.risk_level as string) ?? null;
  const finReady   = (intel?.financing_readiness as string) ?? null;
  const trustScore = (intel?.overall_trust_score as number) ?? null;

  return (
    <Shell companyId={companyId}>
      {/* ── Company Header ── */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-50">{co.name}</h1>
            {riskLevel && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${RISK_BADGE[riskLevel as keyof typeof RISK_BADGE] ?? "border-slate-700 text-slate-400"}`}>
                {riskLevel} Risk
              </span>
            )}
            {finReady && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs ${FINANCING_BADGE[finReady as keyof typeof FINANCING_BADGE] ?? "border-slate-700 text-slate-400"}`}>
                {finReady}
              </span>
            )}
            {!co.is_active && <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-500">Inactive</span>}
          </div>
          <p className="text-sm text-slate-400">
            {co.company_type}
            {co.registration_no && <> · Reg: {co.registration_no}</>}
            {" · "}Member since {co.created_at.slice(0, 10)}
          </p>
          <p className="mt-1 text-[10px] text-slate-700">
            System-derived analytics · Self-reported trade data · Indicative scores only · Decision-support only
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCSV}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={handleRecalc}
            disabled={recalcState === "loading"}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              recalcState === "done"  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
              recalcState === "error" ? "border-red-500/30 bg-red-500/10 text-red-400" :
              "border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
            }`}
          >
            {recalcState === "loading" ? "Recalculating…" : recalcState === "done" ? "Score Updated ✓" : "↺ Recalculate Score"}
          </button>
          <Link
            href={`/admin/companies/${co.id}`}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← Company Profile
          </Link>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <SectionTitle color="blue">Summary</SectionTitle>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SumCard label="Total Jobs"           value={fmtNum(s.total_jobs)}            sub={`${s.completed_jobs} completed`} />
        <SumCard label="Total Value"          value={fmtMYR(s.total_job_value)}       sub={`${s.currency} · all time`} />
        <SumCard label="Monthly Value"        value={fmtMYR(s.monthly_job_value)}     sub={`${s.monthly_job_count} jobs last 30d`} />
        <SumCard label="Average Job Value"    value={fmtMYR(s.avg_job_value)}         sub="per transaction" />
        <SumCard label="Total Secured"        value={fmtMYR(s.total_secured_amount)}  sub={`${s.total_payment_verified} verified`} color="emerald" />
        <SumCard label="Total Released"       value={fmtMYR(s.total_released)}        sub="payout recorded" color="emerald" />
        <SumCard label="Outstanding"          value={fmtMYR(s.outstanding_amount)}    sub="estimate" color={s.outstanding_amount > 0 ? "amber" : "slate"} />
        <SumCard label="Dispute Amount"       value={fmtMYR(s.dispute_amount)}        sub={`${s.disputed_jobs} jobs`} color={s.disputed_jobs > 0 ? "red" : "slate"} />
        <SumCard label="Active Jobs"          value={fmtNum(s.active_jobs)}           sub="in progress" />
        <SumCard label="Avg Payment Time"     value={s.avg_payment_time_days != null ? `${s.avg_payment_time_days}d` : "—"} sub="days (indicative)" />
        <SumCard label="Avg Delivery Time"    value={s.avg_delivery_time_days != null ? `${s.avg_delivery_time_days}d` : "—"} sub="days (indicative)" />
        <SumCard label="Trust Score"          value={trustScore != null ? String(trustScore) : "—"} sub="overall indicative" color={trustScore != null ? (trustScore >= 80 ? "emerald" : trustScore >= 60 ? "amber" : "red") : "slate"} />
        <SumCard label="Risk Level"           value={riskLevel ?? "—"}               sub="system-derived" color={riskLevel === "Low" ? "emerald" : riskLevel === "Medium" ? "amber" : riskLevel ? "red" : "slate"} />
        <SumCard label="Financeability"       value={finReady ?? "—"}                sub={fin.avg_score != null ? `avg score ${fin.avg_score}` : "indicative"} color={finReady === "Priority" ? "purple" : finReady === "Eligible" ? "emerald" : finReady === "Monitor" ? "amber" : "slate"} />
        <SumCard label="Logistics Fee"        value="Not captured"                   sub="no separate column yet" color="slate" dim />
      </div>

      {/* Not-available note */}
      <div className="mb-8 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Fields not yet captured in this data model</p>
        <p className="text-xs text-slate-600 leading-relaxed">
          Cargo value · Logistics fee (separate) · Duty/tax · Insurance · HS codes · Commodity categories ·
          Weight/volume · Origin/destination country · Exact payment timing · Amount/currency mismatch counts ·
          Platform fee per job. These will be available after future data capture migrations.
        </p>
      </div>

      {/* ── Monthly Analytics ── */}
      <SectionTitle color="blue">Monthly Analytics</SectionTitle>
      {monthly.length === 0 ? (
        <NotAvailable reason="No job history found." />
      ) : (
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-500" /> Total Value</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Secured</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" /> Disputes</span>
          </div>
          <div className="space-y-2">
            {(() => {
              const maxVal = Math.max(...monthly.map((m) => m.total_value), 1);
              return monthly.map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-[10px] text-slate-500">{fmtMonth(m.month)}</span>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex h-3 w-full overflow-hidden rounded-sm bg-slate-800">
                      <div className="h-full bg-blue-500/70 transition-all" style={{ width: `${(m.total_value / maxVal) * 100}%` }} />
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-sm bg-slate-800">
                      <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${(m.secured / maxVal) * 100}%` }} />
                    </div>
                  </div>
                  <div className="w-28 shrink-0 text-right">
                    <p className="text-xs tabular-nums text-slate-300">{fmtMYR(m.total_value)}</p>
                    <p className="text-[10px] tabular-nums text-slate-600">{m.job_count} job{m.job_count !== 1 ? "s" : ""}{m.disputed > 0 ? ` · ${m.disputed}⚠` : ""}</p>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Trade Profile ── */}
      <SectionTitle color="cyan">Trade Profile</SectionTitle>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="mb-3 text-xs font-semibold text-slate-400">Top Routes</h3>
          {trade.top_routes.length === 0
            ? <p className="text-xs text-slate-600">No route data.</p>
            : trade.top_routes.map((r, i) => (
              <div key={i} className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300 truncate">{r.name || "Unknown"}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{r.count} job{r.count !== 1 ? "s" : ""} · {fmtMYR(r.total_value)}</span>
              </div>
            ))}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="mb-3 text-xs font-semibold text-slate-400">Service Types</h3>
          {trade.service_types.length === 0
            ? <p className="text-xs text-slate-600">No service type data.</p>
            : trade.service_types.map((t, i) => (
              <div key={i} className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300">{t.name || "Unknown"}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">{t.count} job{t.count !== 1 ? "s" : ""} · {fmtMYR(t.total_value)}</span>
              </div>
            ))}
        </div>
        <UnavailableCard label="Top Origin Countries" reason="Origin country not captured — only free-text route field available." />
        <UnavailableCard label="Commodity / HS Codes" reason="HS codes and commodity categories not captured in current data model." />
        <UnavailableCard label="Weight / Volume" reason="Cargo weight and volume not captured." />
        <UnavailableCard label="Avg Logistics Cost vs Cargo Value" reason="Cargo value not captured separately from job value." />
      </div>

      {/* ── Counterparty Profile ── */}
      <SectionTitle color="purple">Counterparty Profile</SectionTitle>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {isProvider && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="mb-1 text-xs font-semibold text-purple-400">As Service Provider / Freight Forwarder</h3>
            <p className="mb-3 text-[10px] text-slate-600">{cp.as_provider.job_count} job{cp.as_provider.job_count !== 1 ? "s" : ""} in this role</p>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Top Customers</p>
            {cp.as_provider.top_customers.length === 0
              ? <p className="text-xs text-slate-600">No customer data.</p>
              : cp.as_provider.top_customers.map((c, i) => (
                <div key={i} className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{c.count} job{c.count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label="Completed"  value={cp.as_provider.completed_jobs}      color="emerald" />
              <MiniStat label="POD Upload" value={cp.as_provider.pod_uploaded_count}  color="blue" />
              <MiniStat label="Disputes"   value={cp.as_provider.dispute_count}       color={cp.as_provider.dispute_count > 0 ? "red" : "slate"} />
            </div>
          </div>
        )}
        {isCustomer && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="mb-1 text-xs font-semibold text-emerald-400">As Customer / Importer / Buyer</h3>
            <p className="mb-3 text-[10px] text-slate-600">{cp.as_customer.job_count} job{cp.as_customer.job_count !== 1 ? "s" : ""} in this role</p>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Top Providers Used</p>
            {cp.as_customer.top_providers.length === 0
              ? <p className="text-xs text-slate-600">No provider data.</p>
              : cp.as_customer.top_providers.map((p, i) => (
                <div key={i} className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{p.count} job{p.count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label="Confirmed"    value={cp.as_customer.confirmed_jobs}      color="emerald" />
              <MiniStat label="Auto-Confirm" value={cp.as_customer.auto_confirmed_jobs} color="blue" />
              <MiniStat label="Disputes"     value={cp.as_customer.dispute_count}       color={cp.as_customer.dispute_count > 0 ? "red" : "slate"} />
            </div>
          </div>
        )}
        <UnavailableCard label="Buy-From Countries" reason="Country-level counterparty data not yet captured." />
        <UnavailableCard label="Sell-To Countries" reason="Country-level counterparty data not yet captured." />
      </div>

      {/* ── Payment Behaviour ── */}
      <SectionTitle color="amber">Payment Behaviour</SectionTitle>
      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        {pb.available ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MiniStat label="Total Obligations"   value={pb.total_obligations ?? 0} color="slate" />
            <MiniStat label="Verified"            value={pb.verified_count ?? 0}    color="emerald" />
            <MiniStat label="Proof Uploaded"      value={pb.proof_uploaded_count ?? 0} color="blue" />
            <MiniStat label="Pending"             value={pb.pending_count ?? 0}     color="amber" />
            <MiniStat label="Overdue"             value={pb.overdue_count ?? 0}     color={pb.overdue_count ?? 0 > 0 ? "red" : "slate"} />
            <MiniStat label="Disputed"            value={pb.disputed_count ?? 0}    color={pb.disputed_count ?? 0 > 0 ? "red" : "slate"} />
          </div>
        ) : (
          <p className="text-xs text-slate-600">Payment obligations table not available or no obligations found for this company.</p>
        )}
        <div className="mt-4 border-t border-slate-800 pt-4 grid gap-2 sm:grid-cols-2">
          <UnavailableInline label="Avg Proof Upload Time" reason="Timestamp not systematically captured" />
          <UnavailableInline label="Avg Verification Time" reason="Timestamp not captured per obligation" />
          <UnavailableInline label="Exact Match Rate"      reason="Amount matching not yet tracked" />
          <UnavailableInline label="Amount Mismatch Count" reason="Not tracked" />
          <UnavailableInline label="Late Payment Count"    reason="Due date comparison not yet computed" />
          <UnavailableInline label="Third-Party Payments"  reason="Not tracked" />
        </div>
      </div>

      {/* ── Delivery Performance ── */}
      <SectionTitle color="cyan">Delivery Performance</SectionTitle>
      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Completed"        value={del.completed_count}          color="emerald" />
          <MiniStat label="POD Uploaded"     value={del.pod_uploaded_count}       color="blue" />
          <MiniStat label="Delivery Conf."   value={del.delivery_confirmed_count} color="emerald" />
          <MiniStat label="Cust. Confirmed"  value={del.customer_confirmed_count} color="emerald" />
          <MiniStat label="Auto-Confirmed"   value={del.auto_confirmed_count}     color="slate" />
          <MiniStat label="Disputes Raised"  value={del.dispute_raised_count}     color={del.dispute_raised_count > 0 ? "red" : "slate"} />
        </div>
        {del.pod_uploaded_count > 0 && del.customer_confirmed_count + del.auto_confirmed_count > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Confirmation rate (manual + auto): {fmtPct(del.customer_confirmed_count + del.auto_confirmed_count, del.pod_uploaded_count)}
            {" · "}Dispute rate: {fmtPct(del.dispute_raised_count, del.pod_uploaded_count)}
          </p>
        )}
        <div className="mt-4 border-t border-slate-800 pt-4 grid gap-2 sm:grid-cols-2">
          <UnavailableInline label="Avg Days: Payment to Delivery" reason="Systematic delivery date tracking not yet computed" />
          <UnavailableInline label="Avg Days: POD to Confirmation" reason="Systematic timing not yet computed" />
          <UnavailableInline label="Avg Days: Acceptance to Payment Secured" reason="Not yet computed" />
        </div>
      </div>

      {/* ── Cost Breakdown ── */}
      <SectionTitle color="amber">Cost Breakdown</SectionTitle>
      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <CostRow label="Total Transaction Value" value={fmtMYR(costs.total_job_value)} available />
          <CostRow label="Total Released (Payout)" value={fmtMYR(costs.total_released)} available />
          <CostRow label="Net Settlement"          value={costs.net_settlement != null ? fmtMYR(costs.net_settlement) : "—"} available={costs.net_settlement != null} />
          <CostRow label="Logistics Fee"           value="Not captured separately" available={false} />
          <CostRow label="Cargo Value"             value="Not captured separately" available={false} />
          <CostRow label="Duty / Tax"              value="Not captured" available={false} />
          <CostRow label="Insurance"               value="Not captured" available={false} />
          <CostRow label="Additional Charges"      value="Not captured" available={false} />
          <CostRow label="Platform Fee"            value="Not captured per job" available={false} />
          <CostRow label="Claim Reserve"           value="Not calculated" available={false} />
        </div>
      </div>

      {/* ── Release Settlements ── */}
      {sett.available && (
        <>
          <SectionTitle color="emerald">Release Settlements</SectionTitle>
          <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <MiniStat label="Total Settlements"  value={sett.settlement_count ?? 0}  color="slate" />
              <MiniStat label="Reconciled"         value={sett.reconciled_count ?? 0}  color="emerald" />
              <MiniStat label="Amount Mismatch"    value={sett.mismatch_count ?? 0}    color={sett.mismatch_count ?? 0 > 0 ? "amber" : "slate"} />
              <MiniStat label="Failed"             value={sett.failed_count ?? 0}      color={sett.failed_count ?? 0 > 0 ? "red" : "slate"} />
            </div>
            <p className="mt-3 text-xs text-slate-500">Total released: {fmtMYR(sett.total_released ?? 0)}</p>
          </div>
        </>
      )}

      {/* ── Financeability ── */}
      <SectionTitle color="purple">Financeability (Indicative)</SectionTitle>
      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Financing Readiness</p>
            <p className="text-base font-bold text-slate-200">{fin.readiness ?? "Not scored"}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Avg Financeability Score</p>
            <p className="text-base font-bold text-slate-200">{fin.avg_score != null ? fin.avg_score : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Top Grade</p>
            <p className="text-base font-bold text-slate-200">{fin.top_grade ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Opportunities</p>
            <p className="text-base font-bold text-slate-200">{fin.opportunities_count} · {fmtMYR(fin.total_opportunity)}</p>
          </div>
        </div>
        {fin.recommended_terms && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Recommended Terms (Indicative)</p>
            <p className="text-xs text-slate-400">{fin.recommended_terms}</p>
            <p className="mt-1 text-[10px] text-slate-700">This is an indicative score only. Not credit approved. Not a guaranteed facility.</p>
          </div>
        )}
        {fin.working_capital_count > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Working capital needs identified: {fin.working_capital_count} · Estimated: {fmtMYR(fin.total_wc_need)}
          </p>
        )}
      </div>

      {/* ── Exceptions ── */}
      {exc.total > 0 && (
        <>
          <SectionTitle color="red">Active Exceptions</SectionTitle>
          <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="grid gap-4 sm:grid-cols-4 mb-4">
              <MiniStat label="Total Exceptions" value={exc.total}    color="slate" />
              <MiniStat label="Active"           value={exc.active}   color="amber" />
              <MiniStat label="Critical"         value={exc.critical} color={exc.critical > 0 ? "red" : "slate"} />
              <MiniStat label="High Severity"    value={exc.high}     color={exc.high > 0 ? "amber" : "slate"} />
            </div>
            {exc.by_type.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">By Type</p>
                {exc.by_type.map((t, i) => (
                  <div key={i} className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-slate-400">{t.type}</span>
                    <span className="text-xs tabular-nums text-slate-500">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Benchmarks ── */}
      {(provB || custB) && (
        <>
          <SectionTitle color="blue">Performance Benchmarks</SectionTitle>
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            {provB && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="mb-3 text-xs font-semibold text-blue-400">Provider Benchmark</h3>
                <BenchRow label="Overall Score"   value={`${(provB as Record<string,unknown>).overall_provider_score ?? "—"} / 100`} />
                <BenchRow label="Grade"           value={String((provB as Record<string,unknown>).reliability_grade ?? "—")} />
                <BenchRow label="On-Time Rate"    value={`${(provB as Record<string,unknown>).on_time_delivery_rate ?? "—"}%`} />
                <BenchRow label="POD Rate"        value={`${(provB as Record<string,unknown>).pod_uploaded_rate ?? "—"}%`} />
                <BenchRow label="Dispute Rate"    value={`${(provB as Record<string,unknown>).dispute_rate ?? "—"}%`} />
                <BenchRow label="Doc Quality"     value={`${(provB as Record<string,unknown>).document_quality_score ?? "—"}`} />
              </div>
            )}
            {custB && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="mb-3 text-xs font-semibold text-emerald-400">Customer Benchmark</h3>
                <BenchRow label="Overall Score"   value={`${(custB as Record<string,unknown>).overall_customer_score ?? "—"} / 100`} />
                <BenchRow label="Grade"           value={String((custB as Record<string,unknown>).customer_grade ?? "—")} />
                <BenchRow label="Payment Score"   value={`${(custB as Record<string,unknown>).payment_behavior_score ?? "—"}`} />
                <BenchRow label="Auto-Confirm %"  value={`${(custB as Record<string,unknown>).auto_confirmation_rate ?? "—"}%`} />
                <BenchRow label="Dispute Rate"    value={`${(custB as Record<string,unknown>).dispute_rate ?? "—"}%`} />
                <BenchRow label="Overdue Rate"    value={`${(custB as Record<string,unknown>).overdue_payment_rate ?? "—"}%`} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Risk & Scoring ── */}
      <SectionTitle color="red">Risk Assessment</SectionTitle>
      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Risk Level</p>
            <p className={`text-base font-bold ${riskLevel === "Low" ? "text-emerald-400" : riskLevel === "Medium" ? "text-amber-400" : riskLevel ? "text-red-400" : "text-slate-500"}`}>
              {riskLevel ?? "Not assessed"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Payment Behavior Score</p>
            <p className="text-base font-bold text-slate-200">{(intel?.payment_behavior_score as number | null) ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Operational Score</p>
            <p className="text-base font-bold text-slate-200">{(intel?.operational_reliability_score as number | null) ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-600 mb-0.5 uppercase tracking-wider">Doc Completeness</p>
            <p className="text-base font-bold text-slate-200">{(intel?.document_completeness_score as number | null) ?? "—"}</p>
          </div>
        </div>

        {risk_flags.length > 0 ? (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-500">Risk Flags</p>
            <div className="space-y-1.5">
              {risk_flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                  <span className="mt-0.5 text-red-500">!</span>
                  <p className="text-xs text-red-400">{flag}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs text-emerald-400">No automated risk flags detected based on available data.</p>
          </div>
        )}

        <p className="mt-4 text-[10px] text-slate-700">
          Risk assessment is system-derived from self-reported trade data. Not a verified financial statement.
          Indicative scores only — for decision support, not credit approval.
        </p>
      </div>

      {/* ── Nexum Brain Context ── */}
      <SectionTitle color="blue">Intelligence Q&amp;A</SectionTitle>
      <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <QA
          q="How much transaction did this company do this month?"
          a={`${fmtMYR(s.monthly_job_value)} across ${s.monthly_job_count} job${s.monthly_job_count !== 1 ? "s" : ""} in the last 30 days.`}
        />
        <QA
          q="Who does this company buy from?"
          a={isCustomer && cp.as_customer.top_providers.length > 0
            ? `Top providers: ${cp.as_customer.top_providers.slice(0, 3).map((p) => p.name).join(", ")}.`
            : "No customer-role jobs found, or no provider data captured."}
        />
        <QA
          q="Who does this company sell to?"
          a={isProvider && cp.as_provider.top_customers.length > 0
            ? `Top customers: ${cp.as_provider.top_customers.slice(0, 3).map((c) => c.name).join(", ")}.`
            : "No provider-role jobs found, or no customer data captured."}
        />
        <QA
          q="Which routes are most active?"
          a={trade.top_routes.length > 0
            ? `Top routes: ${trade.top_routes.slice(0, 3).map((r) => `${r.name} (${r.count} jobs)`).join("; ")}.`
            : "No route data found."}
        />
        <QA
          q="What is their average logistics cost?"
          a={`Logistics cost is not captured separately from job value in the current data model. Average job value is ${fmtMYR(s.avg_job_value)}. Logistics fee tracking will require a data model migration.`}
        />
        <QA
          q="What is their payment behaviour?"
          a={intel
            ? `Payment behavior score: ${(intel.payment_behavior_score as number | null) ?? "not scored"}. ${pb.available ? `${pb.verified_count ?? 0} of ${pb.total_obligations ?? 0} payment obligations verified. ${pb.overdue_count ?? 0} overdue.` : "Payment obligation details not available."}`
            : "Intelligence profile not calculated yet. Click Recalculate Score."}
        />
        <QA
          q="Is this company financeable?"
          a={fin.readiness
            ? `Financing readiness: ${fin.readiness}. ${fin.recommended_terms ?? ""} (Indicative score — not credit approved.)`
            : "Financeability not yet assessed. Calculate company intelligence first."}
        />
        <QA
          q="What are the risk flags?"
          a={risk_flags.length > 0
            ? risk_flags.join("; ")
            : "No automated risk flags detected based on available data. Manual review may still be appropriate."}
        />
      </div>

      {/* ── Generated at ── */}
      <p className="mb-10 text-center text-xs text-slate-700">
        Generated {new Date(report.generated_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT ·
        System-derived analytics from self-reported trade data · Indicative scores only ·
        Decision-support only — not a verified financial statement or credit approval
      </p>
    </Shell>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

function Shell({ companyId, children }: { companyId: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-slate-100 transition-colors">
              <span className="text-blue-400">&#9632;</span>Nexum
            </Link>
            <span className="text-slate-700">/</span>
            <Link href="/admin/companies" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Companies</Link>
            <span className="text-slate-700">/</span>
            <Link href={`/admin/companies/${companyId}`} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Profile</Link>
            <span className="text-slate-700">/</span>
            <span className="text-sm text-slate-200">Intelligence Report v1</span>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  const dot: Record<string, string> = {
    blue: "bg-blue-500", cyan: "bg-cyan-500", purple: "bg-purple-500",
    amber: "bg-amber-500", emerald: "bg-emerald-500", red: "bg-red-500",
  };
  const text: Record<string, string> = {
    blue: "text-blue-400", cyan: "text-cyan-400", purple: "text-purple-400",
    amber: "text-amber-400", emerald: "text-emerald-400", red: "text-red-400",
  };
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot[color] ?? "bg-slate-500"}`} />
      <h2 className={`text-sm font-semibold ${text[color] ?? "text-slate-400"}`}>{children}</h2>
    </div>
  );
}

function SumCard({ label, value, sub, color = "slate", dim }: { label: string; value: string; sub: string; color?: string; dim?: boolean }) {
  const vals: Record<string, string> = {
    emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400",
    blue: "text-blue-400", purple: "text-purple-400", cyan: "text-cyan-400",
    slate: "text-slate-200",
  };
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 ${dim ? "opacity-40" : ""}`}>
      <p className="text-[10px] text-slate-600 mb-0.5">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${vals[color] ?? "text-slate-200"}`}>{value}</p>
      <p className="text-[10px] text-slate-700 mt-0.5">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  const vals: Record<string, string> = {
    emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400",
    blue: "text-blue-400", purple: "text-purple-400", slate: "text-slate-300",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5">
      <p className="text-[10px] text-slate-600 mb-0.5">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${vals[color] ?? "text-slate-300"}`}>{value}</p>
    </div>
  );
}

function CostRow({ label, value, available }: { label: string; value: string; available: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs tabular-nums ${available ? "text-slate-200" : "text-slate-700 italic"}`}>{value}</span>
    </div>
  );
}

function BenchRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-slate-300 tabular-nums">{value}</span>
    </div>
  );
}

function NotAvailable({ reason }: { reason: string }) {
  return (
    <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-6 text-center">
      <p className="text-xs text-slate-600">{reason}</p>
    </div>
  );
}

function UnavailableCard({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 px-5 py-4 opacity-50">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-[11px] text-slate-700">{reason}</p>
    </div>
  );
}

function UnavailableInline({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex items-center justify-between gap-2 opacity-50">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-[11px] text-slate-700 italic">{reason}</span>
    </div>
  );
}

function QA({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-slate-800 pb-4 last:border-0 last:pb-0">
      <p className="text-xs font-semibold text-slate-300 mb-1">{q}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{a}</p>
    </div>
  );
}
