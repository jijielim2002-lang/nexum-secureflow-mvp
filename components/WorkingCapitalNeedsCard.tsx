"use client";

import Link from "next/link";
import {
  NEED_STATUS_STYLES,
  NEED_RISK_STYLES,
  NEED_TYPE_ICONS,
  formatGap,
  type WorkingCapitalNeed,
  type NeedRiskLevel,
} from "@/lib/workingCapital";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkingCapitalNeedsCardProps {
  /** Needs to display — pass only open/active ones for best UX */
  needs:       WorkingCapitalNeed[];
  loading?:    boolean;
  /** Link to the full working capital page */
  fullHref?:   string;
  /** Card title — defaults to "Working Capital Needs" */
  title?:      string;
  /** Max needs shown inline (default: 3) */
  maxNeeds?:   number;
  /** Show the Detect button — admin-only, hidden by default */
  onDetect?:   () => void;
  detecting?:  boolean;
  /** Base currency for totals (default: "RM") */
  currency?:   string;
}

// ─── Risk level colour ring ───────────────────────────────────────────────────

const RING_COLOR: Record<NeedRiskLevel, string> = {
  Low:      "border-emerald-500/40",
  Medium:   "border-amber-500/40",
  High:     "border-orange-500/50",
  Critical: "border-red-500/60",
};

const DOT_COLOR: Record<NeedRiskLevel, string> = {
  Low:      "bg-emerald-400",
  Medium:   "bg-amber-400",
  High:     "bg-orange-400",
  Critical: "bg-red-500",
};

// ─── Highest risk level ───────────────────────────────────────────────────────

function highestRisk(needs: WorkingCapitalNeed[]): NeedRiskLevel {
  const order: NeedRiskLevel[] = ["Critical", "High", "Medium", "Low"];
  for (const level of order) {
    if (needs.some((n) => n.risk_level === level)) return level;
  }
  return "Low";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkingCapitalNeedsCard({
  needs,
  loading    = false,
  fullHref,
  title      = "Working Capital Needs",
  maxNeeds   = 3,
  onDetect,
  detecting  = false,
  currency   = "RM",
}: WorkingCapitalNeedsCardProps) {
  const openNeeds  = needs.filter((n) =>
    ["Detected", "Under Review", "Eligible for Simulation"].includes(n.need_status),
  );
  const totalGap   = openNeeds.reduce((s, n) => s + (n.base_gap_amount ?? n.gap_amount ?? 0), 0);
  const topRisk    = openNeeds.length > 0 ? highestRisk(openNeeds) : null;
  const preview    = openNeeds.slice(0, maxNeeds);
  const remaining  = Math.max(0, openNeeds.length - maxNeeds);

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

  if (openNeeds.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {onDetect && (
            <button
              onClick={onDetect}
              disabled={detecting}
              className="text-xs px-3 py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg disabled:opacity-40 transition-colors"
            >
              {detecting ? "Detecting…" : "⚡ Detect Now"}
            </button>
          )}
        </div>
        <p className="text-slate-500 text-xs">No open working capital needs detected.</p>
        {fullHref && (
          <Link href={fullHref} className="text-xs text-blue-400 hover:text-blue-300 mt-2 inline-block">
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
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${NEED_RISK_STYLES[topRisk]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR[topRisk]}`} />
              {topRisk}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onDetect && (
            <button
              onClick={onDetect}
              disabled={detecting}
              className="text-xs px-3 py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg disabled:opacity-40 transition-colors"
            >
              {detecting ? "Detecting…" : "⚡ Detect"}
            </button>
          )}
          {fullHref && (
            <Link href={fullHref} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              View all →
            </Link>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Open Needs</p>
          <p className="text-xl font-bold text-amber-400">{openNeeds.length}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-0.5">Total Gap</p>
          <p className="text-base font-bold text-amber-400 truncate">{formatGap(totalGap, currency)}</p>
        </div>
      </div>

      {/* Need list */}
      <div className="space-y-2">
        {preview.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 bg-slate-900/40 border border-slate-700/30 rounded-xl px-3 py-2.5"
          >
            <span className="text-lg mt-0.5 leading-none">{NEED_TYPE_ICONS[n.need_type]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-200">{n.need_type}</span>
                {n.job_reference && (
                  <span className="font-mono text-xs text-slate-500">{n.job_reference}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-semibold text-amber-400">
                  {formatGap(n.base_gap_amount ?? n.gap_amount, n.base_currency ?? n.currency)}
                </span>
                {n.estimated_gap_days != null && (
                  <span className="text-xs text-slate-500">{n.estimated_gap_days}d gap</span>
                )}
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs border ${NEED_STATUS_STYLES[n.need_status]}`}>
                  {n.need_status}
                </span>
              </div>
            </div>
            <div className="shrink-0">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${NEED_RISK_STYLES[n.risk_level]}`}>
                {n.risk_level}
              </span>
            </div>
          </div>
        ))}

        {remaining > 0 && (
          <p className="text-xs text-slate-500 text-center py-1">
            +{remaining} more need{remaining > 1 ? "s" : ""}{fullHref && (
              <> — <Link href={fullHref} className="text-blue-400 hover:text-blue-300">view all</Link></>
            )}
          </p>
        )}
      </div>

      {/* Compliance note */}
      <p className="text-xs text-slate-600 border-t border-slate-700/40 pt-3">
        Working capital need detected — funding gap estimate only. Not a loan approval or financing commitment.
      </p>
    </div>
  );
}
