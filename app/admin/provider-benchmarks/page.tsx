"use client";

// ─── Admin — Provider Performance Benchmarks ──────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  gradeColor,
  gradeLabel,
  scoreColor,
  fmtRate,
  fmtScore,
  fmtHours,
  type ProviderBenchmarkRow,
  type ReliabilityGrade,
} from "@/lib/providerBenchmark";

type SortKey = "score" | "dispute" | "on_time" | "name" | "jobs";
type SortDir = "asc" | "desc";
type GradeFilter = "all" | ReliabilityGrade;

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

export default function AdminProviderBenchmarksPage() {
  const { profile } = useAuth();

  const [benchmarks, setBenchmarks] = useState<ProviderBenchmarkRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [recalcAll, setRecalcAll]   = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [sortKey, setSortKey]         = useState<SortKey>("score");
  const [sortDir, setSortDir]         = useState<SortDir>("desc");
  const [search, setSearch]           = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const res = await fetch("/api/provider-benchmarks", { headers: auth(token) });
    if (res.ok) {
      const { data } = (await res.json()) as { data: ProviderBenchmarkRow[] };
      setBenchmarks(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRecalcAll() {
    setRecalcAll(true);
    const token = await getToken();
    if (!token) { setRecalcAll(false); return; }
    await fetch("/api/provider-benchmarks", {
      method: "POST",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "recalculate" }),
    });
    setRecalcAll(false);
    await load();
  }

  async function handleRecalcOne(companyId: string) {
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/provider-benchmarks/${companyId}`, {
      method: "POST",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "recalculate" }),
    });
    await load();
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────────
  const filtered = benchmarks
    .filter((b) => gradeFilter === "all" || b.reliability_grade === gradeFilter)
    .filter((b) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (b.provider_name ?? "").toLowerCase().includes(s);
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "score")    cmp = (a.overall_provider_score ?? -1) - (b.overall_provider_score ?? -1);
      if (sortKey === "dispute")  cmp = (a.dispute_rate ?? 0) - (b.dispute_rate ?? 0);
      if (sortKey === "on_time")  cmp = (a.on_time_delivery_rate ?? 0) - (b.on_time_delivery_rate ?? 0);
      if (sortKey === "name")     cmp = (a.provider_name ?? "").localeCompare(b.provider_name ?? "");
      if (sortKey === "jobs")     cmp = a.total_jobs - b.total_jobs;
      return sortDir === "asc" ? cmp : -cmp;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const gradeA     = benchmarks.filter((b) => b.reliability_grade === "A");
  const gradeB     = benchmarks.filter((b) => b.reliability_grade === "B");
  const watchlist  = benchmarks.filter((b) => b.reliability_grade === "Watchlist");
  const avgScore   = benchmarks.length > 0
    ? (benchmarks.reduce((s, b) => s + (b.overall_provider_score ?? 0), 0) / benchmarks.length).toFixed(1)
    : "—";

  const GRADES: GradeFilter[] = ["all", "A", "B", "C", "D", "Watchlist"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-400 hover:text-slate-200 text-sm">← Admin</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100">Provider Benchmarks</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Provider Performance Benchmarks</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Internal scoring based on platform job history. Not a certification or financial guarantee.
            </p>
          </div>
          <button
            onClick={() => void handleRecalcAll()}
            disabled={recalcAll}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {recalcAll ? "Recalculating All…" : "↻ Recalculate All"}
          </button>
        </div>

        {/* Metric summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Providers Benchmarked" value={benchmarks.length.toString()} />
          <MetricCard label="Average Score"  value={avgScore}             accent="blue"    />
          <MetricCard label="Grade A/B"      value={(gradeA.length + gradeB.length).toString()} accent="emerald" />
          <MetricCard label="Watchlist"      value={watchlist.length.toString()}              accent={watchlist.length > 0 ? "red" : "slate"} />
        </div>

        {/* Watchlist alert */}
        {watchlist.length > 0 && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl px-5 py-3 flex items-center justify-between">
            <p className="text-sm text-red-300">
              <strong>{watchlist.length}</strong> provider{watchlist.length !== 1 ? "s are" : " is"} on the Watchlist — high dispute rate or critical exceptions.
            </p>
            <button onClick={() => setGradeFilter("Watchlist")} className="text-xs text-red-400 hover:text-red-200 underline">
              Filter →
            </button>
          </div>
        )}

        {/* Filter + search */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search provider…"
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 w-48"
          />
          <div className="flex gap-1">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  gradeFilter === g
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                {g === "all" ? "All Grades" : g}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            {benchmarks.length === 0
              ? "No benchmarks yet. Click \"Recalculate All\" to generate scores for all service providers."
              : "No providers match the current filter."}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-800 text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
              <SortTh label="Provider"    col={2} sortKey="name"     current={sortKey} dir={sortDir} onToggle={toggleSort} />
              <SortTh label="Score"       col={1} sortKey="score"    current={sortKey} dir={sortDir} onToggle={toggleSort} />
              <div className="col-span-1 text-center">Grade</div>
              <SortTh label="Jobs"        col={1} sortKey="jobs"     current={sortKey} dir={sortDir} onToggle={toggleSort} />
              <SortTh label="On-Time"     col={1} sortKey="on_time"  current={sortKey} dir={sortDir} onToggle={toggleSort} />
              <SortTh label="POD Rate"    col={1} />
              <SortTh label="Dispute"     col={1} sortKey="dispute"  current={sortKey} dir={sortDir} onToggle={toggleSort} />
              <div className="col-span-1">Doc Quality</div>
              <div className="col-span-1">Tracking</div>
              <div className="col-span-1">Release</div>
              <div className="col-span-1"></div>
            </div>

            <div className="divide-y divide-slate-800/60">
              {filtered.map((b) => {
                const isExp = expandedId === b.id;
                return (
                  <div key={b.id}>
                    <div
                      className="grid grid-cols-12 gap-2 px-5 py-3 items-center cursor-pointer hover:bg-slate-800/30 transition-colors"
                      onClick={() => setExpandedId(isExp ? null : b.id)}
                    >
                      <div className="col-span-2 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{b.provider_name ?? "—"}</p>
                        {b.benchmark_note && (
                          <p className="text-[10px] text-amber-400/70 truncate mt-0.5">{b.benchmark_note}</p>
                        )}
                      </div>
                      <div className="col-span-1">
                        <span className={`text-sm font-bold tabular-nums ${scoreColor(b.overall_provider_score)}`}>
                          {fmtScore(b.overall_provider_score)}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${gradeColor(b.reliability_grade)}`}>
                          {b.reliability_grade}
                        </span>
                      </div>
                      <div className="col-span-1 text-xs text-slate-400">{b.total_jobs}</div>
                      <div className="col-span-1 text-xs text-slate-300">{fmtRate(b.on_time_delivery_rate)}</div>
                      <div className="col-span-1 text-xs text-slate-300">{fmtRate(b.pod_uploaded_rate)}</div>
                      <div className={`col-span-1 text-xs font-medium ${(b.dispute_rate ?? 0) > 20 ? "text-red-400" : "text-slate-300"}`}>
                        {fmtRate(b.dispute_rate)}
                      </div>
                      <div className="col-span-1 text-xs text-slate-300">{fmtScore(b.document_quality_score)}</div>
                      <div className="col-span-1 text-xs text-slate-300">{fmtScore(b.tracking_update_score)}</div>
                      <div className="col-span-1 text-xs text-slate-300">{fmtRate(b.payment_release_success_rate)}</div>
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/companies/${b.provider_company_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-blue-400 hover:text-blue-200"
                        >
                          View →
                        </Link>
                        <span className="text-slate-600 text-xs ml-1">{isExp ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExp && (
                      <div className="border-t border-slate-800 bg-slate-900/40 px-5 py-4 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <StatCell label="Completed Jobs"  value={b.completed_jobs.toString()} />
                          <StatCell label="Active Jobs"     value={b.active_jobs.toString()} />
                          <StatCell label="Claim Rate"      value={fmtRate(b.claim_rate)} />
                          <StatCell label="Avg Quote"       value={b.average_quote_amount != null ? `RM ${b.average_quote_amount.toFixed(0)}` : "—"} />
                          <StatCell label="Avg Deposit %"   value={fmtRate(b.average_deposit_percentage)} />
                          <StatCell label="Avg Execution"   value={fmtHours(b.average_execution_time_hours)} />
                          <StatCell label="Payment Secured" value={fmtHours(b.average_payment_secured_time_hours)} />
                          <StatCell label="Last Calculated" value={b.last_calculated_at ? new Date(b.last_calculated_at).toLocaleDateString("en-GB") : "—"} />
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <p className="text-[10px] text-slate-600">Provider company ID: <span className="font-mono">{b.provider_company_id}</span></p>
                          <button
                            onClick={() => void handleRecalcOne(b.provider_company_id)}
                            className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                          >
                            ↻ Recalculate
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-slate-700 text-center">
          Benchmark scores are internal operational metrics derived from Nexum platform data.
          They are not a certification, financial rating, or legal guarantee of provider performance.
        </p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetricCard({ label, value, accent = "slate" }: { label: string; value: string; accent?: "slate" | "blue" | "emerald" | "red" }) {
  const colors: Record<string, string> = {
    slate:   "text-slate-100", blue: "text-blue-400", emerald: "text-emerald-400", red: "text-red-400",
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[accent]}`}>{value}</p>
    </div>
  );
}

function SortTh({
  label, col, sortKey: sk, current, dir, onToggle,
}: {
  label: string; col: number; sortKey?: SortKey; current?: SortKey; dir?: SortDir;
  onToggle?: (k: SortKey) => void;
}) {
  const isActive = sk && current === sk;
  return (
    <div
      className={`col-span-${col} ${sk ? "cursor-pointer select-none hover:text-slate-400" : ""} ${isActive ? "text-purple-400" : ""}`}
      onClick={() => sk && onToggle?.(sk)}
    >
      {label}{isActive ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-200 mt-0.5">{value}</p>
    </div>
  );
}
