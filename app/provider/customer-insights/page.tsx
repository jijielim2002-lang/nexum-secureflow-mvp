"use client";

// ─── /provider/customer-insights — Provider view of customer benchmarks ────────
// Provider can see simplified insights for customers involved in their jobs.
// Sensitive admin-only notes are excluded via API (provider route strips risk_note).

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  customerGradeColor,
  customerScoreColor,
  computeCustomerRecommendation,
  fmtCustRate,
  fmtCustScore,
  fmtCustValue,
  type CustomerBenchmarkRow,
  type CustomerGrade,
} from "@/lib/customerBenchmark";
import { CustomerBenchmarkCard } from "@/components/CustomerBenchmarkCard";

type GradeFilter = "all" | CustomerGrade;

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function ProviderCustomerInsightsPage() {
  const [benchmarks, setBenchmarks] = useState<CustomerBenchmarkRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch("/api/customer-benchmarks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json() as { data: CustomerBenchmarkRow[] };
        setBenchmarks(data ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const watchlist = benchmarks.filter((b) => b.customer_grade === "Watchlist");

  const filtered = benchmarks
    .filter((b) => gradeFilter === "all" || b.customer_grade === gradeFilter)
    .filter((b) => !search.trim() || (b.customer_name ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.overall_customer_score ?? 0) - (a.overall_customer_score ?? 0));

  const GRADES: GradeFilter[] = ["all", "A", "B", "C", "D", "Watchlist"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center gap-4 text-sm text-slate-400">
        <Link href="/provider" className="text-purple-400 font-semibold hover:text-purple-300 transition-colors">
          Provider Dashboard
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-200 font-medium">Customer Insights</span>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Customer Insights</h1>
          <p className="text-sm text-slate-500 mt-1">
            Buyer performance data for customers in your jobs. Use this to inform deposit and payment term decisions.
          </p>
          <p className="text-xs text-slate-700 mt-0.5">
            ℹ Scores are internal platform metrics only. Not a credit rating or financial guarantee.
            Nexum does not auto-select customers or guarantee payment outcomes.
          </p>
        </div>

        {/* Watchlist warning */}
        {watchlist.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
            <span className="text-base mt-0.5">🚨</span>
            <div>
              <p className="text-xs font-semibold text-red-300">
                {watchlist.length} customer{watchlist.length !== 1 ? "s" : ""} in Watchlist — consider requesting full payment before execution.
                Consult Nexum admin before proceeding.
              </p>
            </div>
          </div>
        )}

        {/* Compliance notice */}
        <div className="mb-6 rounded-xl border border-slate-700/30 bg-slate-900/40 px-4 py-3">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Nexum does not auto-select customers.</span>{" "}
            Scores reflect historical behavior on the Nexum platform only. Recommended deposit levels are advisory —
            the final decision on payment terms rests with the provider and Nexum admin.
            No legal or financial guarantee is implied.
          </p>
        </div>

        {/* Filter + search */}
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
            className="flex-1 min-w-[180px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-8 text-center">
            <p className="text-sm text-slate-600 animate-pulse">Loading customer insights…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-8 text-center">
            <p className="text-sm text-slate-600">
              {benchmarks.length === 0
                ? "No customer insight data available yet. Benchmarks are generated after jobs are completed."
                : "No customers match your filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => {
              const rec    = computeCustomerRecommendation(b);
              const isOpen = expanded === b.customer_company_id;

              return (
                <div key={b.id} className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  {/* Summary row */}
                  <button
                    className="w-full text-left px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : b.customer_company_id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-bold ${customerGradeColor(b.customer_grade)}`}>
                        {b.customer_grade}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{b.customer_name ?? "—"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-500">
                            {b.total_jobs} job{b.total_jobs !== 1 ? "s" : ""} · {fmtCustValue(b.total_secured_value)}
                          </span>
                          {rec && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${rec.color}`}>
                              {rec.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {/* Key metrics */}
                      <div className="hidden sm:flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <p className="text-slate-600 text-[10px]">Dispute</p>
                          <p className={`font-semibold ${(b.dispute_rate ?? 0) > 20 ? "text-red-400" : "text-slate-400"}`}>
                            {fmtCustRate(b.dispute_rate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-600 text-[10px]">Rec. Deposit</p>
                          <p className="font-semibold text-purple-300">
                            {b.recommended_deposit_percentage != null ? `${b.recommended_deposit_percentage}%` : "—"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-600 text-[10px]">Score</p>
                          <p className={`font-bold tabular-nums ${customerScoreColor(b.overall_customer_score)}`}>
                            {fmtCustScore(b.overall_customer_score)}
                          </p>
                        </div>
                      </div>
                      <span className="text-slate-600 text-sm">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Expanded card */}
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-slate-800/60">
                      <div className="mt-4">
                        <CustomerBenchmarkCard
                          companyId={b.customer_company_id}
                          companyName={b.customer_name ?? undefined}
                          showRecalc={false}
                          providerView
                          benchmark={b}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
