"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { PilotBanner } from "@/components/PilotBanner";
import { AdminNav } from "@/components/AdminNav";
import { WorkflowTaskPanel } from "@/components/WorkflowTaskPanel";
import { DeploymentEnvBanner } from "@/components/DeploymentEnvBanner";

// ─── Config ───────────────────────────────────────────────────────────────────

const SECTION_TIMEOUT_MS = 8_000;
const CORE_MODE_DELAY_MS = 10_000;

// ─── Timeout helper ───────────────────────────────────────────────────────────
// Supabase builders are PromiseLike (have .then) but are not full Promises.
// Promise.resolve(p) wraps them into a real Promise for Promise.race.

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  job_reference:     string;
  service_provider:  string;
  customer:          string;
  currency:          string;
  job_value:         number;
  payment_status:    string;
  job_status:        string;
  current_milestone: string;
  created_at:        string;
}

interface MembershipRow {
  status:     string;
  annual_fee: number | null;
  used_jobs:  number;
}

interface AuditRow {
  id:            string;
  job_reference: string | null;
  actor_role:    string;
  actor_name:    string;
  description:   string;
  created_at:    string;
}

type SectionStatus = "loading" | "ok" | "error" | "timeout";

// ─── Colour maps ──────────────────────────────────────────────────────────────

const PAYMENT_COLOR: Record<string, string> = {
  "Payment Pending":        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Proof Uploaded": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Confirmed":      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Balance Pending":        "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Balance Proof Uploaded": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Payment Proof Uploaded": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fully Paid":             "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":               "bg-red-500/15 text-red-400 border-red-500/30",
};

const JOB_STATUS_COLOR: Record<string, string> = {
  "Awaiting Customer Acceptance":  "text-amber-400",
  "Awaiting Deposit":              "text-amber-400",
  "Awaiting Deposit Confirmation": "text-amber-400",
  "Ready for Execution":           "text-blue-400",
  "In Progress":                   "text-blue-400",
  "Delivered":                     "text-purple-400",
  "Completed":                     "text-emerald-400",
  "Disputed":                      "text-red-400",
  "Cancelled":                     "text-slate-500",
};

const ROLE_COLOR: Record<string, string> = {
  admin:    "text-blue-400",
  provider: "text-purple-400",
  customer: "text-emerald-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile, isBypass } = useAuth();
  const [nexumRole, setNexumRole] = useState<string | null>(null);

  // Fetch nexum_role from server-side profile
  useEffect(() => {
    try {
      const stored = localStorage.getItem("supabase.auth.token");
      const token  = stored ? ((JSON.parse(stored) as { access_token?: string }).access_token ?? "") : "";
      if (!token) return;
      fetch("/api/auth/profile", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((j: { nexum_role?: string }) => setNexumRole(j.nexum_role ?? null))
        .catch(() => {});
    } catch { /* ignore */ }
  }, []);

  // ── Jobs (drives stats + recent jobs table) ────────────────────────────────
  const [jobStatus, setJobStatus] = useState<SectionStatus>("loading");
  const [jobError,  setJobError]  = useState<string | null>(null);
  const [jobs,      setJobs]      = useState<JobRow[]>([]);

  // ── Audit log ──────────────────────────────────────────────────────────────
  const [auditStatus, setAuditStatus] = useState<SectionStatus>("loading");
  const [auditError,  setAuditError]  = useState<string | null>(null);
  const [logs,        setLogs]        = useState<AuditRow[]>([]);

  // ── Memberships ────────────────────────────────────────────────────────────
  const [memStatus,   setMemStatus]   = useState<SectionStatus>("loading");
  const [memError,    setMemError]    = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);

  // ── Core-mode fallback (10s) ───────────────────────────────────────────────
  const [coreMode, setCoreMode] = useState(false);

  // ── Section loaders ────────────────────────────────────────────────────────

  const loadJobs = useCallback(async () => {
    setJobStatus("loading");
    setJobError(null);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("secured_jobs")
          .select(
            "job_reference, service_provider, customer, currency, job_value, " +
            "payment_status, job_status, current_milestone, created_at",
          )
          .order("created_at", { ascending: false }),
        SECTION_TIMEOUT_MS,
      );
      if (error) {
        console.warn("[Dashboard] secured_jobs:", error.message);
        setJobError(error.message);
        setJobStatus("error");
      } else {
        setJobs((data ?? []) as unknown as JobRow[]);
        setJobStatus("ok");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[Dashboard] loadJobs:", msg);
      setJobError(msg);
      setJobStatus(msg.startsWith("Timed out") ? "timeout" : "error");
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditStatus("loading");
    setAuditError(null);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("audit_logs")
          .select("id, job_reference, actor_role, actor_name, description, created_at")
          .order("created_at", { ascending: false })
          .limit(8),
        SECTION_TIMEOUT_MS,
      );
      if (error) {
        console.warn("[Dashboard] audit_logs:", error.message);
        setAuditError(error.message);
        setAuditStatus("error");
      } else {
        setLogs((data ?? []) as unknown as AuditRow[]);
        setAuditStatus("ok");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[Dashboard] loadAudit:", msg);
      setAuditError(msg);
      setAuditStatus(msg.startsWith("Timed out") ? "timeout" : "error");
    }
  }, []);

  const loadMemberships = useCallback(async () => {
    setMemStatus("loading");
    setMemError(null);
    try {
      const { data, error } = await withTimeout(
        supabase.from("memberships").select("status, annual_fee, used_jobs"),
        SECTION_TIMEOUT_MS,
      );
      if (error) {
        console.warn("[Dashboard] memberships:", error.message);
        setMemError(error.message);
        setMemStatus("error");
      } else {
        setMemberships((data ?? []) as unknown as MembershipRow[]);
        setMemStatus("ok");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[Dashboard] loadMemberships:", msg);
      setMemError(msg);
      setMemStatus(msg.startsWith("Timed out") ? "timeout" : "error");
    }
  }, []);

  // ── Mount: kick off all three independently; start 10s core-mode timer ─────
  useEffect(() => {
    void loadJobs();
    void loadAudit();
    void loadMemberships();

    const tid = setTimeout(() => setCoreMode(true), CORE_MODE_DELAY_MS);
    return () => clearTimeout(tid);
  }, [loadJobs, loadAudit, loadMemberships]);

  // Clear core-mode once primary data arrives
  useEffect(() => {
    if (jobStatus === "ok") setCoreMode(false);
  }, [jobStatus]);

  // ── Derived stats (safe — show 0 while loading) ────────────────────────────
  const awaitingVerify = jobs.filter(
    (j) => j.payment_status === "Deposit Proof Uploaded" ||
            j.payment_status === "Balance Proof Uploaded",
  ).length;
  const activeJobs  = jobs.filter(
    (j) => j.job_status === "In Progress" || j.job_status === "Ready for Execution",
  ).length;
  const completed   = jobs.filter((j) => j.job_status === "Completed").length;
  const totalValue  = jobs.reduce((s, j) => s + Number(j.job_value), 0);

  const activeMem   = memberships.filter((m) => m.status === "Active").length;
  const trialMem    = memberships.filter((m) => m.status === "Trial").length;
  const expiredMem  = memberships.filter(
    (m) => m.status === "Expired" || m.status === "Suspended",
  ).length;
  const totalAnnual = memberships.reduce((s, m) => s + (m.annual_fee ?? 0), 0);
  const totalMemJobs = memberships.reduce((s, m) => s + m.used_jobs, 0);

  const jobsLoading  = jobStatus  === "loading";
  const memLoading   = memStatus  === "loading";
  const auditLoading = auditStatus === "loading";

  // ── Render ─────────────────────────────────────────────────────────────────
  // Shell always renders immediately. Each section handles its own loading/error state.

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <AdminNav currentPage="dashboard" />
      <PilotBanner />
      <DeploymentEnvBanner />

      {/* Bypass RLS warning — shown when bypass mode active */}
      {isBypass && (
        <div role="alert" className="border-b border-amber-600/30 bg-amber-950/30 px-6 py-2">
          <p className="text-xs text-amber-400">
            <span className="font-semibold">Bypass mode active.</span>{" "}
            Some RLS-protected data may be unavailable — browser queries run as anon without a real session.
            Run{" "}
            <code className="rounded bg-amber-950/60 px-1 py-0.5 font-mono text-[10px]">
              021_seed_admin_profile.sql
            </code>{" "}
            to seed your profiles row and fix this permanently.
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-6 py-10">

        {/* ── Workflow Tasks ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <WorkflowTaskPanel
            assignedRole="admin"
            showGenerateButton={true}
            compact={false}
            maxItems={10}
          />
        </div>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-50">Admin Control Tower</h1>
            {nexumRole && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                nexumRole === "super_admin"    ? "bg-red-500/15 text-red-300 border-red-500/30"      :
                nexumRole === "admin"          ? "bg-blue-500/15 text-blue-300 border-blue-500/30"   :
                nexumRole === "operations"     ? "bg-teal-500/15 text-teal-300 border-teal-500/30"   :
                nexumRole === "finance_reviewer" ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" :
                "bg-zinc-700 text-zinc-400"
              }`}>
                {nexumRole.replace("_", " ")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {profile?.full_name && `${profile.full_name} · `}
            {jobsLoading
              ? "Loading platform data…"
              : jobStatus === "ok"
                ? `${jobs.length} job${jobs.length !== 1 ? "s" : ""} · RM ${totalValue.toLocaleString("en-MY", { maximumFractionDigits: 0 })} total secured`
                : "Platform data unavailable"}
          </p>
        </div>

        {/* ── Role-aware quick actions ───────────────────────────────────────── */}
        {nexumRole && (
          <div className="mb-8 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">
              Quick Access — {nexumRole === "super_admin" ? "Super Admin" : nexumRole === "admin" ? "Admin" : nexumRole === "operations" ? "Operations" : nexumRole === "finance_reviewer" ? "Finance Reviewer" : "Viewer"}
            </p>
            <div className="flex flex-wrap gap-3">
              {/* Super Admin only */}
              {(nexumRole === "super_admin") && (
                <>
                  <Link href="/admin/platform-settings" className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 px-3 py-2 rounded-lg transition">
                    ⚙️ Platform Settings
                  </Link>
                  <Link href="/admin/fee-rules" className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 px-3 py-2 rounded-lg transition">
                    💰 Fee Rules
                  </Link>
                </>
              )}
              {/* Admin + Super Admin */}
              {(nexumRole === "super_admin" || nexumRole === "admin") && (
                <>
                  <Link href="/admin/companies" className="text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 px-3 py-2 rounded-lg transition">
                    🏢 Companies
                  </Link>
                  <Link href="/admin/users" className="text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 px-3 py-2 rounded-lg transition">
                    👥 Users
                  </Link>
                  <Link href="/admin/extraction-review" className="text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 px-3 py-2 rounded-lg transition">
                    🧠 AI Review
                  </Link>
                  <Link href="/admin/counterparty-mappings" className="text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 px-3 py-2 rounded-lg transition">
                    🔒 Masking
                  </Link>
                </>
              )}
              {/* Operations */}
              {(nexumRole === "super_admin" || nexumRole === "admin" || nexumRole === "operations") && (
                <>
                  <Link href="/admin/jobs" className="text-xs bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-300 px-3 py-2 rounded-lg transition">
                    📦 Jobs
                  </Link>
                  <Link href="/admin/delivery-confirmations" className="text-xs bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-300 px-3 py-2 rounded-lg transition">
                    ✅ Deliveries
                  </Link>
                  <Link href="/admin/exceptions" className="text-xs bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-300 px-3 py-2 rounded-lg transition">
                    ⚠️ Exceptions
                  </Link>
                </>
              )}
              {/* Finance Reviewer */}
              {(nexumRole === "super_admin" || nexumRole === "admin" || nexumRole === "finance_reviewer") && (
                <>
                  <Link href="/admin/payment-operations" className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 px-3 py-2 rounded-lg transition">
                    💳 Payments
                  </Link>
                  <Link href="/admin/capital-readiness" className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 px-3 py-2 rounded-lg transition">
                    📊 Financeability
                  </Link>
                  <Link href="/admin/accounting-exports" className="text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 px-3 py-2 rounded-lg transition">
                    📤 Exports
                  </Link>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Core-mode fallback banner ───────────────────────────────────────── */}
        {coreMode && jobStatus !== "ok" && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-950/20 px-5 py-4">
            <p className="text-sm font-semibold text-amber-300">Core Dashboard Mode</p>
            <p className="mt-1 text-xs text-amber-500/80">
              Platform data is taking longer than expected.
              {isBypass
                ? " Bypass mode has no real Supabase session — queries run as anon and may be blocked by RLS."
                : " Supabase may be cold-starting. Click Retry below or navigate directly."}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <Link href="/admin/jobs"         className="text-blue-400 hover:text-blue-300">Open Jobs →</Link>
              <Link href="/admin/companies"    className="text-blue-400 hover:text-blue-300">Companies →</Link>
              <Link href="/admin/users"        className="text-blue-400 hover:text-blue-300">Users →</Link>
              <Link href="/admin/memberships"  className="text-blue-400 hover:text-blue-300">Memberships →</Link>
            </div>
            <button
              onClick={() => { void loadJobs(); void loadAudit(); void loadMemberships(); }}
              className="mt-3 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              Retry All
            </button>
          </div>
        )}

        {/* ── Jobs error banner (inline, non-blocking) ────────────────────────── */}
        {(jobStatus === "error" || jobStatus === "timeout") && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-950/10 px-5 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-300">
                {jobStatus === "timeout" ? "Jobs data timed out" : "Jobs data unavailable"}
              </p>
              <p className="mt-0.5 font-mono text-xs text-amber-600 break-all">{jobError}</p>
            </div>
            <button
              onClick={() => void loadJobs()}
              className="shrink-0 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Action-required banner ──────────────────────────────────────────── */}
        {awaitingVerify > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">
                {awaitingVerify} payment proof{awaitingVerify > 1 ? "s" : ""} awaiting verification
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Review submitted proofs and verify to keep jobs moving.
              </p>
            </div>
            <Link
              href="/admin/jobs"
              className="shrink-0 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              Review →
            </Link>
          </div>
        )}

        {/* ── Stat cards — always render; show "…" while loading ─────────────── */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Secured Jobs"    value={jobs.length}   color="text-slate-100"   loading={jobsLoading} />
          <StatCard label="Awaiting Verification" value={awaitingVerify} color="text-amber-400"   loading={jobsLoading} highlight={awaitingVerify > 0} />
          <StatCard label="Active / In Progress"  value={activeJobs}    color="text-blue-400"    loading={jobsLoading} />
          <StatCard label="Completed Jobs"        value={completed}     color="text-emerald-400" loading={jobsLoading} />
        </div>

        {/* ── Memberships ─────────────────────────────────────────────────────── */}
        {(memStatus === "error" || memStatus === "timeout") ? (
          <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-3 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Memberships {memStatus === "timeout" ? "timed out" : "unavailable"}
              {memError ? ` — ${memError}` : ""}
            </p>
            <button
              onClick={() => void loadMemberships()}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <Link
            href="/admin/memberships"
            className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 hover:border-slate-700 transition-colors block"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-semibold text-slate-400">Memberships</span>
              <span className="text-xs text-slate-600">View all →</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <MemCell label="Active"            value={activeMem}   color="text-emerald-400" loading={memLoading} />
              <MemCell label="Trial"             value={trialMem}    color="text-amber-400"   loading={memLoading} />
              <MemCell label="Expired/Suspended" value={expiredMem}  color={expiredMem > 0 ? "text-red-400" : "text-slate-500"} loading={memLoading} highlight={expiredMem > 0} />
              <div className="rounded-lg bg-slate-800/60 px-3 py-2.5">
                <p className="text-xs text-slate-500 mb-0.5">Annual Value</p>
                <p className="text-sm font-bold text-slate-200 tabular-nums">
                  {memLoading ? "…" : totalAnnual > 0 ? `RM ${totalAnnual.toLocaleString()}` : "—"}
                </p>
              </div>
              <MemCell label="Jobs Used" value={totalMemJobs} color="text-slate-200" loading={memLoading} />
            </div>
          </Link>
        )}

        {/* ── Quick-access links (static, always visible) ─────────────────────── */}
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/users"
            className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 hover:border-blue-500/30 hover:bg-slate-900 transition-colors"
          >
            <span className="text-2xl">👥</span>
            <div>
              <p className="text-sm font-semibold text-slate-200">Pilot Users</p>
              <p className="text-xs text-slate-500 mt-0.5">Manage accounts, roles &amp; company assignments</p>
            </div>
            <span className="ml-auto text-xs text-slate-600">→</span>
          </Link>
          <Link
            href="/admin/companies/new"
            className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 hover:border-blue-500/30 hover:bg-slate-900 transition-colors"
          >
            <span className="text-2xl">🏢</span>
            <div>
              <p className="text-sm font-semibold text-slate-200">+ New Company</p>
              <p className="text-xs text-slate-500 mt-0.5">Onboard a service provider or customer company</p>
            </div>
            <span className="ml-auto text-xs text-slate-600">→</span>
          </Link>
          <Link
            href="/admin/companies"
            className="flex items-center gap-4 rounded-xl border border-purple-500/30 bg-purple-500/5 px-5 py-4 hover:border-purple-500/50 hover:bg-purple-500/10 transition-colors"
          >
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-sm font-semibold text-purple-200">Company Intelligence</p>
              <p className="text-xs text-purple-500/70 mt-0.5">Scores · Risk · Financeability · Reports</p>
            </div>
            <span className="ml-auto text-xs text-purple-600">→</span>
          </Link>
        </div>

        {/* ── Recent jobs + Activity feed ──────────────────────────────────────── */}
        <div className="grid gap-8 lg:grid-cols-3">

          {/* Recent jobs */}
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">Recent Jobs</h2>
              <Link href="/admin/jobs" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                View all →
              </Link>
            </div>

            {jobsLoading ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                <p className="flex items-center justify-center gap-2 text-xs text-slate-600">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                  Loading jobs…
                </p>
              </div>
            ) : jobStatus === "error" || jobStatus === "timeout" ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                <p className="text-xs text-slate-500">
                  Jobs {jobStatus === "timeout" ? "timed out" : "unavailable"}
                </p>
                <button
                  onClick={() => void loadJobs()}
                  className="mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
                <p className="text-sm text-slate-500">No jobs on the platform yet.</p>
                <p className="mt-1 text-xs text-slate-600">Jobs created by service providers will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                      <th className="px-4 py-3">Job Ref</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3 text-right">Value</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {jobs.slice(0, 6).map((job) => (
                      <tr key={job.job_reference} className="bg-slate-900/40 hover:bg-slate-900 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">
                          <Link
                            href={`/admin/jobs/${job.job_reference}`}
                            className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
                          >
                            {job.job_reference}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{job.service_provider}</td>
                        <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{job.customer}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-100 tabular-nums text-xs whitespace-nowrap">
                          {job.currency} {new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(Number(job.job_value))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PAYMENT_COLOR[job.payment_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                            {job.payment_status}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${JOB_STATUS_COLOR[job.job_status] ?? "text-slate-400"}`}>
                          {job.job_status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div>
            <h2 className="mb-4 text-sm font-semibold text-slate-300">Recent Activity</h2>

            {auditLoading ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 py-10 text-center">
                <p className="text-xs text-slate-600 animate-pulse">Loading activity…</p>
              </div>
            ) : auditStatus === "error" || auditStatus === "timeout" ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 py-8 text-center">
                <p className="text-xs text-slate-500">
                  Activity {auditStatus === "timeout" ? "timed out" : "unavailable"}
                </p>
                {auditError && <p className="mt-1 font-mono text-[10px] text-slate-700 break-all px-3">{auditError}</p>}
                <button
                  onClick={() => void loadAudit()}
                  className="mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 py-10 text-center">
                <p className="text-xs text-slate-600">No activity recorded yet.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                {logs.map((log) => (
                  <div key={log.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${ROLE_COLOR[log.actor_role] ?? "text-slate-400"}`}>
                        {log.actor_role}
                      </span>
                      {log.job_reference && (
                        <Link
                          href={`/admin/jobs/${log.job_reference}`}
                          className="font-mono text-xs text-slate-600 hover:text-slate-400 transition-colors"
                        >
                          {log.job_reference}
                        </Link>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-snug">{log.description}</p>
                    <p className="mt-1 text-xs text-slate-600">{log.created_at.slice(0, 16).replace("T", " ")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color, loading = false, highlight = false }: {
  label: string; value: number; color: string; loading?: boolean; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-slate-900 p-5 ${highlight ? "border-amber-500/30" : "border-slate-800"}`}>
      <p className="mb-2 text-xs text-slate-500">{label}</p>
      {loading
        ? <p className="text-3xl font-bold text-slate-700">…</p>
        : <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      }
    </div>
  );
}

function MemCell({ label, value, color, loading, highlight }: {
  label: string; value: number; color: string; loading: boolean; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? "bg-red-500/10" : "bg-slate-800/60"}`}>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{loading ? "…" : value}</p>
    </div>
  );
}
