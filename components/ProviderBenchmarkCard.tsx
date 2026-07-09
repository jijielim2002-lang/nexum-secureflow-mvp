"use client";

// ─── Provider Benchmark Card ──────────────────────────────────────────────────
// Reusable card showing provider performance benchmark data.
// Used in: admin company detail, admin quotations, customer inquiry comparison,
//          provider dashboard.
//
// COMPLIANCE NOTE: Scores are internal platform metrics only.
//   Not a certification or financial guarantee.

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId:    string;
  companyName?: string;
  compact?:     boolean;   // compact single-row view for tables
  showRecalc?:  boolean;   // show recalculate button (admin only)
  onRecalc?:    () => void;
  benchmark?:   ProviderBenchmarkRow | null; // pre-fetched (skip fetch)
}

// ── Token helper ──────────────────────────────────────────────────────────────

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProviderBenchmarkCard({
  companyId, companyName, compact = false, showRecalc = false, onRecalc, benchmark: prefetched,
}: Props) {
  const [b, setB]             = useState<ProviderBenchmarkRow | null>(prefetched ?? null);
  const [loading, setLoading] = useState(prefetched === undefined);
  const [recalc, setRecalc]   = useState(false);

  useEffect(() => {
    if (prefetched !== undefined) return; // pre-fetched — skip
    void (async () => {
      setLoading(true);
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch(`/api/provider-benchmarks/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json() as { data: ProviderBenchmarkRow | null };
        setB(data);
      }
      setLoading(false);
    })();
  }, [companyId, prefetched]);

  async function handleRecalc() {
    setRecalc(true);
    const token = await getToken();
    if (!token) { setRecalc(false); return; }
    const res = await fetch(`/api/provider-benchmarks/${companyId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "recalculate" }),
    });
    if (res.ok) {
      const { data } = await res.json() as { data: ProviderBenchmarkRow };
      setB(data);
      onRecalc?.();
    }
    setRecalc(false);
  }

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-600 animate-pulse">
        Loading benchmark data…
      </div>
    );
  }

  // ── Compact mode: single pill + score ────────────────────────────────────────
  if (compact) {
    if (!b) {
      return (
        <span className="text-xs text-slate-600 italic">No benchmark</span>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${gradeColor(b.reliability_grade)}`}>
          {b.reliability_grade}
        </span>
        <span className={`text-xs font-mono ${scoreColor(b.overall_provider_score)}`}>
          {fmtScore(b.overall_provider_score)}
        </span>
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────────
  if (!b) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Provider Benchmark</p>
            <p className="text-sm text-slate-500 mt-1">No benchmark data available.</p>
            {companyName && (
              <p className="text-xs text-slate-600 mt-0.5">Score will be calculated after first jobs are completed.</p>
            )}
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

  const gradeClasses = gradeColor(b.reliability_grade);
  const hasLimitedData = (b.total_jobs ?? 0) < 3;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Provider Performance Benchmark</p>
          {companyName && <p className="text-sm font-medium text-slate-200 mt-0.5">{companyName}</p>}
          {b.benchmark_note && (
            <p className="text-xs text-amber-400/80 mt-1 italic">{b.benchmark_note}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${scoreColor(b.overall_provider_score)}`}>
              {fmtScore(b.overall_provider_score)}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">/ 100</p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full border font-bold ${gradeClasses}`}>
            {b.reliability_grade}
          </span>
        </div>
      </div>

      {hasLimitedData && (
        <div className="text-xs text-amber-400/70 bg-amber-900/10 border border-amber-700/20 rounded-lg px-3 py-2">
          ⚠ Limited data ({b.total_jobs} job{b.total_jobs !== 1 ? "s" : ""}). Score may not be representative.
        </div>
      )}

      {/* Score breakdown bars */}
      <div className="space-y-2">
        <ScoreBar label="On-Time Delivery"        value={b.on_time_delivery_rate}       weight="25%" />
        <ScoreBar label="POD Upload Rate"         value={b.pod_uploaded_rate}           weight="15%" />
        <ScoreBar label="Low Dispute Rate"        value={b.dispute_rate != null ? Math.max(0, 100 - b.dispute_rate) : null} weight="20%" raw={b.dispute_rate != null ? `${fmtRate(b.dispute_rate)} disputes` : undefined} />
        <ScoreBar label="Document Quality"        value={b.document_quality_score}      weight="15%" />
        <ScoreBar label="Tracking Discipline"     value={b.tracking_update_score}       weight="10%" />
        <ScoreBar label="Payment Release Success" value={b.payment_release_success_rate} weight="15%" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-800 pt-3">
        <StatCell label="Total Jobs"      value={b.total_jobs.toString()} />
        <StatCell label="Completed"       value={b.completed_jobs.toString()} />
        <StatCell label="Active"          value={b.active_jobs.toString()} />
        <StatCell label="Dispute Rate"    value={fmtRate(b.dispute_rate)} accent={b.dispute_rate != null && b.dispute_rate > 20 ? "red" : undefined} />
        <StatCell label="Avg Quote"       value={b.average_quote_amount != null ? `RM ${(b.average_quote_amount / 1000).toFixed(0)}k` : "—"} />
        <StatCell label="Avg Deposit"     value={fmtRate(b.average_deposit_percentage)} />
        <StatCell label="Avg Execution"   value={fmtHours(b.average_execution_time_hours)} />
        <StatCell label="Payment Secured" value={fmtHours(b.average_payment_secured_time_hours)} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <p className="text-[10px] text-slate-600">
          Last calculated: {b.last_calculated_at
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
        <p className="text-[9px] text-slate-700 italic">Internal metric only. Not a certification.</p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreBar({
  label, value, weight, raw,
}: {
  label: string; value: number | null | undefined; weight: string; raw?: string;
}) {
  const pct  = value ?? 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : pct >= 40 ? "bg-orange-500" : "bg-red-500";
  const tColor = scoreColor(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">{label}</span>
          <span className="text-[9px] text-slate-700">{weight}</span>
        </div>
        <div className="flex items-center gap-2">
          {raw && <span className="text-[10px] text-slate-600">{raw}</span>}
          <span className={`text-[11px] font-semibold tabular-nums ${tColor}`}>
            {value != null ? `${pct.toFixed(0)}` : "—"}
          </span>
        </div>
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
}: {
  label: string; value: string; accent?: "red" | "emerald";
}) {
  const textColor = accent === "red" ? "text-red-400" : accent === "emerald" ? "text-emerald-400" : "text-slate-200";
  return (
    <div>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${textColor}`}>{value}</p>
    </div>
  );
}
