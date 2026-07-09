"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link                                       from "next/link";
import { supabase }                               from "@/lib/supabaseClient";
import { useAuth }                                from "@/contexts/AuthContext";
import {
  ALL_OPPORTUNITY_STATUSES,
  ALL_OPPORTUNITY_TYPES,
  OPPORTUNITY_STATUS_STYLES,
  OPPORTUNITY_RISK_STYLES,
  OPPORTUNITY_TYPE_ICONS,
  formatOpportunityAmount,
  type FinancingOpportunity,
  type OpportunityStatus,
  type OpportunityType,
  type OpportunityRiskLevel,
} from "@/lib/financingOpportunity";

const RISK_LEVELS: OpportunityRiskLevel[] = ["Low", "Medium", "High", "Critical"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company { id: string; name: string; company_type?: string | null; }

// ─── Financeability score badge ───────────────────────────────────────────────

function FinScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-500 text-xs">—</span>;
  const color =
    score >= 80 ? "text-emerald-400" :
    score >= 65 ? "text-blue-400"    :
    score >= 50 ? "text-amber-400"   : "text-red-400";
  return <span className={`font-bold text-sm ${color}`}>{score}<span className="text-xs font-normal opacity-70">/100</span></span>;
}

// ─── Action options ───────────────────────────────────────────────────────────

function actionOptions(status: OpportunityStatus): { label: string; action: string; danger?: boolean }[] {
  const opts: { label: string; action: string; danger?: boolean }[] = [];
  if (status === "Detected")                                        opts.push({ label: "Mark Under Review",          action: "mark_under_review" });
  if (["Detected", "Under Review"].includes(status))               opts.push({ label: "Mark Ready for Simulation",  action: "mark_ready_for_simulation" });
  if (["Under Review", "Ready for Simulation"].includes(status))   opts.push({ label: "Create Financing Simulation",action: "create_simulation" });
  if (!["Not Suitable","Dismissed","Closed","Simulation Created"].includes(status))
    opts.push({ label: "Mark Not Suitable", action: "mark_not_suitable", danger: true });
  if (!["Dismissed","Closed"].includes(status))                    opts.push({ label: "Dismiss",  action: "dismiss", danger: true });
  if (!["Closed"].includes(status))                                opts.push({ label: "Close",    action: "close",   danger: true });
  opts.push({ label: "Add Review Note", action: "add_review_note" });
  return opts;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminCompanyFinancingOpportunitiesPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  const { profile: authProfile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [company,        setCompany]        = useState<Company | null>(null);
  const [opportunities,  setOpportunities]  = useState<FinancingOpportunity[]>([]);
  const [total,          setTotal]          = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [generating,     setGenerating]     = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter,   setTypeFilter]   = useState("");
  const [riskFilter,   setRiskFilter]   = useState("");

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Action state
  const [acting,      setActing]      = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ id: string; ref: string; action: string } | null>(null);
  const [reviewNote,  setReviewNote]  = useState("");
  const [actionMsg,   setActionMsg]   = useState<string | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadOpportunities = useCallback(async () => {
    if (!authProfile) return;
    setLoading(true);
    setError(null);

    const token = await getToken();
    const qp = new URLSearchParams({
      company_id: companyId,
      limit:      String(limit),
      offset:     String(offset),
    });
    if (statusFilter) qp.set("opportunity_status", statusFilter);
    if (typeFilter)   qp.set("opportunity_type",   typeFilter);
    if (riskFilter)   qp.set("risk_level",         riskFilter);

    const [companyRes, oppRes] = await Promise.all([
      fetch(`/api/admin/company?id=${companyId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      fetch(`/api/financing-opportunities?${qp}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (companyRes?.ok) {
      const cj = await companyRes.json().catch(() => null);
      if (cj?.company) setCompany(cj.company);
    }

    if (!oppRes.ok) { setError("Failed to load opportunities."); setLoading(false); return; }
    const oj = await oppRes.json();
    setOpportunities(oj.opportunities ?? []);
    setTotal(oj.total ?? 0);
    setLoading(false);
  }, [authProfile, companyId, statusFilter, typeFilter, riskFilter, offset]);

  useEffect(() => { loadOpportunities(); }, [loadOpportunities]);

  // ── Generate now ────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!authProfile) return;
    setGenerating(true);
    setGenerateResult(null);

    const token = await getToken();
    const res = await fetch("/api/financing-opportunities/generate", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ company_id: companyId }),
    });

    const json = await res.json();
    if (!res.ok) {
      setGenerateResult(`Error: ${json.error ?? "Generation failed"}`);
    } else {
      setGenerateResult(`Generated ${json.created} new opportunity(ies). ${json.skipped} already existed.`);
      await loadOpportunities();
    }
    setGenerating(false);
  }

  // ── Action handler ──────────────────────────────────────────────────────────

  async function handleAction(id: string, action: string, note?: string) {
    if (!authProfile) return;
    setActing(id);
    setActionMsg(null);

    const token = await getToken();
    const res = await fetch("/api/financing-opportunities", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ id, action, review_note: note }),
    });

    const json = await res.json();
    if (res.ok) {
      const msg = action === "create_simulation" && json.financing_offer_id
        ? `Simulation created — offer ID: ${json.financing_offer_id}`
        : "Done.";
      setActionMsg(msg);
      await loadOpportunities();
    } else {
      setActionMsg(`Error: ${json.error ?? "Failed"}`);
    }
    setActing(null);
    setReviewModal(null);
    setReviewNote("");
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const totalAmount  = opportunities.reduce((s, o) => s + (o.base_amount ?? o.requested_amount ?? 0), 0);
  const baseCur      = opportunities[0]?.base_currency ?? "RM";
  const strongCount  = opportunities.filter((o) => (o.financeability_score ?? 0) >= 80).length;
  const simReadyCount = opportunities.filter((o) => o.opportunity_status === "Ready for Simulation" || o.opportunity_status === "Simulation Created").length;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/companies" className="hover:text-white transition-colors">Companies</Link>
          <span>›</span>
          <Link href={`/admin/companies/${companyId}`} className="hover:text-white transition-colors">
            {company?.name ?? companyId}
          </Link>
          <span>›</span>
          <span className="text-white">Financing Opportunities</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Financing Opportunities</h1>
            <p className="text-slate-400 text-sm mt-1">
              {company?.name ?? "Company"} — classified financing opportunities. Decision-support only.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-colors"
          >
            {generating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </>
            ) : "⚡ Generate Financing Opportunities"}
          </button>
        </div>

        {/* Generate result */}
        {generateResult && (
          <div className={`text-sm px-4 py-2 rounded-lg border ${generateResult.startsWith("Error") ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
            {generateResult}
          </div>
        )}

        {/* Stats */}
        {opportunities.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Opportunities" value={String(total)}                          color="violet" />
            <StatCard label="Total Amount"         value={formatOpportunityAmount(totalAmount, baseCur)}    color="amber"  />
            <StatCard label="Strong (≥80)"         value={String(strongCount)}                  color="emerald"/>
            <StatCard label="Ready / Simulated"    value={String(simReadyCount)}                color="blue"   />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            {ALL_OPPORTUNITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            {ALL_OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{OPPORTUNITY_TYPE_ICONS[t as OpportunityType]} {t}</option>)}
          </select>

          <select
            value={riskFilter}
            onChange={(e) => { setRiskFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          {(statusFilter || typeFilter || riskFilter) && (
            <button
              onClick={() => { setStatusFilter(""); setTypeFilter(""); setRiskFilter(""); setOffset(0); }}
              className="px-3 py-2 text-xs text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/40"
            >
              Clear Filters
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
          ) : opportunities.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <p className="text-slate-500">No financing opportunities generated yet.</p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm disabled:opacity-40"
              >
                Generate Now
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-slate-400 text-left">
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Job Ref</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Tenure</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Band</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Rationale</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {opportunities.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">{o.opportunity_reference}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <span>{OPPORTUNITY_TYPE_ICONS[o.opportunity_type]}</span>
                          <span className="text-slate-300">{o.opportunity_type}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {o.job_reference ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-400 whitespace-nowrap">
                        {formatOpportunityAmount(o.base_amount ?? o.requested_amount, o.base_currency ?? o.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-center">
                        {o.suggested_tenure_days != null ? `${o.suggested_tenure_days}d` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <FinScoreBadge score={o.financeability_score} />
                      </td>
                      <td className="px-4 py-3">
                        {o.pricing_band ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${
                            o.pricing_band.startsWith("Strong")    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                            o.pricing_band.startsWith("Reviewable")? "bg-blue-500/10 border-blue-500/30 text-blue-400" :
                            o.pricing_band.startsWith("High")      ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
                                                                     "bg-red-500/10 border-red-500/30 text-red-400"
                          }`}>
                            {o.pricing_band}
                          </span>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${OPPORTUNITY_RISK_STYLES[o.risk_level]}`}>
                          {o.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${OPPORTUNITY_STATUS_STYLES[o.opportunity_status]}`}>
                          {o.opportunity_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px]">
                        <span className="line-clamp-2">{o.rationale ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ActionDropdown
                          opp={o}
                          acting={acting === o.id}
                          onAction={(action) => {
                            if (action === "add_review_note" || action === "mark_not_suitable" || action === "dismiss" || action === "close") {
                              setReviewModal({ id: o.id, ref: o.opportunity_reference, action });
                            } else {
                              handleAction(o.id, action);
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
              className="px-3 py-1.5 text-sm border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700/40">Previous</button>
            <button disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)}
              className="px-3 py-1.5 text-sm border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700/40">Next</button>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-slate-600 text-center border-t border-slate-800 pt-4">
          Financing opportunities are system-classified funding gap assessments for decision-support only.
          Not a loan approval, credit approval, guaranteed funding, or confirmed financing offer.
        </p>
      </div>

      {/* Review note / reason modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold text-white">
              {reviewModal.action === "add_review_note" ? "Add Review Note" :
               reviewModal.action === "mark_not_suitable" ? "Mark Not Suitable" :
               reviewModal.action === "dismiss" ? "Dismiss Opportunity" :
               "Close Opportunity"}
            </h3>
            <p className="text-sm text-slate-400 font-mono">{reviewModal.ref}</p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={4}
              placeholder="Enter note or reason (optional for dismiss/close)…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setReviewModal(null); setReviewNote(""); }}
                className="px-4 py-2 text-sm text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/40">Cancel</button>
              <button
                disabled={reviewModal.action === "add_review_note" && !reviewNote.trim()}
                onClick={() => handleAction(reviewModal.id, reviewModal.action, reviewNote.trim() || undefined)}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-40 ${
                  reviewModal.action === "add_review_note" ? "bg-violet-600 hover:bg-violet-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {reviewModal.action === "add_review_note" ? "Save Note" : "Confirm"}
              </button>
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
    violet: "text-violet-400", amber: "text-amber-400", emerald: "text-emerald-400", blue: "text-blue-400",
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorMap[color] ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function ActionDropdown({
  opp,
  acting,
  onAction,
}: {
  opp: FinancingOpportunity;
  acting: boolean;
  onAction: (action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const opts = actionOptions(opp.opportunity_status);

  if (acting) return <span className="text-xs text-slate-400">Working…</span>;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-xs border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700/40 whitespace-nowrap"
      >
        Actions ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 min-w-[220px]">
            {opts.map((opt) => (
              <button
                key={opt.action}
                onClick={() => { setOpen(false); onAction(opt.action); }}
                className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-800 transition-colors ${opt.danger ? "text-red-400" : "text-slate-300"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
