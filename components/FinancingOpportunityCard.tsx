"use client";

import Link from "next/link";
import {
  OPPORTUNITY_STATUS_STYLES,
  OPPORTUNITY_RISK_STYLES,
  OPPORTUNITY_TYPE_ICONS,
  OPEN_OPPORTUNITY_STATUSES,
  formatOpportunityAmount,
  type FinancingOpportunity,
  type OpportunityRiskLevel,
} from "@/lib/financingOpportunity";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancingOpportunityCardProps {
  /** Opportunities to display — pass only open ones for best UX */
  opportunities: FinancingOpportunity[];
  loading?:      boolean;
  /** Link to the full financing opportunities page */
  fullHref?:     string;
  /** Card title — defaults to "Financing Opportunities" */
  title?:        string;
  /** Max opportunities shown inline (default: 3) */
  maxItems?:     number;
  /** Show the Generate button — admin-only, hidden by default */
  onGenerate?:   () => void;
  generating?:   boolean;
  /** Base currency for totals (default: "RM") */
  currency?:     string;
}

// ─── Risk level colour ring ───────────────────────────────────────────────────

const RING_COLOR: Record<OpportunityRiskLevel, string> = {
  Low:      "border-emerald-500/40",
  Medium:   "border-amber-500/40",
  High:     "border-orange-500/50",
  Critical: "border-red-500/60",
};

const SCORE_COLOR = (score: number | null): string => {
  if (score == null) return "text-slate-500";
  if (score >= 80)   return "text-emerald-400";
  if (score >= 65)   return "text-blue-400";
  if (score >= 50)   return "text-amber-400";
  return "text-red-400";
};

// ─── Highest risk level among opportunities ───────────────────────────────────

function highestRisk(opps: FinancingOpportunity[]): OpportunityRiskLevel {
  const order: OpportunityRiskLevel[] = ["Critical", "High", "Medium", "Low"];
  for (const level of order) {
    if (opps.some((o) => o.risk_level === level)) return level;
  }
  return "Low";
}

// ─── Best financeability score ────────────────────────────────────────────────

function bestScore(opps: FinancingOpportunity[]): number | null {
  const scores = opps.map((o) => o.financeability_score).filter((s): s is number => s != null);
  return scores.length > 0 ? Math.max(...scores) : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancingOpportunityCard({
  opportunities,
  loading     = false,
  fullHref,
  title       = "Financing Opportunities",
  maxItems    = 3,
  onGenerate,
  generating  = false,
  currency    = "RM",
}: FinancingOpportunityCardProps) {
  const openOpps   = opportunities.filter((o) =>
    (OPEN_OPPORTUNITY_STATUSES as string[]).includes(o.opportunity_status),
  );
  const totalAmount = openOpps.reduce((s, o) => s + (o.base_amount ?? o.requested_amount ?? 0), 0);
  const topRisk     = openOpps.length > 0 ? highestRisk(openOpps) : null;
  const topScore    = bestScore(openOpps);
  const preview     = openOpps.slice(0, maxItems);
  const remaining   = Math.max(0, openOpps.length - maxItems);

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4" />
        <div className="h-8 bg-slate-700 rounded w-1/2 mb-3" />
        <div className="h-3 bg-slate-700/60 rounded w-full mb-2" />
        <div className="h-3 bg-slate-700/60 rounded w-3/4" />
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────

  if (openOpps.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {onGenerate && (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="text-xs px-3 py-1 bg-violet-600/80 hover:bg-violet-600 text-white rounded-lg disabled:opacity-40 transition-colors"
            >
              {generating ? "Generating…" : "⚡ Generate"}
            </button>
          )}
        </div>
        <p className="text-slate-500 text-xs">No open financing opportunities found.</p>
        {fullHref && (
          <Link href={fullHref} className="text-xs text-violet-400 hover:text-violet-300 mt-2 inline-block">
            View all →
          </Link>
        )}
      </div>
    );
  }

  // ─── Main card ──────────────────────────────────────────────────────────────

  return (
    <div className={`bg-slate-800/60 border rounded-2xl p-5 space-y-4 ${topRisk ? RING_COLOR[topRisk] : "border-slate-700/60"}`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {topRisk && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${OPPORTUNITY_RISK_STYLES[topRisk]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
              {topRisk}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onGenerate && (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="text-xs px-3 py-1 bg-violet-600/80 hover:bg-violet-600 text-white rounded-lg disabled:opacity-40 transition-colors"
            >
              {generating ? "Generating…" : "⚡ Generate"}
            </button>
          )}
          {fullHref && (
            <Link href={fullHref} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
              View all →
            </Link>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Open</p>
          <p className="text-xl font-bold text-violet-400">{openOpps.length}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Total Amount</p>
          <p className="text-sm font-bold text-amber-400 truncate">
            {formatOpportunityAmount(totalAmount, currency)}
          </p>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Best Score</p>
          <p className={`text-xl font-bold ${SCORE_COLOR(topScore)}`}>
            {topScore != null ? topScore : "—"}
            {topScore != null && <span className="text-xs font-normal opacity-60">/100</span>}
          </p>
        </div>
      </div>

      {/* Opportunity list */}
      <div className="space-y-2">
        {preview.map((o) => (
          <div
            key={o.id}
            className="flex items-start gap-3 bg-slate-900/40 border border-slate-700/30 rounded-xl px-3 py-2.5"
          >
            <span className="text-lg mt-0.5 leading-none shrink-0">
              {OPPORTUNITY_TYPE_ICONS[o.opportunity_type]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-200">{o.opportunity_type}</span>
                {o.job_reference && (
                  <span className="font-mono text-xs text-slate-500">{o.job_reference}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-semibold text-amber-400">
                  {formatOpportunityAmount(o.base_amount ?? o.requested_amount, o.base_currency ?? o.currency)}
                </span>
                {o.suggested_tenure_days != null && (
                  <span className="text-xs text-slate-500">{o.suggested_tenure_days}d</span>
                )}
                {o.pricing_band && (
                  <span className="text-xs text-slate-500">{o.pricing_band}</span>
                )}
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs border ${OPPORTUNITY_STATUS_STYLES[o.opportunity_status]}`}>
                  {o.opportunity_status}
                </span>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              {o.financeability_score != null && (
                <span className={`text-xs font-bold ${SCORE_COLOR(o.financeability_score)}`}>
                  {o.financeability_score}/100
                </span>
              )}
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${OPPORTUNITY_RISK_STYLES[o.risk_level]}`}>
                {o.risk_level}
              </span>
            </div>
          </div>
        ))}

        {remaining > 0 && (
          <p className="text-xs text-slate-500 text-center py-1">
            +{remaining} more{fullHref && (
              <> — <Link href={fullHref} className="text-violet-400 hover:text-violet-300">view all</Link></>
            )}
          </p>
        )}
      </div>

      {/* Compliance note */}
      <p className="text-xs text-slate-600 border-t border-slate-700/40 pt-3">
        Financing opportunities are system-classified funding gap assessments — decision-support only. Not a loan approval, credit approval, or confirmed financing offer.
      </p>
    </div>
  );
}
