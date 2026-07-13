"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { WorkflowTaskPanel } from "@/components/WorkflowTaskPanel";
import { ProviderBenchmarkCard } from "@/components/ProviderBenchmarkCard";

interface MembershipRow {
  plan:          string;
  status:        string;
  annual_fee:    number | null;
  included_jobs: number | null;
  used_jobs:     number;
  end_date:      string | null;
}

interface JobRow {
  job_reference:    string;
  customer:         string;
  service_type:     string;
  route:            string;
  currency:         string;
  job_value:        number;
  payment_status:   string;
  job_status:       string;
  current_milestone: string;
}

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; jobs: JobRow[]; membership: MembershipRow | null };

const paymentColors: Record<string, string> = {
  "Payment Pending":        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Proof Uploaded": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Confirmed":      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Balance Pending":        "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Balance Proof Uploaded": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Payment Proof Uploaded": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fully Paid":             "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":               "bg-red-500/15 text-red-400 border-red-500/30",
};

const jobStatusColors: Record<string, string> = {
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

function formatValue(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export default function ProviderDashboard() {
  const { profile } = useAuth();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!profile) return;
    async function load() {
      try {
        let token = "";
        try {
          const stored = localStorage.getItem("supabase.auth.token");
          if (stored) token = (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
        } catch { /* ignore */ }

        const res = await fetch("/api/provider/jobs", {
          headers: { Authorization: "Bearer " + token },
        });
        const json = await res.json() as { ok?: boolean; jobs?: JobRow[]; membership?: MembershipRow | null; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Failed to load");
        setState({
          status: "success",
          jobs: json.jobs ?? [],
          membership: json.membership ?? null,
        });
      } catch (e) {
        setState({ status: "error", message: e instanceof Error ? e.message : "Unknown error" });
      }
    }
    load();
  }, [profile]);

  const jobs          = state.status === "success" ? state.jobs : [];
  const membership    = state.status === "success" ? state.membership : null;
  const totalValue    = jobs.reduce((s, j) => s + Number(j.job_value), 0);
  const readyToExecute  = jobs.filter((j) => j.job_status === "Ready for Execution").length;
  const inProgress      = jobs.filter((j) => j.job_status === "In Progress" || j.job_status === "Delivered").length;
  const awaitingDeposit = jobs.filter(
    (j) => j.job_status === "Awaiting Deposit" || j.job_status === "Awaiting Customer Acceptance",
  ).length;
  const completed = jobs.filter((j) => j.job_status === "Completed").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">
              Provider
            </span>
            <Link href="/provider/quotations"         className="hover:text-slate-100 transition-colors">Quotations</Link>
            <Link href="/provider/jobs"               className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <Link href="/provider/customer-insights"  className="hover:text-slate-100 transition-colors">Customer Insights</Link>
            <Link href="/provider/membership" className="hover:text-slate-100 transition-colors">Membership</Link>
            <Link href="/provider/payout-profile" className="hover:text-slate-100 transition-colors">Payout Profile</Link>
            <Link href="/provider/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <PilotBanner />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* ── Workflow Tasks ── */}
        <div className="mb-8">
          <WorkflowTaskPanel
            assignedRole="service_provider"
            companyId={profile?.company_id}
            compact={false}
            maxItems={10}
          />
        </div>

        {/* ── My Performance Benchmark ── */}
        {profile?.company_id && (
          <div className="mb-8">
            <ProviderBenchmarkCard
              companyId={profile.company_id}
              companyName={profile.company_name ?? undefined}
              showRecalc={false}
            />
          </div>
        )}

        {/* Identity card */}
        <div className="mb-8 flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-lg text-purple-400">
            ◈
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-100">{profile?.company_name ?? "—"}</p>
            <p className="text-xs text-slate-500 truncate">{profile?.full_name} · Service Provider</p>
          </div>
          <Link
            href="/provider/jobs/new"
            className="shrink-0 rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 transition-colors"
          >
            + Create Secured Job
          </Link>
        </div>

        {/* Membership card */}
        {membership && <MembershipCard membership={membership} />}

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-50">Provider Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {state.status === "success"
              ? `${jobs.length} job${jobs.length !== 1 ? "s" : ""} · ${formatValue(totalValue, "RM")} total secured value`
              : state.status === "loading"
              ? "Loading your jobs…"
              : "Error loading data"}
          </p>
        </div>

        {/* Ready-to-execute banner */}
        {state.status === "success" && readyToExecute > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4">
            <span className="mt-0.5 text-base">🚚</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-300">
                {readyToExecute} job{readyToExecute > 1 ? "s" : ""} ready for pickup
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Deposit confirmed. You can now proceed with pickup.</p>
            </div>
            <Link
              href="/provider/jobs"
              className="shrink-0 rounded-lg border border-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/10 transition-colors"
            >
              View jobs →
            </Link>
          </div>
        )}

        {state.status === "loading" && (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to load jobs</p>
            <p className="font-mono text-xs text-red-400">{state.message}</p>
          </div>
        )}

        {state.status === "success" && (
          <>
            {/* Stats */}
            <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Ready to Execute"  value={readyToExecute}  color="text-blue-400"    highlight={readyToExecute > 0} />
              <StatCard label="In Transit"        value={inProgress}      color="text-blue-400" />
              <StatCard label="Awaiting Deposit"  value={awaitingDeposit} color="text-amber-400" />
              <StatCard label="Completed"         value={completed}       color="text-emerald-400" />
            </div>

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">Recent Jobs</h2>
              <Link href="/provider/jobs" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                View all →
              </Link>
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
                <p className="text-sm text-slate-400">No secured jobs yet.</p>
                <p className="mt-2 text-xs text-slate-600">Create your first secured job to get started.</p>
                <Link
                  href="/provider/jobs/new"
                  className="mt-4 inline-block rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 transition-colors"
                >
                  + Create Secured Job
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                      <th className="px-4 py-3">Job Ref</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Route</th>
                      <th className="px-4 py-3 text-right">Value</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Milestone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {jobs.slice(0, 6).map((job) => {
                      const isReady = job.job_status === "Ready for Execution";
                      return (
                        <tr key={job.job_reference} className={`transition-colors hover:bg-slate-900 ${isReady ? "bg-blue-500/5" : "bg-slate-900/40"}`}>
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                            <Link
                              href={`/provider/jobs/${job.job_reference}`}
                              className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
                            >
                              {job.job_reference}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{job.customer}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{job.service_type}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{job.route}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-100 tabular-nums whitespace-nowrap text-xs">
                            {formatValue(Number(job.job_value), job.currency)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${paymentColors[job.payment_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                              {job.payment_status}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${jobStatusColors[job.job_status] ?? "text-slate-400"}`}>
                            {job.job_status}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{job.current_milestone}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Membership card ──────────────────────────────────────────────────────────

const PLAN_BADGE: Record<string, string> = {
  Basic:      "bg-slate-700/60 text-slate-300 border-slate-600/40",
  Plus:       "bg-purple-500/15 text-purple-300 border-purple-500/30",
  Enterprise: "bg-blue-500/15 text-blue-300 border-blue-500/30",
};
const STATUS_COLOR: Record<string, string> = {
  Active:    "text-emerald-400",
  Trial:     "text-amber-400",
  Expired:   "text-red-400",
  Suspended: "text-slate-500",
};

function MembershipCard({ membership }: { membership: MembershipRow }) {
  const isUnlimited = membership.included_jobs === null;
  const remaining   = isUnlimited ? null : Math.max(0, membership.included_jobs! - membership.used_jobs);
  const usedPct     = membership.included_jobs
    ? Math.min(100, Math.round((membership.used_jobs / membership.included_jobs) * 100))
    : 0;
  const atLimit   = !isUnlimited && membership.used_jobs >= membership.included_jobs!;
  const nearLimit = !isUnlimited && !atLimit && membership.used_jobs >= membership.included_jobs! * 0.8;
  const barColor  = atLimit ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="mb-6">
      {/* Alert banners */}
      {atLimit && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-3">
          <div>
            <p className="text-xs font-semibold text-red-300">Job quota reached — {membership.used_jobs}/{membership.included_jobs} jobs used</p>
            <p className="text-xs text-slate-500 mt-0.5">You have exceeded your included job quota. Additional usage may be chargeable. Contact Nexum to upgrade.</p>
          </div>
          <Link href="/provider/membership" className="shrink-0 text-xs text-red-300 hover:text-red-200 underline underline-offset-2 transition-colors whitespace-nowrap">View plan →</Link>
        </div>
      )}
      {nearLimit && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-3">
          <p className="text-xs font-semibold text-amber-300">Approaching job quota — {membership.used_jobs}/{membership.included_jobs} jobs used ({usedPct}%)</p>
          <Link href="/provider/membership" className="shrink-0 text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors whitespace-nowrap">View plan →</Link>
        </div>
      )}

      {/* Card */}
      <Link
        href="/provider/membership"
        className="flex flex-wrap items-center gap-5 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 hover:border-slate-700 transition-colors"
      >
        {/* Plan + status */}
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${PLAN_BADGE[membership.plan] ?? PLAN_BADGE.Basic}`}>
            {membership.plan}
          </span>
          <span className={`text-xs font-semibold ${STATUS_COLOR[membership.status] ?? "text-slate-400"}`}>
            {membership.status}
          </span>
        </div>

        {/* Divider */}
        <div className="hidden sm:block h-4 w-px bg-slate-700" />

        {/* Annual fee */}
        <div className="text-xs">
          <span className="text-slate-500">Annual fee </span>
          <span className="font-semibold text-slate-200 tabular-nums">
            {membership.annual_fee !== null ? `RM ${membership.annual_fee.toLocaleString()}` : "Custom"}
          </span>
        </div>

        {/* Divider */}
        <div className="hidden sm:block h-4 w-px bg-slate-700" />

        {/* Usage numbers */}
        <div className="flex items-center gap-4 text-xs">
          <span><span className="text-slate-500">Included </span><span className="font-semibold text-slate-200 tabular-nums">{isUnlimited ? "∞" : membership.included_jobs}</span></span>
          <span><span className="text-slate-500">Used </span><span className={`font-semibold tabular-nums ${atLimit ? "text-red-400" : "text-slate-200"}`}>{membership.used_jobs}</span></span>
          <span><span className="text-slate-500">Remaining </span><span className={`font-semibold tabular-nums ${remaining === 0 ? "text-red-400" : nearLimit ? "text-amber-400" : "text-emerald-400"}`}>{isUnlimited ? "∞" : remaining}</span></span>
        </div>

        {/* Progress bar */}
        {!isUnlimited && (
          <>
            <div className="hidden sm:block h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-2 min-w-[120px]">
              <div className="h-1.5 flex-1 rounded-full bg-slate-800">
                <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${usedPct}%` }} />
              </div>
              <span className="text-xs tabular-nums text-slate-500 whitespace-nowrap">{usedPct}%</span>
            </div>
          </>
        )}

        <span className="ml-auto text-xs text-slate-600 whitespace-nowrap">View membership →</span>
      </Link>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  highlight = false,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-slate-900 p-5 ${highlight ? "border-blue-500/30" : "border-slate-800"}`}>
      <p className="mb-2 text-xs text-slate-500">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
