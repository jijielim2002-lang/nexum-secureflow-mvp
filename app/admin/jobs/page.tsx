"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  job_reference:    string;
  service_provider: string;
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
  "Cancelled":                    "text-slate-500",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminJobsPage() {
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    supabase
      .from("secured_jobs")
      .select("job_reference, service_provider, customer, service_type, route, currency, job_value, payment_status, job_status, current_milestone, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setState({ status: "error", message: error.message });
        } else {
          setState({ status: "success", jobs: (data as JobRow[]) ?? [] });
        }
      });
  }, []);

  // ── Derived summary counts (only when data is ready) ────────────────────────
  const jobs    = state.status === "success" ? state.jobs : [];
  const pending   = jobs.filter((j) => j.payment_status === "Payment Pending").length;
  const confirmed = jobs.filter((j) => j.payment_status === "Deposit Confirmed").length;
  const fullyPaid = jobs.filter((j) => j.payment_status === "Fully Paid").length;
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
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">
              Admin
            </span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/demo-checklist" className="hover:text-slate-100 transition-colors">Checklist</Link>
            <Link href="/admin/pilot-demo-script" className="hover:text-slate-100 transition-colors">Demo Script</Link>
            <Link href="/admin/pilot-readiness" className="hover:text-slate-100 transition-colors">Readiness</Link>
            <Link href="/admin/demo-reset" className="hover:text-amber-300 text-amber-500/70 transition-colors">Demo Reset</Link>
            <Link href="/admin/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">

        {/* ── Heading ── */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">All Secured Jobs</h1>
            <p className="mt-1 text-sm text-slate-400">
              {state.status === "loading" && "Loading from Supabase…"}
              {state.status === "error"   && "Error loading jobs"}
              {state.status === "success" && (
                <>
                  {jobs.length} job{jobs.length !== 1 ? "s" : ""} ·{" "}
                  {formatValue(totalValue, "RM")} total platform value
                </>
              )}
            </p>
          </div>

          {/* Payment status chips — only shown when data is ready */}
          {state.status === "success" && (
            <div className="hidden sm:flex flex-wrap gap-2 text-xs">
              {([
                ["Payment Pending",   pending],
                ["Deposit Confirmed", confirmed],
                ["Fully Paid",        fullyPaid],
              ] as [string, number][]).map(([label, count]) => (
                <span key={label} className={`rounded-full border px-3 py-1 font-medium ${paymentColors[label]}`}>
                  {label} ({count})
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Loading ── */}
        {state.status === "loading" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-20 text-center">
            <div className="mb-4 inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Fetching jobs from Supabase…</p>
          </div>
        )}

        {/* ── Error ── */}
        {state.status === "error" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
              <p className="mb-1 text-sm font-semibold text-red-300">Failed to load jobs</p>
              <p className="font-mono text-xs text-red-400">{state.message}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-400">Possible causes:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>The <code className="text-slate-300">secured_jobs</code> table does not exist — run the schema migration first</li>
                <li>Row Level Security is blocking the read — add a permissive <code className="text-slate-300">SELECT</code> policy or disable RLS temporarily</li>
                <li>Env vars changed — restart the dev server after editing <code className="text-slate-300">.env.local</code></li>
              </ul>
            </div>
          </div>
        )}

        {/* ── Success: jobs table ── */}
        {state.status === "success" && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Job Reference</th>
                  <th className="px-4 py-3">Service Provider</th>
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
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-slate-600">
                      No jobs on the platform yet.
                    </td>
                  </tr>
                )}
                {jobs.map((job) => (
                  <tr key={job.job_reference} className="bg-slate-900/40 hover:bg-slate-900 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      <Link
                        href={`/admin/jobs/${job.job_reference}`}
                        className="text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
                      >
                        {job.job_reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                      {job.service_provider}
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
                ))}
              </tbody>
              {jobs.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-800 bg-slate-900 text-xs text-slate-500">
                    <td colSpan={5} className="px-4 py-3 font-medium">Platform total</td>
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
