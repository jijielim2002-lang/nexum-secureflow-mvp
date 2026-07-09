"use client";

// ─── /admin/claim-reserves — Claims / Recovery Reserve Admin Hub ──────────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  reserveStatusBadge,
  reserveTypeIcon,
  fmtReserveAmount,
  isReserveBlocking,
  totalActiveReserve,
  RESERVE_STATUS_OPTIONS,
  RESERVE_TYPE_OPTIONS,
  type ClaimReserveRow,
  type ReserveStatus,
  type ReserveType,
} from "@/lib/claimReserve";
import { ClaimReserveCard } from "@/components/ClaimReserveCard";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type StatusFilter = "all" | ReserveStatus;
type TypeFilter   = "all" | ReserveType;

export default function AdminClaimReservesPage() {
  const [reserves,      setReserves]      = useState<ClaimReserveRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("all");
  const [typeFilter,    setTypeFilter]    = useState<TypeFilter>("all");
  const [search,        setSearch]        = useState("");
  const [expanded,      setExpanded]      = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const params = new URLSearchParams({ limit: "500" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/claim-reserves?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { data } = await res.json() as { data: ClaimReserveRow[] };
      setReserves(data ?? []);
    } else {
      setError("Failed to load claim reserves.");
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const active          = reserves.filter((r) => r.reserve_status === "Active");
  const draft           = reserves.filter((r) => r.reserve_status === "Draft");
  const adjusted        = reserves.filter((r) => r.reserve_status === "Adjusted");
  const applied         = reserves.filter((r) => r.reserve_status === "Applied");
  const released        = reserves.filter((r) => r.reserve_status === "Released");
  const blocking        = reserves.filter(isReserveBlocking);
  const totalReserved   = totalActiveReserve(reserves);
  const pendingApproval = draft.length;
  const highValue       = reserves.filter((r) => isReserveBlocking(r) && r.reserve_amount > 50000);

  // ── Filtered ──────────────────────────────────────────────────────────────
  const filtered = reserves.filter((r) => {
    if (typeFilter !== "all" && r.reserve_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.job_reference.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aBlock = isReserveBlocking(a) ? 1 : 0;
    const bBlock = isReserveBlocking(b) ? 1 : 0;
    if (bBlock !== aBlock) return bBlock - aBlock;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/disputes" className="hover:text-slate-100 transition-colors">Disputes</Link>
            <Link href="/admin/liability-reviews" className="hover:text-slate-100 transition-colors">Liability Reviews</Link>
            <Link href="/admin/claim-reserves" className="text-amber-400 font-medium">Claim Reserves</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-50">Claims / Recovery Reserve Ledger</h1>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
              Internal Records Only
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Internal payment-control workflow. No funds are auto-deducted. All reserves require admin approval.
          </p>
        </div>

        {/* Metric cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Active Reserves"    value={active.length}        color={active.length > 0 ? "text-amber-400" : "text-slate-500"}    highlight={active.length > 0}  highlightColor="border-amber-500/30"  icon="🏦" />
          <MetricCard label="Pending Approval"   value={pendingApproval}      color={pendingApproval > 0 ? "text-blue-400" : "text-slate-500"}    highlight={pendingApproval > 0} highlightColor="border-blue-500/30"  icon="⏳" />
          <MetricCard label="Blocking Release"   value={blocking.length}      color={blocking.length > 0 ? "text-red-400" : "text-slate-500"}     highlight={blocking.length > 0} highlightColor="border-red-500/30"   icon="🔒" />
          <MetricCard label="High Value (>50k)"  value={highValue.length}     color={highValue.length > 0 ? "text-orange-400" : "text-slate-500"} highlight={highValue.length > 0} highlightColor="border-orange-500/30" icon="💰" />
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Reserved"  value={`RM ${totalReserved.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`} color={totalReserved > 0 ? "text-amber-300" : "text-slate-500"} highlight={false} icon="⚖" />
          <MetricCard label="Adjusted"        value={adjusted.length}  color="text-blue-400"    highlight={false} icon="✏" />
          <MetricCard label="Applied"         value={applied.length}   color="text-purple-400"  highlight={false} icon="✓" />
          <MetricCard label="Released"        value={released.length}  color="text-emerald-400" highlight={false} icon="🔓" />
        </div>

        {/* Alert: pending approval */}
        {pendingApproval > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-5 py-4">
            <span className="mt-0.5 text-base">⏳</span>
            <div>
              <p className="text-sm font-semibold text-blue-300">
                {pendingApproval} reserve{pendingApproval !== 1 ? "s" : ""} pending approval
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Draft reserves must be approved to become Active and count against release amounts.
              </p>
            </div>
          </div>
        )}

        {/* Alert: blocking release */}
        {blocking.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <span className="mt-0.5 text-base">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                {blocking.length} active reserve{blocking.length !== 1 ? "s" : ""} reducing available release amount
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Total reserved: {fmtReserveAmount(totalReserved, "RM")}. Payment releases require admin confirmation. Release subject to review.
              </p>
            </div>
          </div>
        )}

        {/* Compliance note */}
        <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-900/40 px-5 py-3">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Compliance:</span>{" "}
            This module records internal claim reserves for payment-control workflow only. No funds are auto-deducted or transferred. All reserve actions require admin approval. Reserves are preliminary records and do not constitute a legal determination of liability or a binding financial obligation. All positions require admin, legal, and insurance review.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search job reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-52"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {RESERVE_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Types</option>
            {RESERVE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-500">
            {sorted.length} of {reserves.length} reserve{reserves.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && (
          <>
            {sorted.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
                <p className="text-sm text-slate-500">No claim reserves found.</p>
                <p className="mt-1 text-xs text-slate-600">Reserves are created by admins from job pages when a dispute or liability review has a potential claim amount.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sorted.map((r) => (
                  <ReserveRow
                    key={r.id}
                    reserve={r}
                    expanded={expanded === r.id}
                    onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                    onUpdated={() => void load()}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── ReserveRow ────────────────────────────────────────────────────────────────

function ReserveRow({
  reserve, expanded, onToggle, onUpdated,
}: {
  reserve:   ClaimReserveRow;
  expanded:  boolean;
  onToggle:  () => void;
  onUpdated: () => void;
}) {
  const blocking = isReserveBlocking(reserve);

  return (
    <div className={`rounded-xl border overflow-hidden ${blocking ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900/40"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-900/60 transition-colors"
      >
        <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${reserveStatusBadge(reserve.reserve_status)}`}>
          {reserve.reserve_status}
        </span>
        <Link
          href={`/admin/jobs/${reserve.job_reference}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 font-mono text-sm text-blue-400 hover:text-blue-300 hover:underline underline-offset-2"
        >
          {reserve.job_reference}
        </Link>
        {reserve.reserve_type && (
          <span className="shrink-0 text-xs text-slate-400">
            {reserveTypeIcon(reserve.reserve_type)} {reserve.reserve_type}
          </span>
        )}
        <span className="shrink-0 font-semibold text-xs text-slate-200 tabular-nums">
          {fmtReserveAmount(reserve.reserve_amount, reserve.currency)}
        </span>
        {blocking && (
          <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
            Counting against release
          </span>
        )}
        <span className="ml-auto text-xs text-slate-600 tabular-nums shrink-0">{reserve.created_at.slice(0, 10)}</span>
        <span className="shrink-0 text-slate-600 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-800/60 px-5 py-5">
          <ClaimReserveCard
            jobReference={reserve.job_reference}
            role="admin"
            currency={reserve.currency}
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={onUpdated}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              ↺ Refresh list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({
  label, value, color, highlight = false, highlightColor = "border-slate-800", icon,
}: {
  label: string; value: number | string; color: string;
  highlight?: boolean; highlightColor?: string; icon: string;
}) {
  return (
    <div className={`rounded-xl border bg-slate-900/60 p-5 ${highlight ? highlightColor : "border-slate-800"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
