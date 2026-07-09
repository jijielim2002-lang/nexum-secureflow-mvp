"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AdminNav } from "@/components/AdminNav";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { RISK_BADGE, FINANCING_BADGE } from "@/lib/companyIntelligence";

// ─── Config ───────────────────────────────────────────────────────────────────

const LOAD_TIMEOUT_MS = 12_000; // server-side API has 12s budget; abort after 14s client-side
const CLIENT_ABORT_MS = 14_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyRow {
  id:              string;
  name:            string;
  type:            string | null;
  country:         string | null;
  registration_no: string | null;
  status:          string | null;
  created_at:      string | null;
}

interface JobMetrics {
  total_jobs:             number;
  monthly_jobs:           number;
  completed_jobs:         number;
  active_jobs:            number;
  disputed_jobs:          number;
  total_logistics_fee:    number;
  total_cargo_value:      number;
  total_secured_amount:   number;
  monthly_secured_amount: number;
}

function zeroMetrics(): JobMetrics {
  return {
    total_jobs: 0, monthly_jobs: 0, completed_jobs: 0, active_jobs: 0,
    disputed_jobs: 0, total_logistics_fee: 0, total_cargo_value: 0,
    total_secured_amount: 0, monthly_secured_amount: 0,
  };
}

interface CompanyIntel {
  financeability_score:      number | null;
  overall_trust_score:       number | null;
  risk_level:                string | null;
  financing_readiness:       string | null;
  financing_readiness_score: number | null;
  trend:                     string | null;
  scoring_status:            string | null;
  last_calculated_at:        string | null;
  score_note:                string | null;
  risk_flags:                string[] | null;
}

type StageState = "idle" | "loading" | "ok" | "error" | "timeout" | "skipped";

interface StageDiag {
  state:   StageState;
  rows:    number;
  error:   string | null;
  code:    string | null;
  hint:    string | null;
  details: string | null;
  warn:    string | null;
}

function freshDiag(state: StageState = "idle"): StageDiag {
  return { state, rows: 0, error: null, code: null, hint: null, details: null, warn: null };
}

// Shape returned by /api/admin/company-intelligence/list
interface ApiListResponse {
  ok:                  boolean;
  error?:              string;
  companies?:          CompanyRow[];
  metricsByCompanyId?: Record<string, JobMetrics>;
  profilesByCompanyId?: Record<string, Record<string, unknown>>;
  scoringAvailable?:   boolean;
  diagnostics?: {
    companiesCount: number;
    jobsCount:      number;
    profilesCount:  number;
    warnings:       string[];
    durationMs?:    number;
  };
}

interface RecalcResult {
  success?:                boolean;
  companies_scored?:       number;
  companies_failed?:       number;
  total_jobs_analyzed?:    number;
  errors?:                 string[];
  error?:                  string;
  warning?:                string;
  detail?:                 { code?: string | null; hint?: string | null; details?: string | null } | null;
  skipped_columns?:        string[];
  skipped_advanced_fields?: string[];
  advanced_scoring?:       boolean;
}

interface BackfillResult {
  success?:     boolean;
  message?:     string;
  error?:       string;
  link_errors?: string[];
  detail?:      { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null;
  attempted?:   string[];
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function AdminCompaniesPage() {
  return (
    <AuthGuard requiredRole="admin">
      <CompaniesInner />
    </AuthGuard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function CompaniesInner() {
  const { isBypass } = useAuth();

  // ── Data state ────────────────────────────────────────────────────────────
  const [companies,   setCompanies]   = useState<CompanyRow[]>([]);
  const [metricsMap,  setMetricsMap]  = useState<Record<string, JobMetrics>>({});
  const [intelMap,    setIntelMap]    = useState<Record<string, CompanyIntel>>({});

  // ── Per-stage diagnostics ─────────────────────────────────────────────────
  const [diagS1, setDiagS1] = useState<StageDiag>(freshDiag("idle"));
  const [diagS2, setDiagS2] = useState<StageDiag>(freshDiag("idle"));
  const [diagS3, setDiagS3] = useState<StageDiag>(freshDiag("idle"));

  // ── UI state ──────────────────────────────────────────────────────────────
  const [coreMode,    setCoreMode]    = useState(false);
  const [showDiag,    setShowDiag]    = useState(true);
  const [filterType,  setFilterType]  = useState("");
  const [filterRisk,  setFilterRisk]  = useState("");

  // ── Recalculate All ───────────────────────────────────────────────────────
  const [recalcState,    setRecalcState]    = useState<Record<string, "idle" | "loading" | "done" | "error">>({});
  const [recalcAllState, setRecalcAllState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [recalcAllMsg,   setRecalcAllMsg]   = useState<string | null>(null);

  // ── Backfill ──────────────────────────────────────────────────────────────
  const [backfillState,  setBackfillState]  = useState<"idle" | "loading" | "done" | "error">("idle");
  const [backfillMsg,    setBackfillMsg]    = useState<string | null>(null);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  function buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (isBypass) h["x-nexum-dev-bypass"] = "1";
    return h;
  }

  async function getToken(): Promise<string> {
    if (isBypass) return ""; // no real session in bypass mode
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Main loader — calls /api/admin/company-intelligence/list ─────────────
  // Replaces the three separate browser Supabase queries (which time out in
  // bypass mode because RLS blocks anon reads and getSession() hangs).

  const loadAll = useCallback(async (core = false) => {
    setCompanies([]);
    setMetricsMap({});
    setIntelMap({});
    setDiagS1(freshDiag("loading"));
    setDiagS2(core ? freshDiag("skipped") : freshDiag("loading"));
    setDiagS3(core ? freshDiag("skipped") : freshDiag("loading"));

    const t0 = Date.now();
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), CLIENT_ABORT_MS);

    console.log(`[CompanyIntelligence] loadAll started — coreMode=${core} bypass=${isBypass}`);

    try {
      const token = await getToken();
      const url   = `/api/admin/company-intelligence/list${core ? "?coreOnly=true" : ""}`;
      const headers: Record<string, string> = { ...buildHeaders() };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res  = await fetch(url, { signal: ctrl.signal, headers });
      clearTimeout(abortTimer);
      const json = await res.json() as ApiListResponse;
      const dur  = Date.now() - t0;
      console.log(`[CompanyIntelligence] API responded in ${dur}ms — ok=${json.ok} companies=${json.diagnostics?.companiesCount ?? "?"}`);

      if (!json.ok || !res.ok) {
        const msg = json.error ?? `HTTP ${res.status}`;
        setDiagS1({ state: "error", rows: 0, error: msg, code: String(res.status), hint: null, details: null, warn: null });
        if (!core) {
          setDiagS2(freshDiag("error"));
          setDiagS3(freshDiag("error"));
        }
        return;
      }

      // ── Populate companies (Stage 1) ─────────────────────────────────────
      const rows = json.companies ?? [];
      setCompanies(rows);
      const diagWarn = rows.length === 0
        ? `0 companies returned from API. The companies table may be empty.${isBypass ? " (bypass mode)" : ""}`
        : null;
      setDiagS1({ state: "ok", rows: rows.length, error: null, code: null, hint: null, details: null, warn: diagWarn });
      if (rows.length > 0) setShowDiag(false);

      if (core) return;

      // ── Populate job metrics (Stage 2) ────────────────────────────────────
      const metricsRaw = json.metricsByCompanyId ?? {};
      const metrics: Record<string, JobMetrics> = {};
      for (const id of rows.map((c) => c.id)) {
        metrics[id] = (metricsRaw[id] as JobMetrics | undefined) ?? zeroMetrics();
      }
      setMetricsMap(metrics);

      const jobWarnings = (json.diagnostics?.warnings ?? []).filter((w) => w.includes("secured_jobs"));
      if (jobWarnings.length > 0) {
        setDiagS2({ state: "error", rows: 0, error: jobWarnings[0], code: null, hint: null, details: null, warn: null });
      } else {
        setDiagS2({ state: "ok", rows: json.diagnostics?.jobsCount ?? 0, error: null, code: null, hint: null, details: null, warn: null });
      }

      // ── Populate intel profiles (Stage 3) ─────────────────────────────────
      const profilesRaw = json.profilesByCompanyId ?? {};
      const intel: Record<string, CompanyIntel> = {};
      for (const [id, row] of Object.entries(profilesRaw)) {
        intel[id] = {
          financeability_score:      (row.financeability_score as number | null) ?? null,
          overall_trust_score:       (row.overall_trust_score as number | null) ?? null,
          risk_level:                (row.risk_level as string | null) ?? null,
          financing_readiness:       (row.financing_readiness as string | null) ?? null,
          financing_readiness_score: (row.financing_readiness_score as number | null) ?? null,
          trend:                     (row.trend as string | null) ?? null,
          scoring_status:            (row.scoring_status as string | null) ?? null,
          last_calculated_at:        (row.last_calculated_at as string | null) ?? null,
          score_note:                (row.score_note as string | null) ?? null,
          risk_flags:                (row.risk_flags as string[] | null) ?? null,
        };
      }
      setIntelMap(intel);

      const profWarnings = (json.diagnostics?.warnings ?? []).filter((w) => w.includes("company_intelligence_profiles"));
      if (profWarnings.length > 0) {
        setDiagS3({ state: json.scoringAvailable ? "ok" : "error", rows: json.diagnostics?.profilesCount ?? 0, error: profWarnings[0], code: null, hint: null, details: null, warn: profWarnings[0] });
      } else {
        setDiagS3({ state: "ok", rows: json.diagnostics?.profilesCount ?? 0, error: null, code: null, hint: null, details: null, warn: null });
      }

    } catch (e) {
      clearTimeout(abortTimer);
      const dur = Date.now() - t0;
      const isAbort = e instanceof DOMException && e.name === "AbortError";
      const msg = isAbort
        ? `Request aborted after ${CLIENT_ABORT_MS / 1000}s (API has ${LOAD_TIMEOUT_MS / 1000}s budget)`
        : (e instanceof Error ? e.message : String(e));
      const state: StageState = isAbort ? "timeout" : "error";
      console.warn(`[CompanyIntelligence] ${state} after ${dur}ms:`, msg);
      setDiagS1({ state, rows: 0, error: msg, code: null, hint: null, details: null, warn: null });
      if (!core) {
        setDiagS2({ ...freshDiag(state), error: "parent request failed" });
        setDiagS3({ ...freshDiag(state), error: "parent request failed" });
      }
    } finally {
      // Safety net: if any code path above exited without updating diagS1 out of
      // "loading", force it to an error state so the page never stays frozen.
      setDiagS1((prev) =>
        prev.state === "loading"
          ? { ...prev, state: "error", error: "Request did not complete" }
          : prev,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBypass, coreMode]);

  // ── runAll helper for use in buttons ─────────────────────────────────────
  const runAll = useCallback(() => void loadAll(coreMode), [loadAll, coreMode]);

  // ── Kick off on mount / coreMode change ──────────────────────────────────
  useEffect(() => { void loadAll(coreMode); }, [loadAll, coreMode]);

  // ── Derived display items ─────────────────────────────────────────────────

  const items = useMemo(() =>
    companies.map((c) => ({
      ...c,
      metrics: metricsMap[c.id] ?? zeroMetrics(),
      intel:   intelMap[c.id] ?? null,
    })),
    [companies, metricsMap, intelMap],
  );

  const filtered = items.filter((c) => {
    if (filterType && (c.type ?? "") !== filterType) return false;
    if (filterRisk && (!c.intel || c.intel.risk_level !== filterRisk)) return false;
    return true;
  });

  const types       = [...new Set(items.map((c) => c.type ?? "").filter(Boolean))];
  const scored      = items.filter((c) => c.intel !== null).length;
  const highRisk    = items.filter((c) => c.intel?.risk_level === "High" || c.intel?.risk_level === "Critical").length;
  const priorityFin = items.filter((c) => c.intel?.financing_readiness === "Priority").length;

  const s1Loading  = diagS1.state === "loading" || diagS1.state === "idle";
  const hasError   = diagS1.state === "error" || diagS1.state === "timeout";

  // ── Recalculate one ───────────────────────────────────────────────────────

  async function recalcOne(id: string, name: string) {
    setRecalcState((s) => ({ ...s, [id]: "loading" }));
    try {
      const token   = await getToken();
      const headers = { ...buildHeaders() };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res  = await fetch("/api/admin/company-intelligence/recalculate", {
        method:  "POST",
        headers,
        body:    JSON.stringify({ companyId: id }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRecalcState((s) => ({ ...s, [id]: "done" }));
      setTimeout(() => {
        setRecalcState((s) => ({ ...s, [id]: "idle" }));
        void loadAll(coreMode); // Refresh all to pick up new scores
      }, 1500);
    } catch {
      setRecalcState((s) => ({ ...s, [id]: "error" }));
      setTimeout(() => setRecalcState((s) => ({ ...s, [id]: "idle" })), 3000);
    }
    void name;
  }

  // ── Recalculate All ───────────────────────────────────────────────────────

  async function recalcAll() {
    setRecalcAllState("loading");
    setRecalcAllMsg(null);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 60_000);
    try {
      const token   = await getToken();
      const headers = { ...buildHeaders() };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/admin/company-intelligence/recalculate", {
        method:  "POST",
        signal:  controller.signal,
        headers,
        body:    JSON.stringify({}),
      });
      clearTimeout(tid);
      const json = await res.json() as RecalcResult;

      if (!res.ok || !json.success) {
        const parts: string[] = [json.error ?? `HTTP ${res.status}`];
        if (json.detail?.code)    parts.push(`code: ${json.detail.code}`);
        if (json.detail?.hint)    parts.push(`hint: ${json.detail.hint}`);
        if (json.detail?.details) parts.push(`details: ${json.detail.details}`);
        throw new Error(parts.join(" | "));
      }

      const msg = [
        `Scored ${json.companies_scored ?? 0} companies.`,
        `${json.total_jobs_analyzed ?? 0} jobs analyzed.`,
        ...(json.companies_failed ? [`${json.companies_failed} failed.`] : []),
        ...(json.errors?.length ? [`Errors: ${json.errors.join("; ")}`] : []),
        ...(json.skipped_advanced_fields?.length
          ? [`Advanced fields skipped (${json.skipped_advanced_fields.length}): ${json.skipped_advanced_fields.slice(0, 5).join(", ")}${json.skipped_advanced_fields.length > 5 ? "…" : ""}`]
          : []),
        ...(json.skipped_columns?.length ? [`⚠ Skipped missing columns: ${json.skipped_columns.join(", ")} — run migration 023_cip_basic_scoring_schema.sql`] : []),
      ].join(" ");

      setRecalcAllMsg(msg);
      setRecalcAllState("done");
      setTimeout(() => {
        setRecalcAllState("idle");
        setRecalcAllMsg(null);
        void loadAll(coreMode);
      }, 3000);
    } catch (err) {
      clearTimeout(tid);
      const msg = err instanceof Error
        ? (err.name === "AbortError" ? "Timed out after 60s." : err.message)
        : "Recalculate failed";
      setRecalcAllMsg(msg);
      setRecalcAllState("error");
      setTimeout(() => {
        setRecalcAllState((s) => { if (s === "error") { setRecalcAllMsg(null); return "idle"; } return s; });
      }, 8_000);
    }
  }

  // ── Backfill ──────────────────────────────────────────────────────────────

  async function runBackfill() {
    setBackfillState("loading");
    setBackfillMsg(null);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    try {
      const token   = await getToken();
      const headers = { ...buildHeaders() };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/admin/companies/backfill", {
        method: "POST", signal: controller.signal, headers,
      });
      clearTimeout(tid);
      const json = await res.json() as BackfillResult;

      if (!res.ok || !json.success) {
        const parts: string[] = [json.error ?? `HTTP ${res.status}`];
        if (json.detail?.code)    parts.push(`code: ${json.detail.code}`);
        if (json.detail?.message) parts.push(`message: ${json.detail.message}`);
        if (json.detail?.details) parts.push(`details: ${json.detail.details}`);
        if (json.detail?.hint)    parts.push(`hint: ${json.detail.hint}`);
        if (json.attempted?.length) parts.push(`attempted: ${json.attempted.join(", ")}`);
        throw new Error(parts.join(" | "));
      }

      const summary = [json.message, ...(json.link_errors?.length ? [`Link errors: ${json.link_errors.join("; ")}`] : [])].filter(Boolean).join(" ");
      setBackfillState("done");
      setBackfillMsg(summary || "Backfill complete.");
      setTimeout(() => void loadAll(false), 800);
    } catch (err) {
      clearTimeout(tid);
      const msg = err instanceof Error
        ? (err.name === "AbortError" ? "Request timed out after 15s." : err.message)
        : "Backfill failed";
      setBackfillState("error");
      setBackfillMsg(msg);
    } finally {
      setTimeout(() => {
        setBackfillState((s) => (s === "error" ? "idle" : s));
      }, 6_000);
    }
  }

  const SEL = "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none transition-colors cursor-pointer";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <AdminNav currentPage="companies" />

      <main className="mx-auto w-full max-w-[1440px] px-6 py-8">

        {/* ── Title bar ─────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Company Intelligence</h1>
            <p className="mt-1 text-sm text-slate-400">
              Server-side API · service role · {isBypass ? "bypass mode active" : "JWT auth"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">

              {/* Core mode */}
              <button
                type="button"
                onClick={() => setCoreMode((v) => !v)}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                  coreMode
                    ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                    : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                }`}
                title={coreMode ? "Core mode: only companies loaded (jobs and scoring skipped)" : "Enable core-only mode"}
              >
                {coreMode ? "⚡ Core only" : "⚡ Core only"}
              </button>

              {/* Diagnostics toggle */}
              <button
                type="button"
                onClick={() => setShowDiag((v) => !v)}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                  hasError
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                }`}
              >
                {showDiag ? "Hide" : "Show"} Diag{hasError ? " ⚠" : ""}
              </button>

              {/* Refresh */}
              <button
                type="button"
                onClick={runAll}
                disabled={s1Loading}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
              >
                {s1Loading ? "Loading…" : "↺ Refresh"}
              </button>

              {/* Recalculate All — manual only */}
              <button
                type="button"
                onClick={recalcAll}
                disabled={recalcAllState === "loading" || companies.length === 0}
                className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                  recalcAllState === "loading" ? "border-slate-700 text-slate-600 cursor-wait" :
                  recalcAllState === "done"    ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-400" :
                  recalcAllState === "error"   ? "border-red-600/40 bg-red-600/10 text-red-400" :
                  "border-blue-600/40 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25"
                }`}
              >
                {recalcAllState === "loading" ? "Recalculating…" :
                 recalcAllState === "done"    ? "✓ Recalculated" :
                 recalcAllState === "error"   ? "! Failed" :
                 "↺ Recalculate All"}
              </button>
            </div>
            {recalcAllMsg && (
              <p className={`text-[11px] font-mono select-all text-right max-w-md break-all ${
                recalcAllState === "error" ? "text-red-400" : "text-emerald-400"
              }`}>{recalcAllMsg}</p>
            )}
          </div>
        </div>

        {/* ── Bypass warning ────────────────────────────────────────────────── */}
        {isBypass && (
          <div className="mb-6 rounded-xl border border-amber-600/30 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-400">
            <span className="font-semibold">Bypass mode active.</span>{" "}
            API accepts <code className="rounded bg-amber-950/60 px-1 font-mono text-[10px]">x-nexum-dev-bypass: 1</code>{" "}
            in development — service role used server-side. RLS is bypassed.
          </div>
        )}

        {/* ── Diagnostics panel ─────────────────────────────────────────────── */}
        {showDiag && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-slate-900 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Diagnostics
              </p>
              <span className="text-[10px] text-slate-600">
                GET /api/admin/company-intelligence/list · service role · {LOAD_TIMEOUT_MS / 1000}s server budget
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StageCard label="Stage 1 — companies"         diag={diagS1} />
              <StageCard label="Stage 2 — job metrics"       diag={diagS2} />
              <StageCard label="Stage 3 — scoring profiles"  diag={diagS3} />
            </div>
            {diagS3.warn && (
              <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
                ⚠ {diagS3.warn}
              </div>
            )}
          </div>
        )}

        {/* ── Backfill banner ───────────────────────────────────────────────── */}
        {!s1Loading && diagS1.state === "ok" && companies.length === 0 && diagS2.rows > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/5 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-300">
                  ⚠ Companies table is empty — {diagS2.rows} jobs exist but have no company records
                </p>
                <p className="mt-1 text-xs text-amber-500/80">
                  Run backfill to extract company names from existing jobs and create company records.
                </p>
                {backfillMsg && (
                  <p className={`mt-2 text-xs font-mono select-all break-all leading-relaxed ${
                    backfillState === "error" ? "text-red-400" : "text-emerald-400"
                  }`}>{backfillMsg}</p>
                )}
              </div>
              <button
                type="button"
                onClick={runBackfill}
                disabled={backfillState === "loading" || backfillState === "done"}
                className={`shrink-0 rounded-lg border px-5 py-2.5 text-xs font-semibold transition-colors ${
                  backfillState === "loading" ? "border-slate-700 text-slate-600 cursor-wait" :
                  backfillState === "done"    ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-400" :
                  backfillState === "error"   ? "border-red-500/40 bg-red-500/10 text-red-400" :
                  "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                }`}
              >
                {backfillState === "loading" ? "Backfilling…" :
                 backfillState === "done"    ? "✓ Done" :
                 backfillState === "error"   ? "! Failed — retry" :
                 "⚙ Backfill Companies"}
              </button>
            </div>
          </div>
        )}

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniCard label="Total Companies"  value={companies.length}  color="text-blue-400"    loading={s1Loading} />
          <MiniCard label="Scored"           value={scored}            color="text-emerald-400" loading={diagS3.state === "loading"} />
          <MiniCard label="Priority Finance" value={priorityFin}       color="text-purple-400"  loading={diagS3.state === "loading"} />
          <MiniCard label="High / Critical"  value={highRisk}          color="text-red-400"     loading={diagS3.state === "loading"} highlight={highRisk > 0} />
        </div>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">Type</p>
            <select className={SEL} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">Risk</p>
            <select className={SEL} value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
              <option value="">All Risk Levels</option>
              {["Low", "Medium", "High", "Critical"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {(filterType || filterRisk) && (
            <button type="button" onClick={() => { setFilterType(""); setFilterRisk(""); }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-500 hover:text-slate-200 transition-colors">
              Clear
            </button>
          )}
          <p className="ml-auto self-end text-xs text-slate-600">
            {filtered.length} of {companies.length} companies
          </p>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        {s1Loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Loading company intelligence… (API · service role)
            </p>
            <p className="mt-2 text-xs text-slate-700">
              Server has {LOAD_TIMEOUT_MS / 1000}s budget — includes companies, job metrics, and scoring profiles.
            </p>
          </div>

        ) : hasError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-5">
            <p className="mb-1 text-sm font-semibold text-red-300">
              {diagS1.state === "timeout" ? "Request timed out" : "Company Intelligence failed to load"}
            </p>
            <p className="font-mono text-xs text-red-400 break-all">{diagS1.error}</p>
            {diagS1.code    && <p className="mt-1 font-mono text-[10px] text-red-500">code: {diagS1.code}</p>}
            {diagS1.hint    && <p className="mt-0.5 font-mono text-[10px] text-red-500">hint: {diagS1.hint}</p>}
            {diagS1.details && <p className="mt-0.5 font-mono text-[10px] text-red-500">details: {diagS1.details}</p>}
            <p className="mt-3 text-xs text-slate-500">
              Endpoint: <code className="text-slate-400">GET /api/admin/company-intelligence/list</code>{" "}
              · Check that <code className="text-slate-400">SUPABASE_SERVICE_ROLE_KEY</code> is set.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => { setCoreMode(true); void loadAll(true); }}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                ⚡ Retry Core Company List
              </button>
              <button
                onClick={runAll}
                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                ↺ Retry All
              </button>
            </div>
          </div>

        ) : companies.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <p className="text-sm font-semibold text-slate-400 mb-2">0 companies returned</p>
            {diagS1.warn
              ? <p className="text-xs text-amber-400 mb-4 max-w-md mx-auto">{diagS1.warn}</p>
              : <p className="text-xs text-slate-600 mb-4">The companies table appears to be empty.</p>
            }
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setShowDiag(true)}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-400 hover:bg-amber-500/15 transition-colors">
                Open Diagnostics
              </button>
              <button onClick={runAll}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                ↺ Retry
              </button>
            </div>
          </div>

        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            {/* S2/S3 strip */}
            {(diagS2.state === "error" || diagS2.state === "timeout") && !coreMode && (
              <div className="border-b border-slate-800 bg-amber-950/20 px-4 py-1.5 text-[10px] text-amber-500">
                ⚠ Job metrics unavailable — {diagS2.error}
              </div>
            )}
            {(diagS3.state === "error" || diagS3.state === "timeout") && !coreMode && (
              <div className="border-b border-slate-800 bg-amber-950/20 px-4 py-1.5 text-[10px] text-amber-500">
                ⚠ Scoring profiles unavailable — {diagS3.error}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-left">
                    <Th>Company Name</Th>
                    <Th>Type</Th>
                    <Th>Country</Th>
                    <Th>Reg No</Th>
                    <Th>Status</Th>
                    {!coreMode && <><Th>Total Jobs</Th><Th>Monthly</Th><Th>Logistics Fee</Th><Th>Total Secured</Th></>}
                    <Th>Risk</Th>
                    <Th>Score</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((c) => {
                    const rs = recalcState[c.id] ?? "idle";
                    const m  = c.metrics;
                    return (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <Link href={`/admin/companies/${c.id}`}
                            className="font-semibold text-slate-200 hover:text-blue-400 transition-colors">
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-slate-400">{c.type ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-400">{c.country ?? "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{c.registration_no ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            c.status === "Active"    ? "bg-emerald-500/10 text-emerald-400" :
                            c.status === "Suspended" ? "bg-red-500/10 text-red-400" :
                            "bg-slate-800 text-slate-500"
                          }`}>{c.status ?? "Active"}</span>
                        </td>
                        {!coreMode && (
                          <>
                            <td className="px-3 py-2.5 tabular-nums text-center">
                              {m.total_jobs > 0
                                ? <span className="text-slate-300">{m.total_jobs}<span className="ml-1 text-slate-600">({m.completed_jobs}✓)</span></span>
                                : <span className="text-slate-700">0</span>}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-center text-slate-400">
                              {m.monthly_jobs > 0 ? m.monthly_jobs : <span className="text-slate-700">0</span>}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-slate-300">
                              {fmtMYR(m.total_logistics_fee)}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap font-medium text-slate-100">
                              {fmtMYR(m.total_secured_amount)}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2.5">
                          {c.intel?.risk_level
                            ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${RISK_BADGE[c.intel.risk_level as keyof typeof RISK_BADGE] ?? "border-slate-700 text-slate-500"}`}>{c.intel.risk_level}</span>
                            : <span className="text-slate-700 text-[10px]">Not Available</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {(() => {
                            const score = c.intel?.financeability_score ?? c.intel?.overall_trust_score;
                            if (score != null) {
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <ScoreBar score={score} />
                                    {c.intel?.financing_readiness &&
                                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${FINANCING_BADGE[c.intel.financing_readiness as keyof typeof FINANCING_BADGE] ?? "border-slate-700 text-slate-500"}`}>
                                        {c.intel.financing_readiness}
                                      </span>}
                                  </div>
                                  {c.intel?.last_calculated_at &&
                                    <span className="text-[9px] font-mono text-slate-600">
                                      {new Date(c.intel.last_calculated_at).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })}
                                    </span>}
                                </div>
                              );
                            }
                            if (c.intel?.scoring_status === "Error") {
                              return <span className="italic text-red-500 text-[10px]">Scoring error</span>;
                            }
                            return <span className="italic text-slate-600 text-[10px]">Not Scored Yet</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <Link href={`/admin/companies/${c.id}/intelligence-report`}
                              className="rounded border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20 transition-colors">
                              Intel
                            </Link>
                            <Link href={`/admin/companies/${c.id}/credit-health-report`}
                              className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-500/20 transition-colors">
                              Credit Report
                            </Link>
                            <button type="button" onClick={() => recalcOne(c.id, c.name)} disabled={rs === "loading"}
                              className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                                rs === "loading" ? "border-slate-800 text-slate-700 cursor-wait" :
                                rs === "done"    ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-400" :
                                rs === "error"   ? "border-red-600/30 bg-red-600/10 text-red-400" :
                                "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
                              }`}>
                              {rs === "loading" ? "…" : rs === "done" ? "✓" : rs === "error" ? "!" : "↺"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMYR(v: number) {
  if (v === 0) return <span className="text-slate-700">—</span>;
  return <span>RM {new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(v)}</span>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StageCard({ label, diag }: { label: string; diag: StageDiag }) {
  const stateColor =
    diag.state === "ok"      ? "text-emerald-400" :
    diag.state === "error"   ? "text-red-400"     :
    diag.state === "timeout" ? "text-amber-400"   :
    diag.state === "loading" ? "text-blue-400"    :
    diag.state === "skipped" ? "text-slate-600"   : "text-slate-600";

  const stateLabel =
    diag.state === "idle"    ? "idle"                       :
    diag.state === "loading" ? "querying…"                  :
    diag.state === "ok"      ? `ok — ${diag.rows} rows`     :
    diag.state === "error"   ? "error"                      :
    diag.state === "timeout" ? "timeout"                    : "skipped";

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[11px] font-mono font-semibold ${stateColor}`}>{stateLabel}</p>
      {diag.error && (
        <div className="space-y-0.5">
          <p className="font-mono text-[10px] text-red-400 break-all">{diag.error}</p>
          {diag.code    && <p className="font-mono text-[10px] text-red-500">code: {diag.code}</p>}
          {diag.hint    && <p className="font-mono text-[10px] text-red-500">hint: {diag.hint}</p>}
          {diag.details && <p className="font-mono text-[10px] text-red-500">details: {diag.details}</p>}
        </div>
      )}
    </div>
  );
}

function MiniCard({ label, value, color, loading, highlight }: {
  label: string; value: number; color: string; loading?: boolean; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border ${highlight && value > 0 ? "border-red-500/30 bg-red-950/20" : "border-slate-800 bg-slate-900/60"} px-5 py-4`}>
      <p className="text-xs text-slate-500">{label}</p>
      {loading
        ? <p className="mt-1 text-2xl font-bold text-slate-700">…</p>
        : <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      }
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const bar  = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  const text = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`tabular-nums font-bold text-[11px] w-6 text-right ${text}`}>{score}</span>
      <div className="h-1.5 w-14 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap">
      {children}
    </th>
  );
}
