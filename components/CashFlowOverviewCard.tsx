"use client";

import Link from "next/link";
import type {
  CashflowSnapshot,
  CashflowRiskFlag,
  CashflowRiskLevel,
} from "@/lib/cashflow";
import {
  RISK_LEVEL_STYLES,
  SEVERITY_STYLES,
  formatAmount,
} from "@/lib/cashflow";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CashFlowOverviewCardProps {
  snapshot:   Partial<CashflowSnapshot> | null;
  riskFlags?: CashflowRiskFlag[];
  currency?:  string;
  fullHref?:  string;   // link to the full cashflow page
  title?:     string;
  loading?:   boolean;
  /** Max risk flags to show inline (default 3) */
  maxFlags?:  number;
}

// ─── Metric tile ─────────────────────────────────────────────────────────────

function Tile({
  label,
  value,
  accent,
  sub,
}: {
  label:  string;
  value:  string;
  accent: string;
  sub?:   string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`text-sm font-bold ${accent}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-600">{sub}</p>}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CashFlowOverviewCard({
  snapshot,
  riskFlags = [],
  currency  = "RM",
  fullHref,
  title     = "Cash Flow Overview",
  loading   = false,
  maxFlags  = 3,
}: CashFlowOverviewCardProps) {
  const cur = snapshot?.currency ?? currency;

  function amt(n: number | null | undefined) {
    if (n == null) return "—";
    return formatAmount(n, cur);
  }

  const riskLevel = (snapshot?.risk_level ?? "Medium") as CashflowRiskLevel;
  const visibleFlags = riskFlags.slice(0, maxFlags);
  const extraFlags   = riskFlags.length - visibleFlags.length;

  const fundingGap = snapshot?.projected_funding_gap ?? 0;

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-5">
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-slate-100">{title}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${RISK_LEVEL_STYLES[riskLevel]}`}
          >
            {riskLevel} Risk
          </span>
        </div>
        {fullHref && (
          <Link
            href={fullHref}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-blue-500/60 hover:text-blue-400"
          >
            View full cash-flow →
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center text-sm text-slate-500">
          Loading cash-flow data…
        </div>
      ) : !snapshot ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-sm text-slate-500">
          No cash-flow data yet.{" "}
          {fullHref && (
            <Link href={fullHref} className="text-blue-400 underline">
              Add items
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* ── Metric grid ── */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label="Expected Inflow"
              value={amt(snapshot.total_expected_inflow)}
              accent="text-emerald-400"
            />
            <Tile
              label="Expected Outflow"
              value={amt(snapshot.total_expected_outflow)}
              accent="text-red-400"
            />
            <Tile
              label="Nexum Held"
              value={amt(snapshot.total_nexum_held)}
              accent="text-blue-400"
              sub="Nexum-controlled"
            />
            <Tile
              label="Expected Release"
              value={amt(snapshot.total_nexum_release_expected)}
              accent="text-purple-400"
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label="Receivables"
              value={amt(snapshot.total_receivables)}
              accent="text-emerald-300"
            />
            <Tile
              label="Payables"
              value={amt(snapshot.total_payables)}
              accent="text-amber-300"
            />
            <Tile
              label="Overdue Recv."
              value={amt(snapshot.total_overdue_receivables)}
              accent={(snapshot.total_overdue_receivables ?? 0) > 0 ? "text-red-400" : "text-slate-400"}
            />
            <Tile
              label="Overdue Pay."
              value={amt(snapshot.total_overdue_payables)}
              accent={(snapshot.total_overdue_payables ?? 0) > 0 ? "text-red-400" : "text-slate-400"}
            />
          </div>

          {/* ── Net position / funding gap ── */}
          {fundingGap > 0 ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-red-300">
                  ⚠ Projected Funding Gap
                </span>
                <span className="font-mono text-sm font-bold text-red-400">
                  {formatAmount(fundingGap, cur)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Cash-flow projection — decision-support only. Not a confirmed cash position.
              </p>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-400">
                  Net Cash Position
                </span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  {amt(snapshot.net_cash_position)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Funding gap estimate: nil (projected inflows cover outflows).
              </p>
            </div>
          )}

          {/* ── Risk flags ── */}
          {visibleFlags.length > 0 && (
            <div className="space-y-1.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Cash-Flow Risk Flags
              </p>
              {visibleFlags.map((f) => (
                <div
                  key={f.code}
                  className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_STYLES[f.severity]}`}
                >
                  <span className="font-semibold">{f.label}</span>
                  <span className="ml-1 opacity-80">— {f.description}</span>
                </div>
              ))}
              {extraFlags > 0 && fullHref && (
                <p className="text-[11px] text-slate-500">
                  +{extraFlags} more flag{extraFlags > 1 ? "s" : ""}.{" "}
                  <Link href={fullHref} className="text-blue-400 underline">
                    View all
                  </Link>
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Compliance footer ── */}
      <p className="mt-4 text-[10px] leading-relaxed text-slate-600">
        Cash-flow projection — self-reported / system-derived. Not a confirmed cash position.
        Funding gap estimate is decision-support only. Do not use as credit approval or
        guaranteed repayment evidence.
      </p>
    </div>
  );
}
