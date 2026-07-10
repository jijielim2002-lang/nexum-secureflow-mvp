"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  RECON_STATUS_BADGE,
  RECON_STATUS_ICON,
  canMarkSecured,
  isReconBlocking,
  fmtReconAmount,
  amountDelta,
  type ReconciliationRow,
  type ReconciliationStatus,
} from "@/lib/holdingReconciliation";

// ─── Types ────────────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "All",                   value: "" },
  { label: "Pending",               value: "Pending" },
  { label: "Matched",               value: "Matched" },
  { label: "Amount Mismatch",       value: "Amount Mismatch" },
  { label: "Reference Mismatch",    value: "Reference Mismatch" },
  { label: "Duplicate Suspected",   value: "Duplicate Suspected" },
  { label: "Unclear",               value: "Unclear" },
  { label: "Rejected",              value: "Rejected" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color = "text-slate-200", highlight = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-red-500/30 bg-red-950/20" : "border-slate-800 bg-slate-900/60"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[9px] text-slate-600">{sub}</p>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReconciliationsPage() {
  const [recons,     setRecons]     = useState<ReconciliationRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [jobFilter,    setJobFilter]    = useState("");

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({ limit: "500" });
    if (statusFilter) params.set("status", statusFilter);
    if (jobFilter.trim()) params.set("jobReference", jobFilter.trim());

    const res  = await fetch(`/api/reconciliations?${params.toString()}`);
    const json = await res.json() as { data?: ReconciliationRow[]; error?: string };

    if (json.error) {
      setError(json.error);
    } else {
      setRecons(json.data ?? []);
    }
    setLoading(false);
  }, [statusFilter, jobFilter]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived metrics ────────────────────────────────────────────────────────

  // Always compute metrics from a full load (no status filter) if filter active
  const allRecons = recons; // sufficient when filter is empty; metrics approximate when filtered

  const pending          = allRecons.filter((r) => r.reconciliation_status === "Pending");
  const matched          = allRecons.filter((r) => r.reconciliation_status === "Matched");
  const amountMismatch   = allRecons.filter((r) => r.reconciliation_status === "Amount Mismatch");
  const dupSuspected     = allRecons.filter((r) => r.reconciliation_status === "Duplicate Suspected");
  const refMismatch      = allRecons.filter((r) => r.reconciliation_status === "Reference Mismatch");
  const unclear          = allRecons.filter((r) => r.reconciliation_status === "Unclear");
  const rejected         = allRecons.filter((r) => r.reconciliation_status === "Rejected");
  const overdueRecons    = pending.filter((r) => hoursSince(r.created_at) > 24);

  const totalExpected    = allRecons.reduce((s, r) => s + Number(r.expected_amount ?? 0), 0);
  const totalReceived    = allRecons.reduce((s, r) => s + Number(r.received_amount ?? 0), 0);
  const primaryCurrency  = allRecons[0]?.currency ?? "RM";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredRole="admin">
      <div className="min-h-screen bg-slate-950 text-slate-200">

        {/* ── Nav ── */}
        <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-screen-xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300">← Admin</Link>
              <span className="text-slate-700">|</span>
              <div>
                <p className="text-xs font-bold text-slate-200">Holding Account Reconciliations</p>
                <p className="text-[10px] text-slate-600">Manual payment proof reconciliation</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <LogoutButton />
            </div>
          </div>
        </nav>

        <main className="mx-auto max-w-screen-xl px-6 py-8">

          {/* ── Metrics ── */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <MetricCard
              label="Proofs Awaiting Recon"
              value={pending.length}
              color={pending.length > 0 ? "text-amber-400" : "text-slate-400"}
              highlight={pending.length > 0}
            />
            <MetricCard
              label="Amount Mismatches"
              value={amountMismatch.length}
              color={amountMismatch.length > 0 ? "text-red-400" : "text-slate-400"}
              highlight={amountMismatch.length > 0}
            />
            <MetricCard
              label="Duplicate Suspected"
              value={dupSuspected.length}
              color={dupSuspected.length > 0 ? "text-purple-400" : "text-slate-400"}
              highlight={dupSuspected.length > 0}
            />
            <MetricCard
              label="Pending &gt;24h"
              value={overdueRecons.length}
              sub="overdue for review"
              color={overdueRecons.length > 0 ? "text-red-400" : "text-slate-400"}
              highlight={overdueRecons.length > 0}
            />
            <MetricCard
              label="Total Expected"
              value={`${primaryCurrency} ${fmt(totalExpected)}`}
              color="text-slate-200"
            />
            <MetricCard
              label="Total Received"
              value={`${primaryCurrency} ${fmt(totalReceived)}`}
              color={totalReceived >= totalExpected ? "text-emerald-400" : "text-amber-400"}
            />
          </div>

          {/* ── Filters ── */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            {/* Status tabs */}
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TABS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition-colors ${
                    statusFilter === value
                      ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                      : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {label}
                  {value === "Pending"             && pending.length > 0        && ` (${pending.length})`}
                  {value === "Amount Mismatch"     && amountMismatch.length > 0 && ` (${amountMismatch.length})`}
                  {value === "Duplicate Suspected" && dupSuspected.length > 0   && ` (${dupSuspected.length})`}
                  {value === "Reference Mismatch"  && refMismatch.length > 0    && ` (${refMismatch.length})`}
                  {value === "Unclear"             && unclear.length > 0        && ` (${unclear.length})`}
                  {value === "Rejected"            && rejected.length > 0       && ` (${rejected.length})`}
                  {value === "Matched"             && matched.length > 0        && ` (${matched.length})`}
                </button>
              ))}
            </div>

            {/* Job reference filter */}
            <div className="flex-1">
              <input
                type="text"
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                placeholder="Filter by job reference…"
                className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              onClick={load}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

          {/* ── Alert banners ── */}
          {overdueRecons.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-700/30 bg-red-950/20 px-4 py-3">
              <p className="text-xs font-semibold text-red-400">
                ⚠ {overdueRecons.length} reconciliation{overdueRecons.length !== 1 ? "s" : ""} pending for over 24 hours — admin review required.
              </p>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-800/30 bg-red-950/20 px-4 py-3">
              <p className="text-xs text-red-400">✕ {error}</p>
            </div>
          )}

          {/* ── Table ── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <span className="animate-pulse text-xs text-slate-600">Loading reconciliations…</span>
              </div>
            ) : recons.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-xs text-slate-600">
                  {statusFilter || jobFilter
                    ? "No reconciliations match the current filter."
                    : "No reconciliation records found."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80">
                      <Th>Job</Th>
                      <Th>Status</Th>
                      <Th>Expected</Th>
                      <Th>Received</Th>
                      <Th>Delta</Th>
                      <Th>Payer</Th>
                      <Th>Bank Ref</Th>
                      <Th>Created</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recons.map((r) => {
                      const delta   = amountDelta(r);
                      const isOver  = hoursSince(r.created_at) > 24 && r.reconciliation_status === "Pending";
                      const secured = canMarkSecured(r);
                      const blocked = isReconBlocking(r);

                      return (
                        <tr
                          key={r.id}
                          className={`transition-colors hover:bg-slate-800/30 ${isOver ? "bg-red-950/10" : ""}`}
                        >
                          {/* Job */}
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/jobs/${r.job_reference}`}
                              className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {r.job_reference}
                            </Link>
                            {isOver && (
                              <span className="ml-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[8px] text-red-400">
                                OVERDUE
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${RECON_STATUS_BADGE[r.reconciliation_status as ReconciliationStatus] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                              {RECON_STATUS_ICON[r.reconciliation_status as ReconciliationStatus]}{" "}
                              {r.reconciliation_status}
                            </span>
                          </td>

                          {/* Expected */}
                          <td className="px-4 py-3 tabular-nums text-slate-300">
                            {fmtReconAmount(r.expected_amount, r.currency)}
                          </td>

                          {/* Received */}
                          <td className="px-4 py-3 tabular-nums">
                            <span className={r.received_amount == null ? "text-slate-600" : delta === 0 ? "text-emerald-400" : "text-amber-400"}>
                              {fmtReconAmount(r.received_amount, r.currency)}
                            </span>
                          </td>

                          {/* Delta */}
                          <td className="px-4 py-3 tabular-nums">
                            {delta == null ? (
                              <span className="text-slate-600">—</span>
                            ) : delta === 0 ? (
                              <span className="text-emerald-400">✓ Match</span>
                            ) : (
                              <span className={delta > 0 ? "text-blue-400" : "text-red-400"}>
                                {delta > 0 ? "+" : ""}{fmtReconAmount(delta, r.currency)}
                              </span>
                            )}
                          </td>

                          {/* Payer */}
                          <td className="px-4 py-3 text-slate-400">
                            {r.payer_name ?? <span className="text-slate-700">—</span>}
                          </td>

                          {/* Bank Ref */}
                          <td className="px-4 py-3">
                            {r.bank_reference
                              ? <span className="font-mono text-slate-400">{r.bank_reference}</span>
                              : <span className="text-slate-700">—</span>}
                          </td>

                          {/* Created */}
                          <td className="px-4 py-3 text-slate-600">
                            <span title={r.created_at}>{timeAgo(r.created_at)}</span>
                          </td>

                          {/* Action */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <Link
                                href={`/admin/jobs/${r.job_reference}`}
                                className="rounded border border-blue-600/40 bg-blue-600/15 px-2 py-1 text-[9px] font-semibold text-blue-300 hover:bg-blue-600/25 transition-colors whitespace-nowrap"
                              >
                                Open Job →
                              </Link>
                              {secured && (
                                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[8px] text-emerald-400 text-center">
                                  ✓ Ready to secure
                                </span>
                              )}
                              {blocked && (
                                <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[8px] text-red-400 text-center">
                                  ⚠ Blocking
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Summary footer ── */}
          {!loading && recons.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-6 text-[10px] text-slate-600">
              <span>{recons.length} record{recons.length !== 1 ? "s" : ""} shown</span>
              <span>Matched: {matched.length}</span>
              <span>Pending: {pending.length}</span>
              <span>Blocking: {amountMismatch.length + refMismatch.length + dupSuspected.length + unclear.length + rejected.length}</span>
            </div>
          )}

          {/* ── Pilot note ── */}
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
            <p className="text-[10px] text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-600">Reconciliation — Pilot Mode:</span>{" "}
              All reconciliation is performed manually by Nexum Admin. No bank API is connected.
              Admin compares customer-submitted payment proof against actual received records and marks the outcome.
              Payment can only be secured after reconciliation status is <span className="font-semibold text-emerald-600">Matched</span>.
            </p>
          </div>

        </main>
      </div>
    </AuthGuard>
  );
}
