"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  SETTLEMENT_STATUS_BADGE,
  SETTLEMENT_STATUS_ICON,
  isSettlementBlocking,
  fmtSettlementAmount,
  settlementDelta,
  type ReleaseSettlementRow,
  type SettlementStatus,
} from "@/lib/releaseSettlement";

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "All",                   value: "" },
  { label: "Pending",               value: "Pending" },
  { label: "Processing",            value: "Processing" },
  { label: "Released",              value: "Released" },
  { label: "Amount Mismatch",       value: "Amount Mismatch" },
  { label: "Reference Mismatch",    value: "Reference Mismatch" },
  { label: "Failed",                value: "Failed" },
  { label: "Reconciled",            value: "Reconciled" },
  { label: "Cancelled",             value: "Cancelled" },
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color = "text-slate-200", highlight = false,
}: {
  label:     string;
  value:     string | number;
  sub?:      string;
  color?:    string;
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

export default function ReleaseSettlementsPage() {
  const [settlements, setSettlements] = useState<ReleaseSettlementRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [jobFilter,    setJobFilter]    = useState("");
  const [payeeFilter,  setPayeeFilter]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({ limit: "500" });
    if (statusFilter) params.set("status",       statusFilter);
    if (jobFilter.trim()) params.set("jobReference", jobFilter.trim());

    const res  = await fetch(`/api/release-settlements?${params.toString()}`);
    const json = await res.json() as { data?: ReleaseSettlementRow[]; error?: string };

    if (json.error) {
      setError(json.error);
    } else {
      let rows = json.data ?? [];
      if (payeeFilter.trim()) {
        const q = payeeFilter.trim().toLowerCase();
        rows = rows.filter((r) => r.payee_name?.toLowerCase().includes(q) || r.payee_bank_name?.toLowerCase().includes(q));
      }
      setSettlements(rows);
    }
    setLoading(false);
  }, [statusFilter, jobFilter, payeeFilter]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived metrics ────────────────────────────────────────────────────────

  const pending        = settlements.filter((s) => s.settlement_status === "Pending");
  const processing     = settlements.filter((s) => s.settlement_status === "Processing");
  const released       = settlements.filter((s) => s.settlement_status === "Released");
  const reconciled     = settlements.filter((s) => s.settlement_status === "Reconciled");
  const failed         = settlements.filter((s) => s.settlement_status === "Failed");
  const amtMismatch    = settlements.filter((s) => s.settlement_status === "Amount Mismatch");
  const blocking       = settlements.filter(isSettlementBlocking);

  const primaryCurrency = settlements[0]?.currency ?? "RM";
  const totalExpected   = settlements.reduce((s, r) => s + Number(r.expected_release_amount), 0);
  const totalReconciled = reconciled.reduce((s, r) => s + Number(r.actual_released_amount ?? r.expected_release_amount), 0);

  // Total released this month
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const releasedThisMonth = [...released, ...reconciled].filter(
    (s) => s.released_at && new Date(s.released_at) >= thisMonth
  );
  const totalReleasedThisMonth = releasedThisMonth.reduce(
    (sum, s) => sum + Number(s.actual_released_amount ?? s.expected_release_amount), 0
  );

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
                <p className="text-xs font-bold text-slate-200">Release / Settlement Reconciliation</p>
                <p className="text-[10px] text-slate-600">Manual settlement tracking — provider payouts</p>
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
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="Approved / Pending"
              value={pending.length}
              sub="awaiting payout"
              color={pending.length > 0 ? "text-amber-400" : "text-slate-400"}
            />
            <MetricCard
              label="Processing"
              value={processing.length}
              sub="transfer in progress"
              color={processing.length > 0 ? "text-blue-400" : "text-slate-400"}
            />
            <MetricCard
              label="Released — Not Reconciled"
              value={released.length}
              sub="needs reconciliation"
              color={released.length > 0 ? "text-cyan-400" : "text-slate-400"}
              highlight={released.length > 0}
            />
            <MetricCard
              label="Failed / Mismatch"
              value={blocking.length}
              sub="requires admin action"
              color={blocking.length > 0 ? "text-red-400" : "text-slate-400"}
              highlight={blocking.length > 0}
            />
            <MetricCard
              label="Reconciled"
              value={reconciled.length}
              color={reconciled.length > 0 ? "text-emerald-400" : "text-slate-400"}
            />
            <MetricCard
              label="Released This Month"
              value={`${primaryCurrency} ${fmt(totalReleasedThisMonth)}`}
              color="text-purple-400"
            />
          </div>

          {/* ── Alert banners ── */}
          {blocking.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-700/30 bg-red-950/20 px-4 py-3">
              <p className="mb-1 text-xs font-semibold text-red-400">
                ⚠ {blocking.length} settlement{blocking.length !== 1 ? "s" : ""} in a blocking state — admin action required.
              </p>
              <div className="flex flex-col gap-1">
                {blocking.map((s) => (
                  <Link key={s.id} href={`/admin/jobs/${s.job_reference}`} className="text-[10px] font-mono text-red-300 hover:text-red-200">
                    {s.job_reference} — {s.settlement_status} — {s.currency} {fmt(s.expected_release_amount)}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {released.length > 0 && (
            <div className="mb-4 rounded-xl border border-cyan-700/30 bg-cyan-950/10 px-4 py-3">
              <p className="text-xs text-cyan-400">
                ℹ {released.length} settlement{released.length !== 1 ? "s" : ""} marked Released but not yet Reconciled. Verify and reconcile to financially close the job.
              </p>
            </div>
          )}

          {/* ── Filters ── */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TABS.map(({ label, value }) => {
                const count =
                  value === "Pending"    ? pending.length :
                  value === "Processing" ? processing.length :
                  value === "Released"   ? released.length :
                  value === "Reconciled" ? reconciled.length :
                  value === "Failed"     ? failed.length :
                  value === "Amount Mismatch" ? amtMismatch.length : 0;
                return (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition-colors ${
                      statusFilter === value
                        ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                        : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {label}{count > 0 && value !== "" ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              placeholder="Filter by job reference…"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={payeeFilter}
              onChange={(e) => setPayeeFilter(e.target.value)}
              placeholder="Filter by payee / bank…"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={load}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

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
                <span className="animate-pulse text-xs text-slate-600">Loading settlements…</span>
              </div>
            ) : settlements.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-xs text-slate-600">
                  {statusFilter || jobFilter || payeeFilter
                    ? "No settlements match the current filter."
                    : "No settlement records found."}
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
                      <Th>Actual</Th>
                      <Th>Delta</Th>
                      <Th>Payee</Th>
                      <Th>Bank</Th>
                      <Th>TX Ref</Th>
                      <Th>Released</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {settlements.map((s) => {
                      const delta   = settlementDelta(s);
                      const blocking = isSettlementBlocking(s);

                      return (
                        <tr
                          key={s.id}
                          className={`transition-colors hover:bg-slate-800/30 ${blocking ? "bg-red-950/10" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/jobs/${s.job_reference}`}
                              className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {s.job_reference}
                            </Link>
                          </td>

                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${SETTLEMENT_STATUS_BADGE[s.settlement_status as SettlementStatus] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                              {SETTLEMENT_STATUS_ICON[s.settlement_status as SettlementStatus]}{" "}
                              {s.settlement_status}
                            </span>
                          </td>

                          <td className="px-4 py-3 tabular-nums text-slate-300">
                            {fmtSettlementAmount(s.expected_release_amount, s.currency)}
                          </td>

                          <td className="px-4 py-3 tabular-nums">
                            <span className={s.actual_released_amount == null ? "text-slate-600" : delta === 0 ? "text-emerald-400" : "text-amber-400"}>
                              {fmtSettlementAmount(s.actual_released_amount, s.currency)}
                            </span>
                          </td>

                          <td className="px-4 py-3 tabular-nums">
                            {delta == null ? (
                              <span className="text-slate-600">—</span>
                            ) : delta === 0 ? (
                              <span className="text-emerald-400">✓</span>
                            ) : (
                              <span className={delta > 0 ? "text-blue-400" : "text-red-400"}>
                                {delta > 0 ? "+" : ""}{fmtSettlementAmount(delta, s.currency)}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-slate-400">
                            {s.payee_name ?? <span className="text-slate-700">—</span>}
                          </td>

                          <td className="px-4 py-3 text-slate-400">
                            {s.payee_bank_name ?? <span className="text-slate-700">—</span>}
                          </td>

                          <td className="px-4 py-3">
                            {s.bank_transaction_reference
                              ? <span className="font-mono text-slate-400">{s.bank_transaction_reference}</span>
                              : <span className="text-slate-700">—</span>}
                          </td>

                          <td className="px-4 py-3 text-slate-600">
                            {s.released_at
                              ? <span title={s.released_at}>{timeAgo(s.released_at)}</span>
                              : <span className="text-slate-700">—</span>}
                          </td>

                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/jobs/${s.job_reference}`}
                              className="rounded border border-blue-600/40 bg-blue-600/15 px-2 py-1 text-[9px] font-semibold text-blue-300 hover:bg-blue-600/25 transition-colors whitespace-nowrap"
                            >
                              Open Job →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Footer summary ── */}
          {!loading && settlements.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-6 text-[10px] text-slate-600">
              <span>{settlements.length} records shown</span>
              <span>Total Expected: {primaryCurrency} {fmt(totalExpected)}</span>
              <span>Total Reconciled: {primaryCurrency} {fmt(totalReconciled)}</span>
              <span>Reconciled: {reconciled.length} · Blocking: {blocking.length}</span>
            </div>
          )}

          {/* ── Pilot note ── */}
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
            <p className="text-[10px] text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-600">Settlement Pilot Mode:</span>{" "}
              All settlement reconciliation is performed manually by Nexum Admin.
              No bank API is connected. Admin records actual transfer details and marks settlement status.
              Financial closure (job status = Completed) only occurs when settlement status is{" "}
              <span className="font-semibold text-emerald-600">Reconciled</span>.
              Actual fund transfer must be processed through an approved bank or licensed payment partner.
            </p>
          </div>

        </main>
      </div>
    </AuthGuard>
  );
}
