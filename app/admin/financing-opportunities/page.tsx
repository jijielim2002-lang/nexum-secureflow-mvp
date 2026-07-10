"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase }                          from "@/lib/supabaseClient";
import { useAuth }                           from "@/contexts/AuthContext";
import {
  OPPORTUNITY_STATUS_STYLES,
  OPPORTUNITY_RISK_STYLES,
  OPPORTUNITY_TYPE_ICONS,
  PRICING_BAND_STYLES,
  ALL_OPPORTUNITY_TYPES,
  ALL_OPPORTUNITY_STATUSES,
  formatOpportunityAmount,
  type FinancingOpportunity,
  type OpportunityStatus,
  type OpportunityType,
  type OpportunityRiskLevel,
  type PricingBand,
} from "@/lib/financingOpportunity";

// ─── Action options per status ────────────────────────────────────────────────

function actionOptions(status: OpportunityStatus) {
  const opts: { label: string; action: string; danger?: boolean }[] = [];
  if (status === "Detected")
    opts.push({ label: "Mark Under Review", action: "mark_under_review" });
  if (["Detected", "Under Review"].includes(status))
    opts.push({ label: "Mark Ready for Simulation", action: "mark_ready_for_simulation" });
  if (status === "Ready for Simulation")
    opts.push({ label: "Create Financing Simulation", action: "create_simulation" });
  if (!["Not Suitable", "Dismissed", "Closed"].includes(status))
    opts.push({ label: "Mark Not Suitable", action: "mark_not_suitable", danger: true });
  if (!["Dismissed", "Closed"].includes(status))
    opts.push({ label: "Dismiss", action: "dismiss", danger: true });
  if (!["Closed"].includes(status))
    opts.push({ label: "Close", action: "close", danger: true });
  opts.push({ label: "Add Review Note", action: "add_review_note" });
  return opts;
}

const RISK_LEVELS: OpportunityRiskLevel[] = ["Low", "Medium", "High", "Critical"];

// ─── Stats interface ──────────────────────────────────────────────────────────

interface Stats {
  total:        number;
  totalAmount:  number;
  strong:       number;
  readySim:     number;
  currency:     string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminFinancingOpportunitiesPage() {
  const { profile } = useAuth();

  const [opps,        setOpps]        = useState<FinancingOpportunity[]>([]);
  const [total,       setTotal]       = useState(0);
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter,   setTypeFilter]   = useState("");
  const [riskFilter,   setRiskFilter]   = useState("");
  const [offset,       setOffset]       = useState(0);
  const limit = 50;

  const [acting,      setActing]      = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ id: string; ref: string } | null>(null);
  const [reviewNote,  setReviewNote]  = useState("");
  const [actionMsg,   setActionMsg]   = useState<string | null>(null);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadOpps = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    const token = await getToken();
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (statusFilter) params.set("opportunity_status", statusFilter);
    if (typeFilter)   params.set("opportunity_type",   typeFilter);
    if (riskFilter)   params.set("risk_level",         riskFilter);

    const res = await fetch(`/api/financing-opportunities?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setError("Failed to load financing opportunities."); setLoading(false); return; }

    const json = await res.json();
    const rows: FinancingOpportunity[] = json.opportunities ?? [];
    setOpps(rows);
    setTotal(json.total ?? 0);

    if (!statusFilter && !typeFilter && !riskFilter && offset === 0) {
      const totalAmt = rows.reduce((s, o) => s + (o.base_amount ?? o.requested_amount ?? 0), 0);
      setStats({
        total:       json.total ?? 0,
        totalAmount: totalAmt,
        strong:      rows.filter((o) => o.pricing_band === "Strong opportunity").length,
        readySim:    rows.filter((o) => o.opportunity_status === "Ready for Simulation").length,
        currency:    rows[0]?.base_currency ?? "RM",
      });
    }
    setLoading(false);
  }, [profile, statusFilter, typeFilter, riskFilter, offset]);

  useEffect(() => { loadOpps(); }, [loadOpps]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleAction(id: string, action: string, note?: string) {
    if (!profile) return;
    setActing(id);
    setActionMsg(null);

    const token = await getToken();
    const res = await fetch("/api/financing-opportunities", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ id, action, review_note: note }),
    });

    const json = await res.json();
    setActionMsg(res.ok ? "Done." : `Error: ${json.error ?? "Action failed"}`);
    if (res.ok) await loadOpps();
    setActing(null);
    setReviewModal(null);
    setReviewNote("");
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Financing Opportunities</h1>
          <p className="text-slate-400 text-sm mt-1">
            System-classified financing opportunities derived from working capital needs. Decision-support only — not a credit approval or financing commitment.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Opportunities"    value={String(stats.total)}                             color="blue"    />
            <StatCard label="Total Amount"            value={formatOpportunityAmount(stats.totalAmount, stats.currency)} color="amber"   />
            <StatCard label="Strong Opportunities"    value={String(stats.strong)}                           color="emerald" />
            <StatCard label="Ready for Simulation"    value={String(stats.readySim)}                         color="purple"  />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {ALL_OPPORTUNITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Types</option>
            {ALL_OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{OPPORTUNITY_TYPE_ICONS[t as OpportunityType]} {t}</option>)}
          </select>
          <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {(statusFilter || typeFilter || riskFilter) && (
            <button onClick={() => { setStatusFilter(""); setTypeFilter(""); setRiskFilter(""); setOffset(0); }}
              className="text-slate-400 hover:text-white text-sm px-3 py-2 border border-slate-700 rounded-lg">
              Clear
            </button>
          )}
        </div>

        {/* Action message */}
        {actionMsg && (
          <div className={`text-sm px-4 py-2 rounded-lg border ${actionMsg.startsWith("Error") ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
            {actionMsg}
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-slate-500">Loading…</div>
          ) : error ? (
            <div className="py-20 text-center text-red-400">{error}</div>
          ) : opps.length === 0 ? (
            <div className="py-20 text-center text-slate-500">No financing opportunities found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-slate-400 text-left">
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Job / Proc.</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Tenure</th>
                    <th className="px-4 py-3 font-medium">Repayment Source</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Band</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {opps.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">{o.opportunity_reference}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white truncate max-w-[130px]">{o.company_name ?? "—"}</div>
                        {o.company_role && <div className="text-xs text-slate-500">{o.company_role}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <span>{OPPORTUNITY_TYPE_ICONS[o.opportunity_type]}</span>
                          <span className="text-slate-300">{o.opportunity_type}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{o.job_reference ?? o.procurement_reference ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-400 whitespace-nowrap">
                        {formatOpportunityAmount(o.base_amount ?? o.requested_amount, o.base_currency ?? o.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-center whitespace-nowrap">
                        {o.suggested_tenure_days != null ? `${o.suggested_tenure_days}d` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px]">
                        <span className="line-clamp-2">{o.repayment_source ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${OPPORTUNITY_RISK_STYLES[o.risk_level]}`}>
                          {o.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {o.financeability_score != null
                          ? <FinScoreBadge score={o.financeability_score} />
                          : "—"
                        }
                      </td>
                      <td className="px-4 py-3">
                        {o.pricing_band ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${PRICING_BAND_STYLES[o.pricing_band as PricingBand] ?? ""}`}>
                            {o.pricing_band}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${OPPORTUNITY_STATUS_STYLES[o.opportunity_status]}`}>
                          {o.opportunity_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ActionDropdown
                          opp={o}
                          acting={acting === o.id}
                          onAction={(ac) => {
                            if (ac === "add_review_note") {
                              setReviewModal({ id: o.id, ref: o.opportunity_reference });
                            } else {
                              handleAction(o.id, ac);
                            }
                          }}
                        />
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

        {/* Compliance */}
        <p className="text-xs text-slate-600 text-center border-t border-slate-800 pt-4">
          Financing opportunities are system-classified funding gap assessments for decision-support only.
          Not a loan approval, credit approval, guaranteed funding, or confirmed financing offer.
          All financeability scores and pricing bands are indicative and subject to full credit review.
        </p>
      </div>

      {/* Review note modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold text-white">Add Review Note</h3>
            <p className="text-sm text-slate-400">{reviewModal.ref}</p>
            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={4}
              placeholder="Enter review note…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setReviewModal(null); setReviewNote(""); }}
                className="px-4 py-2 text-sm text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/40">Cancel</button>
              <button disabled={!reviewNote.trim()} onClick={() => handleAction(reviewModal.id, "add_review_note", reviewNote.trim())}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40">Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400", amber: "text-amber-400",
    emerald: "text-emerald-400", purple: "text-purple-400",
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorMap[color] ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function FinScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-400" : score >= 65 ? "text-blue-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  return <span className={`font-semibold text-xs ${color}`}>{Math.round(score)}</span>;
}

function ActionDropdown({ opp, acting, onAction }: { opp: FinancingOpportunity; acting: boolean; onAction: (a: string) => void }) {
  const [open, setOpen] = useState(false);
  const opts = actionOptions(opp.opportunity_status);
  if (acting) return <span className="text-xs text-slate-400">Working…</span>;
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-xs border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700/40 whitespace-nowrap">
        Actions ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 min-w-[220px]">
            {opts.map((opt) => (
              <button key={opt.action} onClick={() => { setOpen(false); onAction(opt.action); }}
                className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-800 transition-colors ${opt.danger ? "text-red-400" : "text-slate-300"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
