"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase }                          from "@/lib/supabaseClient";
import { useAuth }                           from "@/contexts/AuthContext";
import {
  NEED_STATUS_STYLES,
  NEED_RISK_STYLES,
  NEED_TYPE_ICONS,
  ALL_NEED_TYPES,
  ALL_NEED_STATUSES,
  formatGap,
  type WorkingCapitalNeed,
  type NeedType,
  type NeedRiskLevel,
} from "@/lib/workingCapital";

const RISK_LEVELS: NeedRiskLevel[] = ["Low", "Medium", "High", "Critical"];

export default function ProviderWorkingCapitalPage() {
  const { profile } = useAuth();

  const [needs,    setNeeds]    = useState<WorkingCapitalNeed[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter,   setTypeFilter]   = useState("");
  const [riskFilter,   setRiskFilter]   = useState("");
  const [offset,       setOffset]       = useState(0);
  const limit = 50;

  const loadNeeds = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const params = new URLSearchParams({
      company_id: profile.company_id,
      limit:      String(limit),
      offset:     String(offset),
    });
    if (statusFilter) params.set("need_status", statusFilter);
    if (typeFilter)   params.set("need_type",   typeFilter);
    if (riskFilter)   params.set("risk_level",  riskFilter);

    const res = await fetch(`/api/working-capital/needs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setError("Failed to load working capital needs."); setLoading(false); return; }
    const json = await res.json();
    setNeeds(json.needs ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [profile?.company_id, statusFilter, typeFilter, riskFilter, offset]);

  useEffect(() => { loadNeeds(); }, [loadNeeds]);

  const totalGap = needs.reduce((s, n) => s + (n.base_gap_amount ?? n.gap_amount ?? 0), 0);
  const baseCur  = needs[0]?.base_currency ?? "RM";
  const openCount = needs.filter((n) => ["Detected", "Under Review", "Eligible for Simulation"].includes(n.need_status)).length;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Working Capital Needs</h1>
          <p className="text-slate-400 text-sm mt-1">
            System-detected funding gaps for your company. Contact your Nexum account manager for financing simulation enquiries.
          </p>
        </div>

        {/* Context banner */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300">
          <strong>For Freight Forwarders & Logistics Providers:</strong> Detected gaps typically include vendor-before-release timing gaps, carrier payment obligations, logistics fee shortfalls, and claim reserve exposure.
          These are funding gap estimates only — not financing approvals.
        </div>

        {/* Stats */}
        {needs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Open Needs</p>
              <p className="text-2xl font-bold text-amber-400">{openCount}</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Total Gap Amount</p>
              <p className="text-2xl font-bold text-amber-400">{formatGap(totalGap, baseCur)}</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Total Detected</p>
              <p className="text-2xl font-bold text-blue-400">{total}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {ALL_NEED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Types</option>
            {ALL_NEED_TYPES.map((t) => <option key={t} value={t}>{NEED_TYPE_ICONS[t as NeedType]} {t}</option>)}
          </select>
          <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-slate-500">Loading…</div>
          ) : error ? (
            <div className="py-20 text-center text-red-400">{error}</div>
          ) : needs.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-slate-500 text-lg mb-2">No working capital needs detected yet.</p>
              <p className="text-slate-600 text-sm">Needs are detected automatically by the Nexum system. Check back after your next job update.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-slate-400 text-left">
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Gap Amount</th>
                    <th className="px-4 py-3 font-medium">Gap Days</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Repayment Source</th>
                    <th className="px-4 py-3 font-medium">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {needs.map((n) => (
                    <tr key={n.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">{n.need_reference}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span>{NEED_TYPE_ICONS[n.need_type]}</span>
                          <span className="text-slate-300 whitespace-nowrap">{n.need_type}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{n.job_reference ?? n.procurement_reference ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-amber-400 whitespace-nowrap">
                        {formatGap(n.base_gap_amount ?? n.gap_amount, n.base_currency ?? n.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-center">{n.estimated_gap_days != null ? `${n.estimated_gap_days}d` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${NEED_RISK_STYLES[n.risk_level]}`}>
                          {n.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${NEED_STATUS_STYLES[n.need_status]}`}>
                          {n.need_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px]">
                        <span className="line-clamp-2">{n.repayment_source ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px]">
                        <span className="line-clamp-2">{n.rationale ?? "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center gap-3 justify-end">
            <span className="text-slate-400 text-sm">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
            <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}
              className="px-3 py-1.5 text-sm border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40">Previous</button>
            <button disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)}
              className="px-3 py-1.5 text-sm border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40">Next</button>
          </div>
        )}

        <p className="text-xs text-slate-600 text-center border-t border-slate-800 pt-4">
          Working capital needs are funding gap estimates — decision-support only.
          Not a loan approval, credit approval, guaranteed funding, or confirmed repayment.
          Contact your Nexum account manager to discuss financing simulation eligibility.
        </p>
      </div>
    </div>
  );
}
