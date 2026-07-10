"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { WorkflowTaskPanel } from "@/components/WorkflowTaskPanel";

interface JobRow {
  job_reference:    string;
  service_provider: string;
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
  | { status: "success"; jobs: JobRow[] };

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

export default function CustomerDashboard() {
  const { profile } = useAuth();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("secured_jobs")
      .select(
        "job_reference, service_provider, service_type, route, currency, job_value, payment_status, job_status, current_milestone",
      )
      .eq("customer_company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setState({ status: "error", message: error.message });
        else setState({ status: "success", jobs: (data as JobRow[]) ?? [] });
      });
  }, [profile]);

  const jobs           = state.status === "success" ? state.jobs : [];
  const totalValue     = jobs.reduce((s, j) => s + Number(j.job_value), 0);
  const actionRequired = jobs.filter(
    (j) =>
      j.job_status === "Awaiting Customer Acceptance" ||
      j.job_status === "Awaiting Deposit" ||
      j.payment_status === "Balance Pending",
  ).length;
  const inProgress = jobs.filter(
    (j) => j.job_status === "In Progress" || j.job_status === "Delivered",
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
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">
              Customer
            </span>
            <Link href="/customer/inquiries" className="hover:text-slate-100 transition-colors">Inquiries</Link>
            <Link href="/customer/quotations" className="hover:text-slate-100 transition-colors">Quotations</Link>
            <Link href="/customer/jobs" className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <Link href="/customer/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
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
            assignedRole="customer"
            companyId={profile?.company_id}
            compact={false}
            maxItems={10}
          />
        </div>

        {/* Identity card */}
        <div className="mb-8 flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-lg text-emerald-400">
            ◉
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-100">{profile?.company_name ?? "—"}</p>
            <p className="text-xs text-slate-500 truncate">{profile?.full_name} · Customer</p>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-50">My Secured Jobs</h1>
          <p className="mt-1 text-sm text-slate-400">
            {state.status === "success"
              ? `${jobs.length} job${jobs.length !== 1 ? "s" : ""} · ${formatValue(totalValue, "RM")} total committed value`
              : state.status === "loading"
              ? "Loading your jobs…"
              : "Error loading data"}
          </p>
        </div>

        {/* Action required banner */}
        {state.status === "success" && actionRequired > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
            <span className="mt-0.5 text-base">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">
                {actionRequired} job{actionRequired > 1 ? "s" : ""} need{actionRequired === 1 ? "s" : ""} your attention
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Review your jobs and take action — accept terms or submit payment to keep things moving.
              </p>
            </div>
            <Link
              href="/customer/jobs"
              className="shrink-0 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              Review →
            </Link>
          </div>
        )}

        {state.status === "loading" && (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
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
            <div className="mb-10 grid gap-4 sm:grid-cols-3">
              <StatCard label="Action Required" value={actionRequired} color="text-amber-400" highlight={actionRequired > 0} />
              <StatCard label="In Transit"      value={inProgress}    color="text-blue-400" />
              <StatCard label="Completed"       value={completed}     color="text-emerald-400" />
            </div>

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">Recent Jobs</h2>
              <Link href="/customer/jobs" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                View all →
              </Link>
            </div>

            {jobs.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
                <p className="text-sm text-slate-400">No secured jobs assigned yet.</p>
                <p className="mt-1 text-xs text-slate-600">
                  Jobs created for {profile?.company_name} by service providers will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                      <th className="px-4 py-3">Job Ref</th>
                      <th className="px-4 py-3">Provider</th>
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
                      const needsAction =
                        job.job_status === "Awaiting Customer Acceptance" ||
                        job.job_status === "Awaiting Deposit" ||
                        job.payment_status === "Balance Pending";
                      return (
                        <tr
                          key={job.job_reference}
                          className={`transition-colors hover:bg-slate-900 ${needsAction ? "bg-amber-500/5" : "bg-slate-900/40"}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                            <Link
                              href={`/customer/jobs/${job.job_reference}`}
                              className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
                            >
                              {job.job_reference}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{job.service_provider}</td>
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
    <div className={`rounded-xl border bg-slate-900 p-5 ${highlight ? "border-amber-500/30" : "border-slate-800"}`}>
      <p className="mb-2 text-xs text-slate-500">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
