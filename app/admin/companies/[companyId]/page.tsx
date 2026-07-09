"use client";
import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { calculateCompanyIntelligence } from "@/lib/companyIntelligence";
import { CapitalReadinessCard } from "@/components/CapitalReadinessCard";
import { FinancingOfferCard } from "@/components/FinancingOfferCard";
import { ProviderBenchmarkCard } from "@/components/ProviderBenchmarkCard";
import { CustomerBenchmarkCard } from "@/components/CustomerBenchmarkCard";
import {
  type CompanyIntelligenceRow,
  RISK_BADGE,
  FINANCING_BADGE,
  TREND_ICON,
  TREND_COLOR,
} from "@/lib/companyIntelligence";

// ─── Config ───────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 8_000;

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

// ─── Types ────────────────────────────────────────────────────────────────────
// Matches the actual companies table schema.

interface CompanyRow {
  id:              string;
  name:            string;
  type:            string | null;
  country:         string | null;
  registration_no: string | null;
  status:          string | null;
  created_at:      string;
  updated_at:      string | null;
}

interface JobRow {
  job_reference:   string;
  service_provider: string | null;
  customer:        string | null;
  job_status:      string | null;
  payment_status:  string | null;
  logistics_fee_amount:  number | null;
  total_secured_amount:  number | null;
  created_at:      string | null;
}

interface MembershipRow {
  id:                    string;
  plan:                  string;
  status:                string;
  annual_fee:            number | null;
  included_jobs:         number | null;
  used_jobs:             number;
  start_date:            string;
  end_date:              string | null;
  ai_monitoring_included: boolean;
  priority_support:      boolean;
}

interface AuditRow {
  id:          string;
  actor_role:  string;
  actor_name:  string;
  action:      string;
  description: string;
  created_at:  string;
}

interface QueryError {
  message: string;
  code?:    string;
  hint?:    string;
  details?: string;
}

type SectionStatus = "idle" | "loading" | "ok" | "error" | "timeout" | "notfound";

// ─── Page entry ───────────────────────────────────────────────────────────────

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  return (
    <AuthGuard requiredRole="admin">
      <CompanyDetail companyId={companyId} />
    </AuthGuard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function CompanyDetail({ companyId }: { companyId: string }) {
  const { profile, isBypass } = useAuth();

  // ── Stage 1 — company (must succeed before page renders data) ─────────────
  const [companyStatus, setCompanyStatus] = useState<SectionStatus>("loading");
  const [company,       setCompany]       = useState<CompanyRow | null>(null);
  const [companyError,  setCompanyError]  = useState<QueryError | null>(null);

  // ── Stage 2 — jobs (optional) ─────────────────────────────────────────────
  const [jobStatus, setJobStatus] = useState<SectionStatus>("idle");
  const [jobs,      setJobs]      = useState<JobRow[]>([]);
  const [jobError,  setJobError]  = useState<string | null>(null);

  // ── Stage 3 — intelligence profile (optional) ─────────────────────────────
  const [intelStatus, setIntelStatus] = useState<SectionStatus>("idle");
  const [intel,       setIntel]       = useState<CompanyIntelligenceRow | null>(null);
  const [intelError,  setIntelError]  = useState<string | null>(null);

  // ── Stage 3b — membership (optional) ──────────────────────────────────────
  const [memStatus,   setMemStatus]   = useState<SectionStatus>("idle");
  const [membership,  setMembership]  = useState<MembershipRow | null>(null);

  // ── Stage 3c — audit log (optional) ──────────────────────────────────────
  const [auditStatus, setAuditStatus] = useState<SectionStatus>("idle");
  const [audit,       setAudit]       = useState<AuditRow[]>([]);

  // ── Core mode: skip stages 2 & 3 ─────────────────────────────────────────
  const [coreMode, setCoreMode] = useState(false);

  // ── Recalculate ───────────────────────────────────────────────────────────
  const [recalcState, setRecalcState] = useState<"idle" | "loading" | "done" | "error">("idle");

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadCompany = useCallback(async () => {
    setCompanyStatus("loading");
    setCompanyError(null);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("companies")
          .select("id, name, type, country, registration_no, status, created_at, updated_at")
          .eq("id", companyId)
          .maybeSingle(),
        TIMEOUT_MS,
      );
      if (error) {
        console.warn("[CompanyDetail] company query error:", error.message);
        setCompanyError({
          message: error.message,
          code:    (error as unknown as { code?: string }).code,
          hint:    (error as unknown as { hint?: string }).hint,
          details: (error as unknown as { details?: string }).details,
        });
        setCompanyStatus("error");
      } else if (!data) {
        setCompanyStatus("notfound");
      } else {
        setCompany(data as unknown as CompanyRow);
        setCompanyStatus("ok");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[CompanyDetail] loadCompany:", msg);
      setCompanyError({ message: msg });
      setCompanyStatus(msg.startsWith("Timed out") ? "timeout" : "error");
    }
  }, [companyId]);

  const loadJobs = useCallback(async () => {
    if (coreMode) { setJobStatus("idle"); return; }
    setJobStatus("loading");
    setJobError(null);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("secured_jobs")
          .select(
            "job_reference, service_provider, customer, job_status, payment_status, " +
            "logistics_fee_amount, total_secured_amount, created_at",
          )
          .or(`service_provider_company_id.eq.${companyId},customer_company_id.eq.${companyId}`)
          .order("created_at", { ascending: false })
          .limit(20),
        TIMEOUT_MS,
      );
      if (error) {
        console.warn("[CompanyDetail] jobs query:", error.message);
        setJobError(error.message);
        setJobStatus("error");
      } else {
        setJobs((data ?? []) as unknown as JobRow[]);
        setJobStatus("ok");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[CompanyDetail] loadJobs:", msg);
      setJobError(msg);
      setJobStatus(msg.startsWith("Timed out") ? "timeout" : "error");
    }
  }, [companyId, coreMode]);

  const loadIntel = useCallback(async () => {
    if (coreMode) { setIntelStatus("idle"); return; }
    setIntelStatus("loading");
    setIntelError(null);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("company_intelligence_profiles")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle(),
        TIMEOUT_MS,
      );
      if (error) {
        console.warn("[CompanyDetail] intel query:", error.message);
        setIntelError(error.message);
        setIntelStatus("error");
      } else {
        setIntel(data as CompanyIntelligenceRow | null);
        setIntelStatus("ok");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[CompanyDetail] loadIntel:", msg);
      setIntelError(msg);
      setIntelStatus(msg.startsWith("Timed out") ? "timeout" : "error");
    }
  }, [companyId, coreMode]);

  const loadMembership = useCallback(async () => {
    if (coreMode) { setMemStatus("idle"); return; }
    setMemStatus("loading");
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("memberships")
          .select("id, plan, status, annual_fee, included_jobs, used_jobs, start_date, end_date, ai_monitoring_included, priority_support")
          .eq("company_id", companyId)
          .maybeSingle(),
        TIMEOUT_MS,
      );
      if (error) {
        console.warn("[CompanyDetail] membership query:", error.message);
        setMemStatus("error");
      } else {
        setMembership(data as MembershipRow | null);
        setMemStatus("ok");
      }
    } catch {
      setMemStatus("error");
    }
  }, [companyId, coreMode]);

  const loadAudit = useCallback(async () => {
    if (coreMode) { setAuditStatus("idle"); return; }
    setAuditStatus("loading");
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("audit_logs")
          .select("id, actor_role, actor_name, action, description, created_at")
          .order("created_at", { ascending: false })
          .limit(12),
        TIMEOUT_MS,
      );
      if (error) {
        console.warn("[CompanyDetail] audit query:", error.message);
        setAuditStatus("error");
      } else {
        setAudit((data ?? []) as unknown as AuditRow[]);
        setAuditStatus("ok");
      }
    } catch {
      setAuditStatus("error");
    }
  }, [coreMode]);

  // ── Stage 1 on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  // ── Stages 2 & 3 fire after company loads ─────────────────────────────────

  useEffect(() => {
    if (companyStatus !== "ok") return;
    void loadJobs();
    void loadIntel();
    void loadMembership();
    void loadAudit();
  }, [companyStatus, loadJobs, loadIntel, loadMembership, loadAudit]);

  // ── Recalculate handler ───────────────────────────────────────────────────

  async function handleRecalculate() {
    if (!company) return;
    setRecalcState("loading");
    const { error } = await calculateCompanyIntelligence(
      companyId,
      company.name,
      company.type ?? "Unknown",
      profile?.id,
      profile?.full_name ?? "Nexum Admin",
    );
    if (error) {
      setRecalcState("error");
      setTimeout(() => setRecalcState("idle"), 3000);
    } else {
      setRecalcState("done");
      setTimeout(() => {
        setRecalcState("idle");
        void loadIntel();
      }, 1500);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalJobs     = jobs.length;
  const completedJobs = jobs.filter((j) => j.job_status === "Completed").length;
  const activeJobs    = jobs.filter((j) => j.job_status === "In Progress" || j.job_status === "Ready for Execution").length;
  const disputedJobs  = jobs.filter((j) => j.job_status === "Disputed").length;

  const jobsLoading  = jobStatus  === "loading";
  const intelLoading = intelStatus === "loading";

  // ─────────────────────────────────────────────────────────────────────────
  // Render — shell ALWAYS renders; each section handles its own loading/error
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <PageShell>

      {/* Bypass RLS warning */}
      {isBypass && (
        <div role="alert" className="mb-6 rounded-xl border border-amber-600/30 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-400">
          <span className="font-semibold">Bypass mode active.</span>{" "}
          Browser queries run as anon — RLS may block data.
          Run{" "}
          <code className="rounded bg-amber-950/60 px-1 font-mono text-[10px]">021_seed_admin_profile.sql</code>
          {" "}to fix permanently.
        </div>
      )}

      {/* ── Stage 1: company header ─────────────────────────────────────────── */}

      {companyStatus === "loading" && (
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Loading company…
          </p>
        </div>
      )}

      {companyStatus === "timeout" && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-950/10 px-5 py-5">
          <p className="text-sm font-semibold text-amber-300">Company query timed out ({TIMEOUT_MS / 1000}s)</p>
          <p className="mt-1 text-xs text-amber-600">
            {isBypass ? "Bypass mode: anon query may be blocked by RLS." : "Supabase may be cold-starting."}
          </p>
          <button onClick={() => void loadCompany()} className="mt-3 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors">
            Retry
          </button>
        </div>
      )}

      {(companyStatus === "error") && companyError && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/10 px-5 py-5">
          <p className="mb-1 text-sm font-semibold text-red-300">Failed to load company</p>
          <p className="font-mono text-xs text-red-400 break-all">{companyError.message}</p>
          {companyError.code    && <p className="mt-1 font-mono text-[10px] text-red-500">code: {companyError.code}</p>}
          {companyError.hint    && <p className="mt-0.5 font-mono text-[10px] text-red-500">hint: {companyError.hint}</p>}
          {companyError.details && <p className="mt-0.5 font-mono text-[10px] text-red-500">details: {companyError.details}</p>}
          <button onClick={() => void loadCompany()} className="mt-3 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
            Retry
          </button>
        </div>
      )}

      {companyStatus === "notfound" && (
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-8 text-center">
          <p className="text-sm text-slate-500">Company not found.</p>
          {isBypass && (
            <p className="mt-2 text-xs text-amber-500">
              Bypass mode: RLS may be hiding this company. Run <code className="font-mono">021_seed_admin_profile.sql</code>.
            </p>
          )}
          <Link href="/admin/companies" className="mt-3 inline-block text-xs text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to Companies
          </Link>
        </div>
      )}

      {/* ── Company loaded ─────────────────────────────────────────────────── */}

      {company && companyStatus === "ok" && (
        <>
          {/* Title row */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-slate-50">{company.name}</h1>
                {intelLoading
                  ? <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-600 animate-pulse">scoring…</span>
                  : intel?.risk_level
                    ? <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${RISK_BADGE[intel.risk_level as keyof typeof RISK_BADGE] ?? "border-slate-700 text-slate-500"}`}>{intel.risk_level} Risk</span>
                    : null
                }
                {!intelLoading && intel?.financing_readiness && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs ${FINANCING_BADGE[intel.financing_readiness as keyof typeof FINANCING_BADGE] ?? "border-slate-700 text-slate-500"}`}>
                    {intel.financing_readiness}
                  </span>
                )}
                {company.status && company.status !== "Active" && (
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-500">{company.status}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {company.type ?? "Company"} · Member since {company.created_at.slice(0, 10)}
                {company.country ? ` · ${company.country}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              {/* Core mode toggle */}
              <button
                type="button"
                onClick={() => setCoreMode((v) => !v)}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                  coreMode
                    ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                    : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                }`}
                title="Core mode: skip jobs and intelligence queries"
              >
                ⚡ Core only
              </button>

              <Link
                href={`/admin/companies/${companyId}/intelligence-report`}
                className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                Intelligence Report →
              </Link>

              <button
                type="button"
                onClick={handleRecalculate}
                disabled={recalcState === "loading"}
                className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                  recalcState === "loading" ? "border-slate-700 text-slate-600 cursor-wait" :
                  recalcState === "done"    ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-400" :
                  recalcState === "error"   ? "border-red-600/30 bg-red-600/10 text-red-400" :
                  "border-blue-600/40 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25"
                }`}
              >
                {recalcState === "loading" ? "Calculating…" :
                 recalcState === "done"    ? "✓ Updated" :
                 recalcState === "error"   ? "Error — Retry" :
                 "↺ Recalculate Intelligence"}
              </button>
            </div>
          </div>

          {/* Sub-navigation */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SubNavLink href={`/admin/companies/${companyId}/intelligence-report`} icon="📊" label="Intelligence Report" sub="Scores · Risk · Financeability" color="purple" />
            <SubNavLink href={`/admin/companies/${companyId}/cashflow`}             icon="💰" label="Cash Flow"           sub="Inflows · Outflows · Held"   color="cyan" />
            <SubNavLink href={`/admin/companies/${companyId}/working-capital`}      icon="🏦" label="Working Capital"     sub="Capital needs · Gaps"        color="amber" />
            <SubNavLink href={`/admin/companies/${companyId}/financing-opportunities`} icon="🚀" label="Financing Opportunities" sub="Indicative · Not approved" color="emerald" />
          </div>

          {/* Stats row — jobs from Stage 2, intel from Stage 3 */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            <StatCard label="Total Jobs"   value={jobsLoading ? "…" : totalJobs}     color="text-slate-300" />
            <StatCard label="Completed"    value={jobsLoading ? "…" : completedJobs} color="text-emerald-400" />
            <StatCard label="Active"       value={jobsLoading ? "…" : activeJobs}    color="text-blue-400" />
            <StatCard label="Disputed"     value={jobsLoading ? "…" : disputedJobs}  color={disputedJobs > 0 ? "text-red-400" : "text-slate-600"} />
          </div>

          {/* ── Main three-column grid ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

            {/* Column 1: company info + membership */}
            <div className="flex flex-col gap-6">
              <Section title="Company Profile">
                <InfoRow label="Name"            value={company.name} />
                <InfoRow label="Type"            value={company.type ?? "—"} />
                <InfoRow label="Country"         value={company.country ?? "—"} />
                <InfoRow label="Registration No" value={company.registration_no ?? "—"} />
                <InfoRow label="Status"          value={company.status ?? "Active"} />
                <InfoRow label="Created"         value={company.created_at.slice(0, 10)} />
                {company.updated_at && (
                  <InfoRow label="Updated" value={company.updated_at.slice(0, 10)} />
                )}
              </Section>

              {/* Membership */}
              {memStatus === "idle" || memStatus === "loading" ? null :
               memStatus === "error" ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-600">
                  Membership data unavailable
                </div>
              ) : membership ? (
                <Section title="Membership">
                  <InfoRow label="Plan"             value={membership.plan} />
                  <InfoRow label="Status"           value={membership.status} />
                  <InfoRow label="Annual Fee"       value={`RM ${membership.annual_fee?.toLocaleString() ?? "—"}`} />
                  <InfoRow label="Included Jobs"    value={`${membership.used_jobs ?? 0} / ${membership.included_jobs ?? "∞"} used`} />
                  <InfoRow label="Start Date"       value={membership.start_date} />
                  <InfoRow label="End Date"         value={membership.end_date ?? "Ongoing"} />
                  <InfoRow label="AI Monitoring"    value={membership.ai_monitoring_included ? "✓ Included" : "Not included"} />
                  <InfoRow label="Priority Support" value={membership.priority_support ? "✓ Yes" : "No"} />
                </Section>
              ) : null}
            </div>

            {/* Column 2: trust score + financing */}
            <div className="flex flex-col gap-6">
              {intelLoading ? (
                <Section title="Trust Score">
                  <div className="flex items-center justify-center py-8">
                    <p className="flex items-center gap-2 text-xs text-slate-600 animate-pulse">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                      Loading intelligence…
                    </p>
                  </div>
                </Section>
              ) : intelStatus === "error" || intelStatus === "timeout" ? (
                <Section title="Trust Score">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-5 text-center">
                    <p className="text-xs text-slate-500 mb-2">Intelligence not scored yet</p>
                    {intelError && <p className="font-mono text-[10px] text-slate-700 break-all mb-2">{intelError}</p>}
                    <button
                      onClick={() => void loadIntel()}
                      className="rounded-lg border border-slate-700 px-3 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </Section>
              ) : intel ? (
                <>
                  <Section title="Trust Score Breakdown">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-900">
                        <span className={`text-lg font-bold tabular-nums ${
                          (intel.overall_trust_score ?? 0) >= 80 ? "text-emerald-400" :
                          (intel.overall_trust_score ?? 0) >= 60 ? "text-amber-400"   :
                          (intel.overall_trust_score ?? 0) >= 40 ? "text-red-400"     : "text-red-300"
                        }`}>{intel.overall_trust_score ?? "—"}</span>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Overall Trust Score</p>
                        {intel.trend && (
                          <p className={`text-sm font-semibold ${TREND_COLOR[intel.trend as keyof typeof TREND_COLOR] ?? "text-slate-400"}`}>
                            {TREND_ICON[intel.trend as keyof typeof TREND_ICON]} {intel.trend}
                          </p>
                        )}
                      </div>
                    </div>
                    <ScoreRow label="Payment Behavior"        score={intel.payment_behavior_score} />
                    <ScoreRow label="Operational Reliability" score={intel.operational_reliability_score} />
                    <ScoreRow label="Document Completeness"   score={intel.document_completeness_score} />
                    {intel.on_time_completion_rate != null && (
                      <ScoreRow label="On-Time Completion" score={intel.on_time_completion_rate} />
                    )}
                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-600">
                      <span>Last calculated</span>
                      <span>{intel.last_calculated_at ? intel.last_calculated_at.slice(0, 16).replace("T", " ") : "Never"}</span>
                    </div>
                  </Section>

                  <Section title="Financing Assessment">
                    <div className="mb-3">
                      <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${FINANCING_BADGE[intel.financing_readiness as keyof typeof FINANCING_BADGE] ?? "border-slate-700 text-slate-500"}`}>
                        {intel.financing_readiness ?? "Not assessed"}
                      </span>
                    </div>
                    {intel.recommended_terms && (
                      <p className="text-xs leading-relaxed text-slate-400">{intel.recommended_terms}</p>
                    )}
                    {(intel.critical_exceptions ?? 0) > 0 && (
                      <div className="mt-3 rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                        ⚠ {intel.critical_exceptions} critical exception{(intel.critical_exceptions ?? 0) > 1 ? "s" : ""} — financing eligibility restricted.
                      </div>
                    )}
                  </Section>
                </>
              ) : (
                <Section title="Trust Score">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-6 text-center">
                    <p className="text-xs text-slate-600 mb-3">No intelligence data yet.</p>
                    <p className="text-xs text-slate-700">Click "Recalculate Intelligence" to generate scores.</p>
                  </div>
                </Section>
              )}

              {/* Benchmark cards — only when company type is known */}
              {company.type === "Service Provider" && (
                <ProviderBenchmarkCard companyId={companyId} companyName={company.name} showRecalc />
              )}
              {company.type === "Customer" && (
                <CustomerBenchmarkCard companyId={companyId} companyName={company.name} showRecalc />
              )}
            </div>

            {/* Column 3: jobs + audit */}
            <div className="flex flex-col gap-6">

              {/* Jobs — Stage 2 */}
              <Section title={jobsLoading ? "Jobs" : `Jobs (${totalJobs}${totalJobs === 20 ? "+" : ""})`}>
                {jobsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <p className="flex items-center gap-2 text-xs text-slate-600 animate-pulse">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                      Loading jobs…
                    </p>
                  </div>
                ) : jobStatus === "error" || jobStatus === "timeout" ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                    <p className="text-xs text-slate-500 mb-2">
                      Job metrics {jobStatus === "timeout" ? "timed out" : "unavailable"}
                    </p>
                    {jobError && <p className="font-mono text-[10px] text-slate-700 break-all mb-2">{jobError}</p>}
                    <button
                      onClick={() => void loadJobs()}
                      className="rounded-lg border border-slate-700 px-3 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : jobStatus === "idle" && coreMode ? (
                  <p className="text-xs text-slate-600">Core mode — jobs skipped.</p>
                ) : jobs.length === 0 ? (
                  <p className="text-xs text-slate-600">No jobs found for this company.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {jobs.map((j) => (
                      <Link
                        key={j.job_reference}
                        href={`/admin/jobs/${j.job_reference}`}
                        className="group flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 hover:border-slate-700 hover:bg-slate-800/60 transition-colors"
                      >
                        <div>
                          <p className="font-mono text-xs font-semibold text-slate-300 group-hover:text-blue-400 transition-colors">
                            {j.job_reference}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-600">
                            {j.service_provider ?? j.customer ?? "—"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-[10px] font-medium ${
                            j.job_status === "Completed" ? "text-emerald-400" :
                            j.job_status === "Disputed"  ? "text-red-400"     : "text-blue-400"
                          }`}>{j.job_status ?? "—"}</p>
                          <p className="text-[10px] text-slate-600">
                            {j.logistics_fee_amount != null
                              ? `RM ${Number(j.logistics_fee_amount).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`
                              : "—"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Section>

              {/* Audit — Stage 3c */}
              <Section title="Recent Activity">
                {auditStatus === "loading" ? (
                  <p className="text-xs text-slate-600 animate-pulse">Loading activity…</p>
                ) : auditStatus === "error" || (auditStatus === "idle" && coreMode) ? (
                  <p className="text-xs text-slate-600">Activity {coreMode ? "skipped (core mode)" : "unavailable"}</p>
                ) : audit.length === 0 ? (
                  <p className="text-xs text-slate-600">No audit activity found.</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {audit.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-slate-500">{a.action}</span>
                          <span className="text-[10px] text-slate-700 flex-shrink-0">{a.created_at.slice(0, 10)}</span>
                        </div>
                        <p className="text-[10px] text-slate-600 leading-snug line-clamp-2">{a.description}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </div>
          </div>

          {/* ── Optional module cards ──────────────────────────────────────── */}
          {!coreMode && (
            <>
              <div className="mt-6">
                <CapitalReadinessCard companyId={companyId} actorName="Admin" />
              </div>
              <div className="mt-6">
                <FinancingOfferCard companyId={companyId} actorName="Admin" />
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

// ─── Layout shell ─────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"                className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"           className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/exceptions"     className="hover:text-slate-100 transition-colors">Exceptions</Link>
            <Link href="/admin/companies"      className="text-slate-100 border-b border-slate-500 pb-0.5">Companies</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <Link href="/admin/db-health"      className="hover:text-slate-100 transition-colors">DB Health</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type NavColor = "purple" | "cyan" | "amber" | "emerald";

const NAV_COLOR: Record<NavColor, string> = {
  purple:  "border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-purple-500/70",
  cyan:    "border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-400 text-cyan-600/70",
  amber:   "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 text-amber-600/70",
  emerald: "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 text-emerald-600/70",
};

function SubNavLink({ href, icon, label, sub, color }: {
  href: string; icon: string; label: string; sub: string; color: NavColor;
}) {
  const cls = NAV_COLOR[color].split(" ");
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 rounded-xl border px-4 py-3.5 transition-colors group ${cls.slice(0, 3).join(" ")}`}
    >
      <span className="text-base">{icon}</span>
      <span className={`text-xs font-semibold ${cls[3]}`}>{label}</span>
      <span className={`text-[10px] ${cls[4]}`}>{sub}</span>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-600 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-300 text-right">{value}</span>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-[10px] text-slate-600">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ScoreRow({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  const bar  = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : score >= 40 ? "bg-red-400" : "bg-red-600";
  const text = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${text}`}>{score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
