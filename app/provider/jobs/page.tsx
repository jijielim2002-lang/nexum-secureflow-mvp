"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  created_at:       string;
}

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; jobs: JobRow[] };

// ─── Colour maps ──────────────────────────────────────────────────────────────

const paymentColors: Record<string, string> = {
  "Payment Pending":            "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Proof Uploaded":     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Confirmed":          "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Balance Pending":            "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Balance Proof Uploaded":     "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Payment Proof Uploaded":     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fully Paid":                 "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                   "bg-red-500/15 text-red-400 border-red-500/30",
  "Refunded":                   "bg-slate-500/15 text-slate-400 border-slate-500/30",
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatValue(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProviderJobsPage() {
  const { profile } = useAuth();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!profile) return;

    supabase
      .from("secured_jobs")
      .select(
        "job_reference, customer, service_type, route, currency, job_value, payment_status, job_status, current_milestone, created_at",
      )
      .eq("service_provider_company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setState({ status: "error", message: error.message });
        } else {
          setState({ status: "success", jobs: (data as JobRow[]) ?? [] });
        }
      });
  }, [profile]);

  const jobs       = state.status === "success" ? state.jobs : [];
  const totalValue = jobs.reduce((s, j) => s + Number(j.job_value), 0);

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
            <Link href="/provider" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/provider/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">My Jobs</h1>
            <p className="mt-1 text-sm text-slate-400">
              {profile?.company_name} ·{" "}
              {state.status === "loading" && "Loading from Supabase…"}
              {state.status === "error"   && "Error loading jobs"}
              {state.status === "success" && (
                <>
                  {jobs.length} job{jobs.length !== 1 ? "s" : ""} ·{" "}
                  {formatValue(totalValue, "RM")} total value
                </>
              )}
            </p>
          </div>
          <Link
            href="/provider/create-from-documents"
            className="shrink-0 rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-500/25 transition-colors"
          >
            + Create Job from Docs
          </Link>
        </div>

        {/* Loading */}
        {state.status === "loading" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-20 text-center">
            <div className="mb-4 inline-block h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Fetching jobs…</p>
          </div>
        )}

        {/* Error */}
        {state.status === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to load jobs</p>
            <p className="font-mono text-xs text-red-400">{state.message}</p>
          </div>
        )}

        {/* Jobs table */}
        {state.status === "success" && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Job Reference</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Service Type</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3 text-right">Job Value</th>
                  <th className="px-4 py-3">Payment Status</th>
                  <th className="px-4 py-3">Job Status</th>
                  <th className="px-4 py-3">Current Milestone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-600">
                      No jobs found for {profile?.company_name}
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.job_reference} className="bg-slate-900/40 hover:bg-slate-900 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        <Link
                          href={`/provider/jobs/${job.job_reference}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
                        >
                          {job.job_reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                        {job.customer}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {job.service_type}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {job.route}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-100 tabular-nums whitespace-nowrap">
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
                      <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                        {job.current_milestone}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {jobs.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-800 bg-slate-900 text-xs text-slate-500">
                    <td colSpan={4} className="px-4 py-3 font-medium">Total value</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-200 tabular-nums">
                      {formatValue(totalValue, "RM")}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
