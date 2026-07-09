"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MembershipRow {
  id:                     string;
  plan:                   string;
  status:                 string;
  annual_fee:             number | null;
  included_jobs:          number | null;
  used_jobs:              number;
  ai_monitoring_included: boolean;
  priority_support:       boolean;
  preferred_payment_rate: boolean;
  start_date:             string | null;
  end_date:               string | null;
  companies:              { name: string } | null;
}

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; memberships: MembershipRow[] };

// ─── Style maps ───────────────────────────────────────────────────────────────

const PLAN_BADGE: Record<string, string> = {
  Basic:      "bg-slate-700/60 text-slate-300 border-slate-600/40",
  Plus:       "bg-purple-500/15 text-purple-300 border-purple-500/30",
  Enterprise: "bg-blue-500/15 text-blue-300 border-blue-500/30",
};

const STATUS_BADGE: Record<string, string> = {
  Active:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Trial:     "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Expired:   "bg-red-500/15 text-red-300 border-red-500/30",
  Suspended: "bg-slate-700/50 text-slate-400 border-slate-600/40",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMembershipsPage() {
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    supabase
      .from("memberships")
      .select(
        "id, plan, status, annual_fee, included_jobs, used_jobs, ai_monitoring_included, priority_support, preferred_payment_rate, start_date, end_date, companies(name)",
      )
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setState({ status: "error", message: error.message });
        else       setState({ status: "success", memberships: (data as unknown as MembershipRow[]) ?? [] });
      });
  }, []);

  const memberships    = state.status === "success" ? state.memberships : [];
  const activeCount    = memberships.filter((m) => m.status === "Active").length;
  const trialCount     = memberships.filter((m) => m.status === "Trial").length;
  const expiredCount   = memberships.filter((m) => m.status === "Expired" || m.status === "Suspended").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"              className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"         className="hover:text-slate-100 transition-colors">All Jobs</Link>
            <Link href="/admin/memberships"  className="text-slate-100 font-medium">Memberships</Link>
            <Link href="/admin/demo-checklist" className="hover:text-slate-100 transition-colors">Checklist</Link>
            <Link href="/admin/demo-reset"   className="hover:text-amber-300 text-amber-500/70 transition-colors">Demo Reset</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <Link href="/admin" className="hover:text-slate-300 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-slate-400">Memberships</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-50">Provider Memberships</h1>
          <p className="mt-1 text-sm text-slate-400">All service provider membership plans and usage</p>
        </div>

        {/* Summary stats */}
        {state.status === "success" && (
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <StatCard label="Total Members"       value={memberships.length} color="text-slate-100" />
            <StatCard label="Active"              value={activeCount}        color="text-emerald-400" />
            <StatCard label="Trial"               value={trialCount}         color="text-amber-400" />
            <StatCard label="Expired / Suspended" value={expiredCount}       color="text-red-400" highlight={expiredCount > 0} />
          </div>
        )}

        {/* Loading */}
        {state.status === "loading" && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {/* Error */}
        {state.status === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-red-300">Failed to load memberships</p>
            <p className="mt-1 font-mono text-xs text-red-400">{state.message}</p>
          </div>
        )}

        {/* Empty */}
        {state.status === "success" && memberships.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
            <p className="text-sm text-slate-500">No memberships yet.</p>
          </div>
        )}

        {/* Table */}
        {state.status === "success" && memberships.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Annual Fee</th>
                  <th className="px-4 py-3 text-right">Included</th>
                  <th className="px-4 py-3 text-right">Used</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                  <th className="px-4 py-3">Usage %</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {memberships.map((m) => {
                  const isUnlimited = m.included_jobs === null;
                  const remaining   = isUnlimited ? null : Math.max(0, m.included_jobs! - m.used_jobs);
                  const usedPct     = m.included_jobs
                    ? Math.min(100, Math.round((m.used_jobs / m.included_jobs) * 100))
                    : 0;
                  const atLimit   = !isUnlimited && m.used_jobs >= m.included_jobs!;
                  const nearLimit = !isUnlimited && !atLimit && m.used_jobs >= m.included_jobs! * 0.8;
                  const barColor  = atLimit ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-emerald-500";

                  return (
                    <tr key={m.id} className={`hover:bg-slate-900 transition-colors ${atLimit ? "bg-red-500/5" : "bg-slate-900/40"}`}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-200 whitespace-nowrap">{m.companies?.name ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${PLAN_BADGE[m.plan] ?? PLAN_BADGE.Basic}`}>
                          {m.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[m.status] ?? STATUS_BADGE.Suspended}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-200 whitespace-nowrap tabular-nums">
                        {m.annual_fee !== null ? `RM ${m.annual_fee.toLocaleString()}` : "Custom"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-400 tabular-nums">
                        {isUnlimited ? "∞" : m.included_jobs}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        <span className={atLimit ? "text-red-400 font-semibold" : "text-slate-300"}>
                          {m.used_jobs}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        {isUnlimited ? (
                          <span className="text-slate-500">∞</span>
                        ) : (
                          <span className={remaining === 0 ? "text-red-400 font-semibold" : nearLimit ? "text-amber-400" : "text-emerald-400"}>
                            {remaining}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isUnlimited ? (
                          <span className="text-xs text-slate-500">Unlimited</span>
                        ) : (
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <div className="h-1.5 w-16 rounded-full bg-slate-800">
                              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${usedPct}%` }} />
                            </div>
                            <span className={`text-xs tabular-nums font-medium ${atLimit ? "text-red-400" : nearLimit ? "text-amber-400" : "text-slate-500"}`}>
                              {usedPct}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {m.start_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {m.end_date ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color, highlight = false }: {
  label: string; value: number; color: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-slate-900 p-5 ${highlight ? "border-red-500/30" : "border-slate-800"}`}>
      <p className="mb-2 text-xs text-slate-500">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400 font-medium">
      {label}
    </span>
  );
}
