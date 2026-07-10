"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  type CompanyIntelligenceRow,
  RISK_BADGE,
  FINANCING_BADGE,
  TREND_ICON,
  TREND_COLOR,
} from "@/lib/companyIntelligence";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  companyId:   string | null | undefined;
  companyName: string;
  label:       string;  // e.g. "Customer Intelligence" | "Provider Intelligence"
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompanyIntelligenceCard({ companyId, companyName, label }: Props) {
  const [intel,   setIntel]   = useState<CompanyIntelligenceRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    supabase
      .from("company_intelligence_profiles")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        setIntel(data as CompanyIntelligenceRow | null);
        setLoading(false);
      });
  }, [companyId]);

  if (!companyId) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-200">{companyName}</p>
        </div>
        <Link
          href={`/admin/companies/${companyId}`}
          className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors flex-shrink-0"
        >
          View Profile →
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-slate-700 animate-pulse">Loading…</p>
      ) : !intel ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
          <p className="text-xs text-slate-700">No intelligence data yet.</p>
          <Link href={`/admin/companies/${companyId}`} className="mt-1 block text-[10px] text-blue-500/60 hover:text-blue-400 transition-colors">
            Recalculate →
          </Link>
        </div>
      ) : (
        <>
          {/* Score + badges row */}
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            {/* Trust score circle */}
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-900">
              <span className={`text-base font-bold tabular-nums ${
                (intel.overall_trust_score ?? 0) >= 80 ? "text-emerald-400" :
                (intel.overall_trust_score ?? 0) >= 60 ? "text-amber-400"   :
                (intel.overall_trust_score ?? 0) >= 40 ? "text-red-400"     : "text-red-300"
              }`}>
                {intel.overall_trust_score ?? "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${RISK_BADGE[intel.risk_level]}`}>
                  {intel.risk_level} Risk
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${FINANCING_BADGE[intel.financing_readiness]}`}>
                  {intel.financing_readiness}
                </span>
              </div>
              <span className={`text-[10px] font-medium ${TREND_COLOR[intel.trend]}`}>
                {TREND_ICON[intel.trend]} {intel.trend}
              </span>
            </div>
          </div>

          {/* Score bars */}
          <div className="flex flex-col gap-2 mb-4">
            <MiniScoreBar label="Payment"     score={intel.payment_behavior_score} />
            <MiniScoreBar label="Operations"  score={intel.operational_reliability_score} />
            <MiniScoreBar label="Documents"   score={intel.document_completeness_score} />
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <QuickStat label="Total Jobs"  value={intel.total_jobs} />
            <QuickStat label="Completed"   value={intel.completed_jobs} color="text-emerald-400" />
            <QuickStat label="Open Issues" value={intel.open_exceptions} color={intel.open_exceptions > 0 ? "text-amber-400" : undefined} />
          </div>

          {/* Critical exception warning */}
          {intel.critical_exceptions > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2 text-[10px] text-red-400">
              ⚠ {intel.critical_exceptions} critical exception{intel.critical_exceptions > 1 ? "s" : ""} active
            </div>
          )}

          {/* Recommended terms */}
          {intel.recommended_terms && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Recommended Terms</p>
              <p className="text-[10px] leading-relaxed text-slate-500">{intel.recommended_terms}</p>
            </div>
          )}

          {/* Last calculated */}
          <p className="mt-3 text-[9px] text-slate-700">
            Last scored {intel.last_calculated_at ? intel.last_calculated_at.slice(0, 10) : "never"}
          </p>
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MiniScoreBar({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  const barColor = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : score >= 40 ? "bg-red-400" : "bg-red-600";
  const textColor = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 flex-shrink-0 text-[10px] text-slate-600">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`w-6 text-right text-[10px] font-semibold tabular-nums ${textColor}`}>{score}</span>
    </div>
  );
}

function QuickStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 px-2.5 py-2 text-center">
      <p className={`text-sm font-bold tabular-nums ${color ?? "text-slate-400"}`}>{value}</p>
      <p className="text-[9px] text-slate-700 mt-0.5">{label}</p>
    </div>
  );
}
