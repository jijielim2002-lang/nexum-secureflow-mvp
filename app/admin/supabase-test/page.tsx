"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase, type SecuredJobRow } from "@/lib/supabaseClient";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; jobs: SecuredJobRow[]; durationMs: number }
  | { status: "error"; message: string; detail?: string };

export default function SupabaseTestPage() {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const t0 = performance.now();

    supabase
      .from("secured_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ status: "error", message: error.message, detail: error.details ?? error.hint ?? undefined });
        } else {
          setState({ status: "success", jobs: (data as SecuredJobRow[]) ?? [], durationMs: Math.round(performance.now() - t0) });
        }
      });

    return () => { cancelled = true; };
  }, []);

  function refetch() {
    setState({ status: "idle" });
    // brief tick so the idle state registers, then trigger useEffect re-run via key trick below
  }

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
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">All Jobs</Link>
            <Link href="/login" className="hover:text-slate-100 transition-colors">Sign out</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-300 transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-slate-400">Supabase Test</span>
        </div>

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Supabase Connection Test</h1>
            <p className="mt-1 text-sm text-slate-400">
              Live read of <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-blue-300">secured_jobs</code> from Supabase — not mock data.
            </p>
          </div>
          <RefetchButton state={state} onRefetch={() => window.location.reload()} />
        </div>

        {/* Connection info card */}
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Connection Details</p>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <Row label="Project URL" value={process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(missing)"} mono />
            <Row label="Auth"        value="anon key (public)" />
            <Row label="Table"       value="secured_jobs" mono />
            <Row label="Query"       value="SELECT * ORDER BY created_at DESC" mono />
          </div>
        </div>

        {/* Status panel */}
        <StatusPanel state={state} />
      </main>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusPanel({ state }: { state: FetchState }) {
  if (state.status === "idle") {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-center text-sm text-slate-500">
        Initialising query…
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-center">
        <div className="mb-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm text-slate-400">Querying Supabase…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-base text-red-400">✗</span>
            <p className="text-sm font-semibold text-red-300">Query failed</p>
          </div>
          <p className="font-mono text-xs text-red-400">{state.message}</p>
          {state.detail && (
            <p className="mt-1 font-mono text-xs text-slate-500">{state.detail}</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">Common causes:</p>
          <ul className="ml-4 list-disc space-y-1 text-slate-500">
            <li>The <code className="text-slate-400">secured_jobs</code> table has not been created yet — run the schema migration in Supabase SQL Editor first</li>
            <li>The <code className="text-slate-400">NEXT_PUBLIC_SUPABASE_URL</code> or anon key in <code className="text-slate-400">.env.local</code> is incorrect — restart the dev server after changing env vars</li>
            <li>Row Level Security is blocking anonymous reads — disable RLS or add a permissive policy</li>
          </ul>
        </div>
      </div>
    );
  }

  // success
  const { jobs, durationMs } = state;
  return (
    <div className="flex flex-col gap-4">
      {/* Success banner */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3">
        <span className="text-base text-emerald-400">✓</span>
        <div className="flex-1 text-sm">
          <span className="font-semibold text-emerald-300">Connected</span>
          <span className="ml-2 text-slate-400">
            — returned <strong className="text-slate-200">{jobs.length}</strong> row{jobs.length !== 1 ? "s" : ""} in{" "}
            <strong className="text-slate-200">{durationMs} ms</strong>
          </span>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-8 text-center text-sm text-slate-500">
          Table exists but contains no rows yet. Run the seed SQL to populate it.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-left text-slate-500">
                <th className="px-4 py-3">job_reference</th>
                <th className="px-4 py-3">service_type</th>
                <th className="px-4 py-3">route</th>
                <th className="px-4 py-3">currency</th>
                <th className="px-4 py-3 text-right">job_value</th>
                <th className="px-4 py-3">payment_status</th>
                <th className="px-4 py-3">job_status</th>
                <th className="px-4 py-3">current_milestone</th>
                <th className="px-4 py-3">created_at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {jobs.map((job) => (
                <tr key={job.id} className="bg-slate-900/40 hover:bg-slate-900 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-blue-400 whitespace-nowrap">{job.job_reference}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{job.service_type}</td>
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{job.route}</td>
                  <td className="px-4 py-3 text-slate-400">{job.currency}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-100 whitespace-nowrap">
                    {Number(job.job_value).toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <PaymentBadge status={job.payment_status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <JobStatusText status={job.job_status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{job.current_milestone}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{job.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw JSON toggle */}
      <details className="rounded-xl border border-slate-800 bg-slate-900/40">
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors">
          Raw JSON response ({jobs.length} rows)
        </summary>
        <pre className="overflow-x-auto px-5 pb-5 pt-3 text-xs text-slate-400 leading-relaxed">
          {JSON.stringify(jobs, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function RefetchButton({ state, onRefetch }: { state: FetchState; onRefetch: () => void }) {
  const loading = state.status === "loading";
  return (
    <button
      onClick={onRefetch}
      disabled={loading}
      className="shrink-0 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "Loading…" : "↺ Refetch"}
    </button>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-600">{label}</span>
      <span className={`text-slate-300 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

const paymentColors: Record<string, string> = {
  "Payment Pending":   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Confirmed": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fully Paid":        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":          "bg-red-500/15 text-red-400 border-red-500/30",
  "Refunded":          "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function PaymentBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${paymentColors[status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
      {status}
    </span>
  );
}

const jobStatusColors: Record<string, string> = {
  "Awaiting Customer Acceptance": "text-amber-400",
  "Awaiting Deposit": "text-amber-400",
  "In Progress":      "text-blue-400",
  "Completed":        "text-emerald-400",
  "Disputed":         "text-red-400",
  "Cancelled":        "text-slate-500",
};

function JobStatusText({ status }: { status: string }) {
  return (
    <span className={`font-medium ${jobStatusColors[status] ?? "text-slate-400"}`}>
      {status}
    </span>
  );
}
