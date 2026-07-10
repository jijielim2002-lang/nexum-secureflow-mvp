"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  feeStatusBadge,
  feeTypeColor,
  fmtFee,
  FEE_COMPLIANCE_NOTE,
  FEE_TYPE_OPTIONS,
  FEE_STATUS_OPTIONS,
  VALID_FEE_ACTIONS_BY_STATUS,
  type ServiceFeeRow,
  type FeeStatus,
} from "@/lib/nexumFee";

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? "text-slate-200"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ServiceFeesPage() {
  const [fees,      setFees]      = useState<ServiceFeeRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [acting,    setActing]    = useState<string | null>(null);
  const [waivedId,  setWaivedId]  = useState<string | null>(null);
  const [waivedReason, setWaivedReason] = useState("");

  // Filters
  const [filterStatus,   setFilterStatus]   = useState("");
  const [filterFeeType,  setFilterFeeType]  = useState("");
  const [filterJobRef,   setFilterJobRef]   = useState("");
  const [filterFrom,     setFilterFrom]     = useState("");
  const [filterTo,       setFilterTo]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    const params = new URLSearchParams();
    if (filterStatus)  params.set("status",  filterStatus);
    if (filterFeeType) params.set("feeType", filterFeeType);
    if (filterJobRef)  params.set("jobReference", filterJobRef.trim());
    if (filterFrom)    params.set("from", filterFrom);
    if (filterTo)      params.set("to",   filterTo);

    const res = await fetch(`/api/service-fees?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Load failed"); setLoading(false); return; }
    setFees(json.data ?? []);
    setLoading(false);
  }, [filterStatus, filterFeeType, filterJobRef, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: string, reason?: string) {
    setActing(id);
    setError(null);
    const token = await getToken();
    const res = await fetch(`/api/service-fees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, waived_reason: reason }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Action failed"); }
    setActing(null);
    setWaivedId(null);
    setWaivedReason("");
    await load();
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const allActive    = fees.filter((f) => !["Cancelled","Waived"].includes(f.fee_status));
  const approved     = fees.filter((f) => f.fee_status === "Approved");
  const waived       = fees.filter((f) => f.fee_status === "Waived");
  const collected    = fees.filter((f) => f.fee_status === "Collected");
  const exported     = fees.filter((f) => f.fee_status === "Exported");
  const calculated   = fees.filter((f) => f.fee_status === "Calculated");

  const totalCalc    = allActive.reduce((s, f) => s + Number(f.fee_amount), 0);
  const totalApproved= approved.reduce((s, f) => s + Number(f.fee_amount), 0);
  const totalColl    = collected.reduce((s, f) => s + Number(f.fee_amount), 0);
  const totalWaived  = waived.reduce((s, f) => s + Number(f.fee_amount), 0);

  // by fee type breakdown
  const byType: Record<string, number> = {};
  for (const f of allActive) {
    byType[f.fee_type] = (byType[f.fee_type] ?? 0) + Number(f.fee_amount);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/fee-rules" className="hover:text-purple-300 text-purple-400/80 transition-colors">Fee Rules</Link>
            <Link href="/admin/accounting-exports" className="hover:text-emerald-300 text-emerald-400/80 transition-colors">Accounting Exports</Link>
            <Link href="/admin/net-settlements" className="hover:text-cyan-300 text-cyan-400/80 transition-colors">Net Settlements</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Title */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Service Fees</h1>
            <p className="text-xs text-slate-500 mt-1">
              Platform revenue tracking. Fees are not automatically charged — for internal record only.
            </p>
          </div>
          <Link
            href="/admin/fee-rules"
            className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            Manage Fee Rules →
          </Link>
        </div>

        {/* Compliance note */}
        <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3">
          <p className="text-[10px] text-amber-500/80">{FEE_COMPLIANCE_NOTE}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Stat label="Total Calculated (Active)" value={fmtFee(totalCalc)}     color="text-purple-400" sub={`${allActive.length} fees`} />
          <Stat label="Approved"                  value={fmtFee(totalApproved)} color="text-emerald-400" sub={`${approved.length} fees`} />
          <Stat label="Collected"                 value={fmtFee(totalColl)}     color="text-cyan-400"    sub={`${collected.length} fees`} />
          <Stat label="Waived"                    value={fmtFee(totalWaived)}   color="text-amber-400"   sub={`${waived.length} fees`} />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Pending Approval</p>
            <p className="text-lg font-bold text-blue-400">{calculated.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Exported</p>
            <p className="text-lg font-bold text-teal-400">{exported.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Records</p>
            <p className="text-lg font-bold text-slate-200">{fees.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Approval Rate</p>
            <p className="text-lg font-bold text-slate-200">
              {fees.length > 0 ? `${Math.round((approved.length + collected.length) / fees.length * 100)}%` : "—"}
            </p>
          </div>
        </div>

        {/* By fee type */}
        {Object.keys(byType).length > 0 && (
          <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Fee Breakdown by Type (Active)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => (
                <div key={type} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2">
                  <span className={`text-[10px] font-medium ${feeTypeColor(type)}`}>{type}</span>
                  <span className="text-[10px] text-slate-300 font-mono">{fmtFee(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alerts */}
        {calculated.length > 0 && (
          <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
            <p className="text-xs text-blue-400 font-medium">
              {calculated.length} fee(s) pending approval — review and approve before export or collection.
            </p>
          </div>
        )}
        {approved.length > 0 && (
          <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs text-emerald-400 font-medium">
              {approved.length} fee(s) approved — ready to mark exported or collected.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4 mb-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Filters</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] text-slate-600 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
              >
                <option value="">All statuses</option>
                {FEE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 mb-1">Fee Type</label>
              <select
                value={filterFeeType}
                onChange={(e) => setFilterFeeType(e.target.value)}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
              >
                <option value="">All types</option>
                {FEE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 mb-1">Job Reference</label>
              <input
                type="text"
                value={filterJobRef}
                onChange={(e) => setFilterJobRef(e.target.value)}
                placeholder="e.g. JOB-001"
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-slate-900 border border-slate-700 text-slate-300 placeholder-slate-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 mb-1">From</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 mb-1">To</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={load}
              className="px-3 py-1.5 text-[11px] rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 transition-colors"
            >
              Apply Filters
            </button>
            <button
              onClick={() => {
                setFilterStatus(""); setFilterFeeType(""); setFilterJobRef("");
                setFilterFrom(""); setFilterTo("");
              }}
              className="px-3 py-1.5 text-[11px] rounded-lg text-slate-500 hover:text-slate-400 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
        )}

        {/* Fees list */}
        {loading ? (
          <div className="text-center py-12 text-sm text-slate-500">Loading service fees…</div>
        ) : fees.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
            <p className="text-xs text-slate-500">No service fees found.</p>
            <p className="text-[10px] text-slate-600 mt-1">Use "Calculate Fees" on individual jobs to generate fee records.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {fees.map((fee) => {
              const validActs = VALID_FEE_ACTIONS_BY_STATUS[fee.fee_status as FeeStatus] ?? [];
              const isWaiving = waivedId === fee.id;
              return (
                <div key={fee.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30">
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-medium ${feeTypeColor(fee.fee_type)}`}>{fee.fee_type}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${feeStatusBadge(fee.fee_status as FeeStatus)}`}>
                          {fee.fee_status}
                        </span>
                        {fee.job_reference && (
                          <Link
                            href={`/admin/jobs?ref=${fee.job_reference}`}
                            className="text-[10px] text-blue-400/80 hover:text-blue-300 transition-colors"
                          >
                            {fee.job_reference}
                          </Link>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{fee.fee_description ?? "—"}</p>
                      {fee.waived_reason && (
                        <p className="text-[10px] text-amber-500/80 mt-0.5">Waiver reason: {fee.waived_reason}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-purple-300">{fmtFee(fee.fee_amount, fee.currency)}</p>
                      {fee.base_amount > 0 && fee.base_amount !== fee.fee_amount && (
                        <p className="text-[10px] text-slate-500">base: {fmtFee(fee.base_amount, fee.currency)}</p>
                      )}
                      <p className="text-[10px] text-slate-600 mt-1">{new Date(fee.created_at).toLocaleDateString("en-MY")}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  {validActs.length > 0 && (
                    <div className="border-t border-slate-700/40 px-5 pb-3 pt-2 flex flex-col gap-2">
                      <div className="flex gap-2 flex-wrap">
                        {validActs.filter((a) => a !== "waive").map((act) => (
                          <button
                            key={act}
                            onClick={() => handleAction(fee.id, act)}
                            disabled={acting === fee.id}
                            className={`px-3 py-1 rounded-lg text-[11px] border transition-colors disabled:opacity-50 ${
                              act === "cancel"
                                ? "border-red-700/40 bg-red-900/30 text-red-400 hover:bg-red-900/50"
                                : act === "approve"
                                ? "border-emerald-700/40 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
                                : act === "mark_collected"
                                ? "border-cyan-700/40 bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50"
                                : act === "mark_exported"
                                ? "border-teal-700/40 bg-teal-900/30 text-teal-400 hover:bg-teal-900/50"
                                : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60"
                            }`}
                          >
                            {acting === fee.id ? "…" :
                              act === "approve"        ? "✓ Approve" :
                              act === "cancel"         ? "✕ Cancel" :
                              act === "mark_exported"  ? "→ Mark Exported" :
                              act === "mark_collected" ? "💰 Mark Collected" : act
                            }
                          </button>
                        ))}
                        {validActs.includes("waive") && (
                          <button
                            onClick={() => setWaivedId(isWaiving ? null : fee.id)}
                            className="px-3 py-1 rounded-lg text-[11px] border border-amber-700/40 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-colors"
                          >
                            ⊘ Waive
                          </button>
                        )}
                      </div>
                      {isWaiving && (
                        <div className="flex gap-2 mt-1">
                          <input
                            type="text"
                            value={waivedReason}
                            onChange={(e) => setWaivedReason(e.target.value)}
                            placeholder="Waiver reason (required)…"
                            className="flex-1 px-2 py-1.5 text-[11px] rounded-lg bg-slate-900 border border-amber-700/40 text-slate-200 placeholder-slate-600 focus:outline-none"
                          />
                          <button
                            onClick={() => handleAction(fee.id, "waive", waivedReason)}
                            disabled={!waivedReason.trim() || acting === fee.id}
                            className="px-3 py-1 rounded-lg text-[11px] bg-amber-900/60 text-amber-300 border border-amber-700/40 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button onClick={() => setWaivedId(null)} className="px-2 py-1 text-[11px] text-slate-500">✕</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Integration links */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { href: "/admin/fee-rules", label: "Fee Rules", desc: "Manage calculation rules", color: "text-purple-400", border: "border-purple-700/30" },
            { href: "/admin/accounting-exports", label: "Accounting Exports", desc: "Export fees to accounting records", color: "text-emerald-400", border: "border-emerald-700/30" },
            { href: "/admin/net-settlements", label: "Net Settlements", desc: "View service fee impact on settlements", color: "text-cyan-400", border: "border-cyan-700/30" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-xl border ${link.border} bg-slate-900/40 px-4 py-3 hover:bg-slate-800/40 transition-colors block`}
            >
              <p className={`text-xs font-medium ${link.color}`}>{link.label}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{link.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
