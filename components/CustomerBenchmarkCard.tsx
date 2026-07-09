"use client";

// ─── Customer Benchmark Card ──────────────────────────────────────────────────
// Reusable card showing customer/buyer performance benchmark data.
// Used in: admin company detail, admin customer-benchmarks hub,
//          provider customer-insights, provider quotation/job new flow.
//
// COMPLIANCE NOTE: Scores are internal platform metrics only.
//   Not a credit rating or financial guarantee.

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  customerGradeColor,
  customerGradeLabel,
  customerScoreColor,
  fmtCustRate,
  fmtCustScore,
  fmtCustHours,
  fmtCustValue,
  computeCustomerRecommendation,
  type CustomerBenchmarkRow,
  type CustomerGrade,
} from "@/lib/customerBenchmark";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId:    string;
  companyName?: string;
  compact?:     boolean;    // compact single-row pill for tables
  showRecalc?:  boolean;    // show recalculate button (admin only)
  providerView?: boolean;   // strip sensitive notes (provider-facing)
  onRecalc?:    () => void;
  benchmark?:   CustomerBenchmarkRow | null; // pre-fetched (skip self-fetch)
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomerBenchmarkCard({
  companyId, companyName, compact = false, showRecalc = false,
  providerView = false, onRecalc, benchmark: prefetched,
}: Props) {
  const [b, setB]             = useState<CustomerBenchmarkRow | null>(prefetched ?? null);
  const [loading, setLoading] = useState(prefetched === undefined);
  const [recalc, setRecalc]   = useState(false);

  useEffect(() => {
    if (prefetched !== undefined) return;
    void (async () => {
      setLoading(true);
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch(`/api/customer-benchmarks/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json() as { data: CustomerBenchmarkRow | null };
        setB(data);
      }
      setLoading(false);
    })();
  }, [companyId, prefetched]);

  async function handleRecalc() {
    setRecalc(true);
    const token = await getToken();
    if (!token) { setRecalc(false); return; }
    const res = await fetch(`/api/customer-benchmarks/${companyId}`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "recalculate" }),
    });
    if (res.ok) {
      const { data } = await res.json() as { data: CustomerBenchmarkRow };
      setB(data);
      onRecalc?.();
    }
    setRecalc(false);
  }

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-600 animate-pulse">
        Loading customer insight…
      </div>
    );
  }

  // ── Compact mode ──────────────────────────────────────────────────────────────
  if (compact) {
    if (!b) return <span className="text-xs text-slate-600 italic">No benchmark</span>;
    const rec = computeCustomerRecommendation(b);
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${customerGradeColor(b.customer_grade)}`}>
          {b.customer_grade}
        </span>
        <span className={`text-xs font-mono ${customerScoreColor(b.overall_customer_score)}`}>
          {fmtCustScore(b.overall_customer_score)}
        </span>
        {rec && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${rec.color}`}>
            {rec.label}
          </span>
        )}
      </div>
    );
  }

  // ── No data state ──────────────────────────────────────────────────────────────
  if (!b) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Customer Insight</p>
            <p className="text-sm text-slate-500 mt-1">No benchmark data available yet.</p>
            <p className="text-xs text-slate-600 mt-0.5">Score will be calculated after first jobs are completed.</p>
          </div>
          {showRecalc && (
            <button
              onClick={() => void handleRecalc()}
              disabled={recalc}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors disabled:opacity-50"
            >
              {recalc ? "Calculating…" : "Calculate Now"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const gradeClasses   = customerGradeColor(b.customer_grade);
  const hasLimitedData = (b.total_jobs ?? 0) < 3;
  const rec            = computeCustomerRecommendation(b);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Customer Insight</p>
          {companyName && <p className="text-sm font-medium text-slate-200 mt-0.5 truncate">{companyName}</p>}
          {rec && (
            <span className={`inline-flex items-center mt-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${rec.color}`}>
              {rec.label}
            </span>
          )}
          {b.risk_note && !providerView && (
            <p className="text-xs text-amber-400/80 mt-1 italic">{b.risk_note}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${customerScoreColor(b.overall_customer_score)}`}>
              {fmtCustScore(b.overall_customer_score)}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">/ 100</p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full border font-bold ${gradeClasses}`}>
            {b.customer_grade}
          </span>
        </div>
      </div>

      {/* Watchlist alert */}
      {b.customer_grade === "Watchlist" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/15 px-3 py-2">
          <span className="mt-0.5 text-sm">🚨</span>
          <p className="text-xs text-red-300 font-medium">
            Watchlist customer — full payment before execution is strongly recommended. Consult admin before proceeding.
          </p>
        </div>
      )}

      {hasLimitedData && b.customer_grade !== "Watchlist" && (
        <div className="text-xs text-amber-400/70 bg-amber-900/10 border border-amber-700/20 rounded-lg px-3 py-2">
          ⚠ Limited data ({b.total_jobs} job{b.total_jobs !== 1 ? "s" : ""}). Score may not be representative.
        </div>
      )}

      {/* Score breakdown bars */}
      <div className="space-y-2">
        <CustScoreBar label="Payment Behavior"          value={b.payment_behavior_score}             weight="40%" />
        <CustScoreBar label="Receipt Confirmation"      value={b.receipt_confirmation_score}         weight="20%" />
        <CustScoreBar label="Document Completeness"     value={b.document_completeness_score}        weight="20%" />
        <CustScoreBar label="Communication & Response"  value={b.communication_responsiveness_score} weight="20%" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-800 pt-3">
        <StatCell label="Total Jobs"        value={b.total_jobs.toString()} />
        <StatCell label="Completed"         value={b.completed_jobs.toString()} />
        <StatCell label="Dispute Rate"      value={fmtCustRate(b.dispute_rate)}    accent={b.dispute_rate != null && b.dispute_rate > 20 ? "red" : undefined} />
        <StatCell label="Overdue Payments"  value={fmtCustRate(b.overdue_payment_rate)} accent={b.overdue_payment_rate != null && b.overdue_payment_rate > 15 ? "red" : undefined} />
        <StatCell label="Total Value"       value={fmtCustValue(b.total_secured_value)} />
        <StatCell label="Avg Job Value"     value={fmtCustValue(b.average_job_value)} />
        <StatCell label="Auto-Confirmed"    value={fmtCustRate(b.auto_confirmation_rate)} />
        <StatCell label="Pay Upload Time"   value={fmtCustHours(b.average_payment_proof_upload_time_hours)} />
      </div>

      {/* Recommended terms */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3 space-y-1">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Nexum Recommended Terms</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-300">{b.recommended_payment_terms ?? "Standard terms apply."}</p>
          <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded border ${gradeClasses}`}>
            {b.recommended_deposit_percentage != null ? `${b.recommended_deposit_percentage}% deposit` : "—"}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <p className="text-[10px] text-slate-600">
          Last calculated:{" "}
          {b.last_calculated_at
            ? new Date(b.last_calculated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—"}
        </p>
        {showRecalc && (
          <button
            onClick={() => void handleRecalc()}
            disabled={recalc}
            className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors disabled:opacity-50"
          >
            {recalc ? "Recalculating…" : "Recalculate"}
          </button>
        )}
        <p className="text-[9px] text-slate-700 italic">Internal metric only. Not a credit rating.</p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CustScoreBar({
  label, value, weight,
}: { label: string; value: number | null | undefined; weight: string }) {
  const pct    = value ?? 0;
  const color  = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : pct >= 40 ? "bg-orange-500" : "bg-red-500";
  const tColor = customerScoreColor(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">{label}</span>
          <span className="text-[9px] text-slate-700">{weight}</span>
        </div>
        <span className={`text-[11px] font-semibold tabular-nums ${tColor}`}>
          {value != null ? pct.toFixed(0) : "—"}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-slate-800">
        {value != null && (
          <div
            className={`h-full rounded-full ${color} transition-all duration-300`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        )}
      </div>
    </div>
  );
}

function StatCell({
  label, value, accent,
}: { label: string; value: string; accent?: "red" | "emerald" }) {
  const textColor = accent === "red" ? "text-red-400" : accent === "emerald" ? "text-emerald-400" : "text-slate-200";
  return (
    <div>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${textColor}`}>{value}</p>
    </div>
  );
}
