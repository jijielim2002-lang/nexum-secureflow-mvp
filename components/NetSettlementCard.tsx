"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  settlementStatusBadge,
  settlementStatusIcon,
  lineTypeColor,
  isDeductionLine,
  fmtSettlement,
  isSettlementBlockingRelease,
  VALID_ACTIONS_BY_STATUS,
  SETTLEMENT_COMPLIANCE_NOTE,
  type NetSettlementStatement,
  type NetSettlementLineItem,
  type SettlementAction,
} from "@/lib/netSettlement";

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:       string;
  role:               "admin" | "service_provider" | "customer";
  currency?:          string;
  onStatementChange?: (stmt: NetSettlementStatement | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<SettlementAction, string> = {
  approve:    "Approve",
  regenerate: "Regenerate",
  dispute:    "Mark Disputed",
  cancel:     "Cancel",
  finalize:   "Finalize",
};

const ACTION_STYLES: Record<SettlementAction, string> = {
  approve:    "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
  regenerate: "border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25",
  dispute:    "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25",
  cancel:     "border-slate-600/50 bg-slate-800/60 text-slate-400 hover:text-slate-200",
  finalize:   "border-emerald-600/50 bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

type StmtWithItems = NetSettlementStatement & { net_settlement_line_items?: NetSettlementLineItem[] };

export function NetSettlementCard({ jobReference, role, currency = "RM", onStatementChange }: Props) {
  const [stmt,        setStmt]        = useState<StmtWithItems | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [actioning,   setActioning]   = useState<SettlementAction | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [showItems,   setShowItems]   = useState(true);
  const [showSnap,    setShowSnap]    = useState(false);

  // ── Load latest statement for this job ────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setLoading(false); return; }

      const res = await fetch(
        `/api/net-settlements?job_reference=${encodeURIComponent(jobReference)}&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        console.warn("[NetSettlementCard] load failed:", res.status, res.statusText);
        setError("Failed to load settlement statement.");
        return;
      }
      const json = await res.json();
      const latest = (json.data?.[0] as StmtWithItems) ?? null;
      setStmt(latest);
      onStatementChange?.(latest);
    } catch (e) {
      console.warn("[NetSettlementCard] unexpected error during load:", e);
      setError("Failed to load settlement statement.");
    } finally {
      setLoading(false);
    }
  }, [jobReference, onStatementChange]);

  useEffect(() => { load(); }, [load]);

  // ── Generate new statement ────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setGenerating(false); return; }

    const res = await fetch("/api/net-settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ job_reference: jobReference }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to generate"); setGenerating(false); return; }
    await load();
    setGenerating(false);
  }

  // ── Action on existing statement ──────────────────────────────────────────

  async function handleAction(action: SettlementAction) {
    if (!stmt) return;
    setActioning(action);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setActioning(null); return; }

    const res = await fetch(`/api/net-settlements/${stmt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Action failed"); setActioning(null); return; }
    await load();
    setActioning(null);
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  function handlePrint() {
    window.print();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const allowedActions = stmt
    ? VALID_ACTIONS_BY_STATUS[stmt.statement_status as keyof typeof VALID_ACTIONS_BY_STATUS] ?? []
    : [];

  const isBlocking = stmt ? isSettlementBlockingRelease(stmt.statement_status as never) : false;
  const lineItems  = stmt?.net_settlement_line_items ?? [];
  const cur        = stmt?.currency ?? currency;

  return (
    <>
      {/* ── Print styles ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #net-settlement-print, #net-settlement-print * { visibility: visible !important; }
          #net-settlement-print { position: absolute; top: 0; left: 0; width: 100%; background: white !important; color: black !important; padding: 32px; }
          .no-print { display: none !important; }
          .print-table { border-collapse: collapse; width: 100%; }
          .print-table th, .print-table td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; }
          .print-table th { background: #f0f0f0; font-weight: 600; text-align: left; }
          .print-amount-deduct { color: #dc2626; }
          .print-amount-positive { color: #16a34a; }
        }
      `}</style>

      <div id="net-settlement-print" className="rounded-xl border border-slate-700/60 bg-slate-900/80 p-5">

        {/* ── Header ── */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-base">
              ≡
            </div>
            <div>
              <p className="text-sm font-semibold text-cyan-300">Net Settlement Statement</p>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">
                Operational reference — {jobReference}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            {stmt && (
              <button
                onClick={handlePrint}
                className="rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                🖨 Print / PDF
              </button>
            )}
            {stmt && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${settlementStatusBadge(stmt.statement_status as never)}`}>
                {settlementStatusIcon(stmt.statement_status as never)} {stmt.statement_status}
              </span>
            )}
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-600">
            <span className="animate-pulse">◌</span> Loading settlement data…
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Disputed release block ── */}
        {isBlocking && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
            <span className="mt-px text-red-400">⛔</span>
            <div>
              <p className="text-sm font-semibold text-red-300">Release Blocked — Settlement Disputed</p>
              <p className="mt-0.5 text-xs text-red-400/80">
                Payment release cannot proceed while the net settlement statement is under dispute. Admin must resolve or override.
              </p>
            </div>
          </div>
        )}

        {/* ── No statement yet ── */}
        {!loading && !stmt && (
          <div className="mb-4 rounded-lg border border-dashed border-slate-700/60 bg-slate-800/30 px-4 py-6 text-center">
            <p className="text-sm text-slate-400">No settlement statement generated yet for this job.</p>
            <p className="mt-1 text-xs text-slate-600">
              A net settlement statement calculates the gross job value, payment obligations, claim reserves, and net release eligible amount.
            </p>
            {role === "admin" && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="no-print mt-4 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
              >
                {generating ? "Generating…" : "▶ Generate Statement"}
              </button>
            )}
          </div>
        )}

        {/* ── Statement exists ── */}
        {!loading && stmt && (
          <>
            {/* Summary grid */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: "Gross Job Value",       value: fmtSettlement(stmt.gross_job_value, cur),          color: "text-slate-200" },
                { label: "Verified Payments",      value: fmtSettlement(stmt.total_verified_payments, cur),  color: "text-emerald-400" },
                { label: "Payment Obligations",    value: fmtSettlement(stmt.total_payment_obligations, cur), color: "text-slate-300" },
                { label: "Active Reserves",        value: fmtSettlement(stmt.total_claim_reserves, cur),     color: "text-red-400" },
                { label: "Net Release Eligible",   value: fmtSettlement(stmt.net_release_eligible, cur),     color: "text-cyan-300 font-bold" },
                { label: "Outstanding Amount",     value: fmtSettlement(stmt.outstanding_amount, cur),       color: stmt.outstanding_amount > 0 ? "text-amber-400" : "text-slate-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2.5">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-sm font-semibold tabular-nums ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Additional breakdown (released, applied) */}
            {(stmt.total_claim_applied > 0 || stmt.total_released > 0 || stmt.total_additional_charges > 0) && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stmt.total_additional_charges > 0 && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                    <p className="text-[10px] text-amber-500/70 uppercase tracking-wider mb-1">Additional Charges</p>
                    <p className="text-sm font-semibold text-amber-400 tabular-nums">{fmtSettlement(stmt.total_additional_charges, cur)}</p>
                  </div>
                )}
                {stmt.total_claim_applied > 0 && (
                  <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2.5">
                    <p className="text-[10px] text-orange-500/70 uppercase tracking-wider mb-1">Claims Applied</p>
                    <p className="text-sm font-semibold text-orange-400 tabular-nums">{fmtSettlement(stmt.total_claim_applied, cur)}</p>
                  </div>
                )}
                {stmt.total_released > 0 && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
                    <p className="text-[10px] text-blue-500/70 uppercase tracking-wider mb-1">Total Released</p>
                    <p className="text-sm font-semibold text-blue-400 tabular-nums">{fmtSettlement(stmt.total_released, cur)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Net calculation display */}
            <div className="mb-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
              <p className="text-[10px] text-cyan-500/60 uppercase tracking-wider mb-2">Net Settlement Calculation</p>
              <div className="space-y-1 text-xs font-mono text-slate-400">
                <div className="flex justify-between">
                  <span>Verified payments</span>
                  <span className="text-emerald-400">+ {fmtSettlement(stmt.total_verified_payments, cur)}</span>
                </div>
                {stmt.total_additional_charges > 0 && (
                  <div className="flex justify-between">
                    <span>Additional charges</span>
                    <span className="text-amber-400">+ {fmtSettlement(stmt.total_additional_charges, cur)}</span>
                  </div>
                )}
                {stmt.total_claim_reserves > 0 && (
                  <div className="flex justify-between">
                    <span>Active reserves (potential claim)</span>
                    <span className="text-red-400">− {fmtSettlement(stmt.total_claim_reserves, cur)}</span>
                  </div>
                )}
                {stmt.total_claim_applied > 0 && (
                  <div className="flex justify-between">
                    <span>Claims applied</span>
                    <span className="text-orange-400">− {fmtSettlement(stmt.total_claim_applied, cur)}</span>
                  </div>
                )}
                {stmt.total_refunds > 0 && (
                  <div className="flex justify-between">
                    <span>Refunds</span>
                    <span className="text-purple-400">− {fmtSettlement(stmt.total_refunds, cur)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-cyan-500/20 pt-1 mt-1">
                  <span className="text-cyan-300 font-semibold">Net release eligible</span>
                  <span className="text-cyan-300 font-bold">= {fmtSettlement(stmt.net_release_eligible, cur)}</span>
                </div>
              </div>
            </div>

            {/* Line items table */}
            {lineItems.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowItems((v) => !v)}
                  className="no-print mb-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showItems ? "▾" : "▸"} Line items ({lineItems.length})
                </button>
                {showItems && (
                  <div className="overflow-x-auto rounded-lg border border-slate-700/50">
                    <table className="print-table w-full min-w-[480px] text-xs">
                      <thead>
                        <tr className="border-b border-slate-700/60 bg-slate-800/60">
                          <th className="px-3 py-2 text-left font-semibold text-slate-400">Line Item</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-400">Source</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-400">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-400">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/40">
                        {lineItems.map((li) => {
                          const isDeduct = isDeductionLine(li.line_type as never);
                          const amt      = Number(li.amount);
                          return (
                            <tr key={li.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className={`px-3 py-2 font-medium ${lineTypeColor(li.line_type as never)}`}>
                                {li.line_type ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">
                                {li.source_table ?? "—"}
                              </td>
                              <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${isDeduct ? "print-amount-deduct text-red-400" : amt >= 0 ? "print-amount-positive text-emerald-400" : "text-slate-400"}`}>
                                {amt < 0 ? `− ${fmtSettlement(Math.abs(amt), li.currency)}` : fmtSettlement(amt, li.currency)}
                              </td>
                              <td className="px-3 py-2 text-slate-500 text-[10px] leading-snug max-w-[200px] truncate" title={li.description ?? ""}>
                                {li.description ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="mb-4 text-[10px] text-slate-600 space-y-0.5">
              {stmt.generated_at && <p>Generated: {fmtDate(stmt.generated_at)}</p>}
              {stmt.approved_at  && <p>Approved:  {fmtDate(stmt.approved_at)}</p>}
              {stmt.finalized_at && <p>Finalized: {fmtDate(stmt.finalized_at)}</p>}
            </div>

            {/* Calculation snapshot (admin only) */}
            {role === "admin" && stmt.calculation_snapshot && (
              <div className="mb-4 no-print">
                <button
                  onClick={() => setShowSnap((v) => !v)}
                  className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                >
                  {showSnap ? "▾" : "▸"} Calculation snapshot
                </button>
                {showSnap && (
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-700/40 bg-slate-950 p-3 text-[10px] text-slate-500">
                    {JSON.stringify(stmt.calculation_snapshot, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Admin actions */}
            {role === "admin" && allowedActions.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 no-print">
                {(allowedActions as SettlementAction[]).map((action) => (
                  <button
                    key={action}
                    onClick={() => handleAction(action)}
                    disabled={actioning !== null}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${ACTION_STYLES[action]}`}
                  >
                    {actioning === action ? "…" : ACTION_LABELS[action]}
                  </button>
                ))}
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="no-print rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
                >
                  {generating ? "…" : "↺ New Statement"}
                </button>
              </div>
            )}

            {/* Print header (only shown when printing) */}
            <div className="hidden print:block mb-4 border-b border-gray-300 pb-4">
              <h1 className="text-xl font-bold text-gray-900">Net Settlement Statement</h1>
              <p className="text-sm text-gray-600 mt-1">Job Reference: {jobReference}</p>
              <p className="text-sm text-gray-600">Status: {stmt.statement_status}</p>
              {stmt.generated_at && <p className="text-sm text-gray-600">Generated: {fmtDate(stmt.generated_at)}</p>}
              {stmt.approved_at  && <p className="text-sm text-gray-600">Approved: {fmtDate(stmt.approved_at)}</p>}
              {stmt.finalized_at && <p className="text-sm text-gray-600">Finalized: {fmtDate(stmt.finalized_at)}</p>}
            </div>
          </>
        )}

        {/* ── Compliance note ── */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
          <p className="text-[10px] text-slate-600 leading-relaxed">{SETTLEMENT_COMPLIANCE_NOTE}</p>
        </div>
      </div>
    </>
  );
}
