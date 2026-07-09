"use client";

// ─── /admin/customer-benchmarks — Customer Performance Benchmark Hub ──────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  customerGradeColor,
  customerGradeLabel,
  customerScoreColor,
  computeCustomerRecommendation,
  fmtCustRate,
  fmtCustScore,
  fmtCustValue,
  fmtCustHours,
  type CustomerBenchmarkRow,
  type CustomerGrade,
} from "@/lib/customerBenchmark";
import { CustomerBenchmarkCard } from "@/components/CustomerBenchmarkCard";

type SortKey = "score" | "dispute" | "overdue" | "value" | "name" | "jobs";
type GradeFilter = "all" | CustomerGrade;

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function AdminCustomerBenchmarksPage() {
  const [benchmarks, setBenchmarks] = useState<CustomerBenchmarkRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [recalcAll, setRecalcAll]   = useState(false);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [search, setSearch]         = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("score");
  const [sortAsc, setSortAsc]       = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const res = await fetch("/api/customer-benchmarks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { data } = await res.json() as { data: CustomerBenchmarkRow[] };
      setBenchmarks(data ?? []);
    } else {
      setError("Failed to load benchmark data.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRecalcAll() {
    setRecalcAll(true);
    setError(null);
    const token = await getToken();
    if (!token) { setRecalcAll(false); return; }
    const res = await fetch("/api/customer-benchmarks", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "recalculate" }),
    });
    const body = await res.json() as { calculated?: number; errors?: string[] };
    if (body.errors?.length) setError(`Errors for: ${body.errors.join(", ")}`);
    await load();
    setRecalcAll(false);
  }

  // ── Derived lists ────────────────────────────────────────────────────────────

  const watchlist    = benchmarks.filter((b) => b.customer_grade === "Watchlist");
  const gradeA       = benchmarks.filter((b) => b.customer_grade === "A");
  const gradeB       = benchmarks.filter((b) => b.customer_grade === "B");
  const highDispute  = benchmarks.filter((b) => (b.dispute_rate ?? 0) > 20);
  const overdueHigh  = benchmarks.filter((b) => (b.overdue_payment_rate ?? 0) > 15);
  const avgScore     = benchmarks.length > 0
    ? (benchmarks.reduce((s, b) => s + (b.overall_customer_score ?? 0), 0) / benchmarks.length).toFixed(1)
    : "—";
  const totalValue   = benchmarks.reduce((s, b) => s + (b.total_secured_value ?? 0), 0);

  // ── Filter + search + sort ───────────────────────────────────────────────────

  const filtered = benchmarks
    .filter((b) => gradeFilter === "all" || b.customer_grade === gradeFilter)
    .filter((b) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (b.customer_name ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === "score")   { av = a.overall_customer_score ?? 0; bv = b.overall_customer_score ?? 0; }
      if (sortKey === "dispute") { av = a.dispute_rate ?? 0;           bv = b.dispute_rate ?? 0; }
      if (sortKey === "overdue") { av = a.overdue_payment_rate ?? 0;   bv = b.overdue_payment_rate ?? 0; }
      if (sortKey === "value")   { av = a.total_secured_value ?? 0;    bv = b.total_secured_value ?? 0; }
      if (sortKey === "jobs")    { av = a.total_jobs;                  bv = b.total_jobs; }
      if (sortKey === "name")    { return sortAsc ? (a.customer_name ?? "").localeCompare(b.customer_name ?? "") : (b.customer_name ?? "").localeCompare(a.customer_name ?? ""); }
      return sortAsc ? av - bv : bv - av;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
          active ? "text-purple-400 bg-purple-950/30" : "text-slate-500 hover:text-slate-300"
        }`}
      >
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </button>
    );
  }

  const GRADES: GradeFilter[] = ["all", "A", "B", "C", "D", "Watchlist"];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center gap-4 text-sm text-slate-400">
        <Link href="/admin" className="text-purple-400 font-semibold hover:text-purple-300 transition-colors">
          Nexum Admin
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-200 font-medium">Customer Benchmarks</span>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/admin/provider-benchmarks" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Provider Benchmarks →
          </Link>
          <button
            onClick={() => void handleRecalcAll()}
            disabled={recalcAll || loading}
            className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {recalcAll ? "Recalculating All…" : "Recalculate All"}
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Customer Performance Benchmarks</h1>
          <p className="text-sm text-slate-500 mt-1">
            Internal buyer behavior analysis — payment reliability, receipt confirmation, dispute history.
          </p>
          <p className="text-xs text-slate-700 mt-0.5">
            ℹ Scores are operational indicators only. Not a credit rating or financial approval.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Watchlist alert */}
        {watchlist.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
            <span className="text-base mt-0.5">🚨</span>
            <div>
              <p className="text-xs font-semibold text-red-300">
                {watchlist.length} customer{watchlist.length !== 1 ? "s" : ""} on Watchlist — full payment before execution is recommended
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {watchlist.map((b) => b.customer_name ?? "Unknown").join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* Metric cards */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Customers Tracked",   value: benchmarks.length,                         color: "text-slate-300" },
            { label: "Average Score",        value: avgScore,                                  color: "text-purple-400" },
            { label: "Grade A",              value: gradeA.length,                             color: "text-emerald-400" },
            { label: "Grade A+B",            value: gradeA.length + gradeB.length,             color: "text-blue-400" },
            { label: "Watchlist",            value: watchlist.length,                          color: watchlist.length > 0 ? "text-red-400" : "text-slate-600" },
            { label: "Total Value Secured",  value: fmtCustValue(totalValue || null),          color: "text-emerald-400" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{m.label}</p>
              <p className={`text-xl font-bold mt-1 ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Grade filter + search + sort */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                  gradeFilter === g
                    ? g === "all"
                      ? "bg-purple-600 border-purple-500 text-white"
                      : customerGradeColor(g as CustomerGrade)
                    : "border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                {g === "all" ? "All" : g}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer…"
            className="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
          />
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-slate-600 uppercase tracking-wider mr-1">Sort:</span>
            <SortBtn k="score"   label="Score" />
            <SortBtn k="value"   label="Value" />
            <SortBtn k="dispute" label="Dispute" />
            <SortBtn k="overdue" label="Overdue" />
            <SortBtn k="jobs"    label="Jobs" />
            <SortBtn k="name"    label="Name" />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-8 text-center">
            <p className="text-sm text-slate-600 animate-pulse">Loading benchmark data…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-8 text-center">
            <p className="text-sm text-slate-600">
              {benchmarks.length === 0
                ? "No customer benchmarks yet. Click 'Recalculate All' to generate scores."
                : "No customers match your filter."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_80px_90px_80px_60px] gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Customer</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest text-right">Score</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest text-right">Grade</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest text-right">Dispute</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest text-right">Overdue</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest text-right">Total Value</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest text-right">Jobs</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest text-right">Details</p>
            </div>

            <div className="divide-y divide-slate-800/60">
              {filtered.map((b) => {
                const rec = computeCustomerRecommendation(b);
                const isOpen = expanded === b.customer_company_id;
                return (
                  <div key={b.id}>
                    <div className="grid grid-cols-[1fr_80px_80px_80px_80px_90px_80px_60px] gap-2 px-4 py-3 hover:bg-slate-800/30 transition-colors items-center">
                      {/* Name + rec */}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{b.customer_name ?? "—"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {rec && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${rec.color}`}>
                              {rec.label}
                            </span>
                          )}
                          {b.last_calculated_at && (
                            <span className="text-[9px] text-slate-600">
                              {new Date(b.last_calculated_at).toLocaleDateString("en-GB")}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Score */}
                      <p className={`text-sm font-bold tabular-nums text-right ${customerScoreColor(b.overall_customer_score)}`}>
                        {fmtCustScore(b.overall_customer_score)}
                      </p>
                      {/* Grade */}
                      <div className="flex justify-end">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${customerGradeColor(b.customer_grade)}`}>
                          {b.customer_grade}
                        </span>
                      </div>
                      {/* Dispute */}
                      <p className={`text-sm text-right font-medium ${(b.dispute_rate ?? 0) > 20 ? "text-red-400" : "text-slate-400"}`}>
                        {fmtCustRate(b.dispute_rate)}
                      </p>
                      {/* Overdue */}
                      <p className={`text-sm text-right font-medium ${(b.overdue_payment_rate ?? 0) > 15 ? "text-red-400" : "text-slate-400"}`}>
                        {fmtCustRate(b.overdue_payment_rate)}
                      </p>
                      {/* Value */}
                      <p className="text-sm text-right text-slate-300 font-medium">
                        {fmtCustValue(b.total_secured_value)}
                      </p>
                      {/* Jobs */}
                      <p className="text-sm text-right text-slate-400">
                        {b.total_jobs}
                      </p>
                      {/* Expand */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => setExpanded(isOpen ? null : b.customer_company_id)}
                          className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          {isOpen ? "▲ Hide" : "▼ Show"}
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail card */}
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-slate-800/60 bg-slate-900/30">
                        <div className="mt-4">
                          <CustomerBenchmarkCard
                            companyId={b.customer_company_id}
                            companyName={b.customer_name ?? undefined}
                            showRecalc
                            benchmark={b}
                            onRecalc={() => void load()}
                          />
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Link
                            href={`/admin/companies/${b.customer_company_id}`}
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                          >
                            View Company Profile →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* High-risk summary cards */}
        {(highDispute.length > 0 || overdueHigh.length > 0) && (
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* High Dispute */}
            {highDispute.length > 0 && (
              <div className="rounded-xl border border-amber-800/30 bg-slate-900/60 overflow-hidden">
                <div className="border-b border-amber-800/30 bg-amber-950/10 px-4 py-2.5">
                  <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-widest">
                    High Dispute Rate (&gt;20%) — {highDispute.length}
                  </p>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {highDispute.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-[11px] font-semibold text-amber-300">{b.customer_name ?? "—"}</p>
                        <p className="text-[10px] text-slate-500">Grade {b.customer_grade} · Score {fmtCustScore(b.overall_customer_score)}</p>
                      </div>
                      <span className="rounded-md bg-amber-950/40 border border-amber-700/40 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        {fmtCustRate(b.dispute_rate)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* High Overdue */}
            {overdueHigh.length > 0 && (
              <div className="rounded-xl border border-red-800/30 bg-slate-900/60 overflow-hidden">
                <div className="border-b border-red-800/30 bg-red-950/10 px-4 py-2.5">
                  <p className="text-[10px] font-semibold text-red-500 uppercase tracking-widest">
                    High Overdue Payment Rate (&gt;15%) — {overdueHigh.length}
                  </p>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {overdueHigh.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-[11px] font-semibold text-red-300">{b.customer_name ?? "—"}</p>
                        <p className="text-[10px] text-slate-500">Recommended: {b.recommended_deposit_percentage}% deposit</p>
                      </div>
                      <span className="rounded-md bg-red-950/40 border border-red-700/40 px-2 py-0.5 text-[10px] font-bold text-red-400">
                        {fmtCustRate(b.overdue_payment_rate)} overdue
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
