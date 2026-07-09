"use client";

import Link from "next/link";
import {
  GRADE_STYLES,
  STATUS_STYLES,
  scoreColor,
  formatRecommendedAmount,
  type JobFinanceabilityScore,
  type FinanceabilityGrade,
} from "@/lib/financeabilityScore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinanceabilityScoreCardProps {
  /** Score record to display — pass the latest score for this job/company */
  score?:       JobFinanceabilityScore | null;
  loading?:     boolean;
  /** Link to the full financeability scores page */
  fullHref?:    string;
  /** Card title — defaults to "Financeability Score" */
  title?:       string;
  /** Show the Calculate button — admin-only, hidden by default */
  onCalculate?: () => void;
  calculating?: boolean;
}

// ─── Score arc / dial ─────────────────────────────────────────────────────────

function ScoreArc({ score }: { score: number }) {
  // Simple SVG arc representing score 0-100
  const radius   = 32;
  const cx = 42; const cy = 42;
  const circumference = 2 * Math.PI * radius;
  const filled  = (score / 100) * circumference;
  const gap     = circumference - filled;

  const arcColor =
    score >= 85 ? "#34d399" :  // emerald-400
    score >= 75 ? "#60a5fa" :  // blue-400
    score >= 65 ? "#22d3ee" :  // cyan-400
    score >= 50 ? "#fbbf24" :  // amber-400
                  "#f87171";   // red-400

  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
      {/* Background track */}
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
      {/* Score arc */}
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none"
        stroke={arcColor}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${gap}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Score number */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={arcColor} fontSize="16" fontWeight="bold" className="font-mono">
        {score}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize="9">
        /100
      </text>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinanceabilityScoreCard({
  score,
  loading     = false,
  fullHref,
  title       = "Financeability Score",
  onCalculate,
  calculating = false,
}: FinanceabilityScoreCardProps) {

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4" />
        <div className="flex gap-4 items-center">
          <div className="w-20 h-20 bg-slate-700 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-700 rounded w-1/2" />
            <div className="h-3 bg-slate-700/60 rounded w-3/4" />
            <div className="h-3 bg-slate-700/60 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty / no score state ─────────────────────────────────────────────────

  if (!score) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {onCalculate && (
            <button
              onClick={onCalculate}
              disabled={calculating}
              className="text-xs px-3 py-1 bg-teal-600/80 hover:bg-teal-600 text-white rounded-lg disabled:opacity-40 transition-colors"
            >
              {calculating ? "Calculating…" : "⚡ Calculate"}
            </button>
          )}
        </div>
        <p className="text-slate-500 text-xs">Financeability score not yet calculated.</p>
        {fullHref && (
          <Link href={fullHref} className="text-xs text-teal-400 hover:text-teal-300 mt-2 inline-block">
            View scores →
          </Link>
        )}
      </div>
    );
  }

  // ─── Main card ──────────────────────────────────────────────────────────────

  const strengths  = (score.key_strengths as string[] | null) ?? [];
  const risks      = (score.key_risks as string[] | null) ?? [];
  const conditions = (score.required_conditions as string[] | null) ?? [];

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <div className="flex items-center gap-2">
          {onCalculate && (
            <button
              onClick={onCalculate}
              disabled={calculating}
              className="text-xs px-3 py-1 bg-teal-600/80 hover:bg-teal-600 text-white rounded-lg disabled:opacity-40 transition-colors"
            >
              {calculating ? "Calculating…" : "⚡ Recalculate"}
            </button>
          )}
          {fullHref && (
            <Link href={fullHref} className="text-xs text-teal-400 hover:text-teal-300 transition-colors">
              View all →
            </Link>
          )}
        </div>
      </div>

      {/* Score + grade + status */}
      <div className="flex items-center gap-4">
        <ScoreArc score={score.financeability_score} />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-sm border font-bold ${GRADE_STYLES[score.financeability_grade as FinanceabilityGrade]}`}>
              Grade {score.financeability_grade}
            </span>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${STATUS_STYLES[score.financeability_status]}`}>
              {score.financeability_status}
            </span>
          </div>
          {score.pricing_band && (
            <p className="text-xs text-slate-400">
              Pricing band: <span className="text-slate-200 font-medium">{score.pricing_band}</span>
              {score.recommended_fee_rate != null && (
                <span className="text-slate-500"> · {score.recommended_fee_rate}%/30d (indicative)</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Recommendation */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Recommended Product</p>
          <p className="text-xs font-semibold text-slate-200">{score.recommended_product ?? "—"}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Simulation Amount</p>
          <p className="text-xs font-bold text-amber-400">
            {formatRecommendedAmount(score.recommended_amount, score.currency)}
          </p>
        </div>
        {score.suggested_tenure_days != null && (
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-0.5">Suggested Tenure</p>
            <p className="text-xs font-semibold text-slate-200">{score.suggested_tenure_days} days</p>
          </div>
        )}
        {score.repayment_source && (
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-0.5">Repayment Source</p>
            <p className="text-xs text-slate-300 line-clamp-2">{score.repayment_source}</p>
          </div>
        )}
      </div>

      {/* Key strengths */}
      {strengths.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Key Strengths</p>
          <div className="space-y-0.5">
            {strengths.slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-400 text-xs mt-0.5">✓</span>
                <span className="text-xs text-slate-300">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key risks */}
      {risks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Key Risks</p>
          <div className="space-y-0.5">
            {risks.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-amber-400 text-xs mt-0.5">⚠</span>
                <span className="text-xs text-slate-300">{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required conditions */}
      {conditions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400">Required Before Simulation</p>
          <div className="space-y-0.5">
            {conditions.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-red-400 text-xs mt-0.5">!</span>
                <span className="text-xs text-slate-300">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance note */}
      <p className="text-xs text-slate-600 border-t border-slate-700/40 pt-3">
        Financeability score — decision-support only, subject to lender/admin review. Not a loan approval, credit approval, or committed facility.
      </p>
    </div>
  );
}
