"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link                                       from "next/link";
import { supabase }                               from "@/lib/supabaseClient";
import { useAuth }                                from "@/contexts/AuthContext";
import {
  NEED_STATUS_STYLES,
  NEED_RISK_STYLES,
  NEED_TYPE_ICONS,
  ALL_NEED_TYPES,
  ALL_NEED_STATUSES,
  formatGap,
  type WorkingCapitalNeed,
  type NeedStatus,
  type NeedType,
  type NeedRiskLevel,
} from "@/lib/workingCapital";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company { id: string; name: string; company_type?: string | null; }

const RISK_LEVELS: NeedRiskLevel[] = ["Low", "Medium", "High", "Critical"];

// ─── Action options ───────────────────────────────────────────────────────────

function actionOptions(status: NeedStatus): { label: string; action: string; danger?: boolean }[] {
  const opts: { label: string; action: string; danger?: boolean }[] = [];
  if (status === "Detected")                        opts.push({ label: "Mark Under Review",            action: "mark_under_review" });
  if (status === "Detected" || status === "Under Review") opts.push({ label: "Mark Eligible for Simulation", action: "mark_eligible_for_simulation" });
  if (status === "Under Review" || status === "Detected") opts.push({ label: "Mark Not Suitable",             action: "mark_not_suitable", danger: true });
  if (status === "Eligible for Simulation")         opts.push({ label: "Convert to Financing Simulation", action: "convert_to_simulation" });
  if (!["Resolved", "Dismissed"].includes(status))  opts.push({ label: "Resolve",  action: "resolve" });
  if (!["Resolved", "Dismissed"].includes(status))  opts.push({ label: "Dismiss",  action: "dismiss", danger: true });
  opts.push({ label: "Add Review Note", action: "add_review_note" });
  return opts;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminCompanyWorkingCapitalPage({
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

  const [company,      setCompany]      = useState<Company | null>(null);
  const [needs,        setNeeds]        = useState<WorkingCapitalNeed[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [detecting,    setDetecting]    = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter,   setTypeFilter]   = useState("");
  const [riskFilter,   setRiskFilter]   = useState("");

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Action state
  const [acting,      setActing]      = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ id: string; ref: string } | null>(null);
  const [reviewNote,  setReviewNote]  = useState("");
  const [actionMsg,   setActionMsg]   = useState<string | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadNeeds = useCallback(async () => {
    if (!authProfile) return;
    setLoading(true);
    setError(null);

    const token = await getToken();
    const params = new URLSearchParams({
      company_id: companyId,
      limit:      String(limit),
      offset:     String(offset),
    });
    if (statusFilter) params.set("need_status", statusFilter);
    if (typeFilter)   params.set("need_type",   typeFilter);
    if (riskFilter)   params.set("risk_level",  riskFilter);

    const [companyRes, needsRes] = await Promise.all([
      fetch(`/api/admin/company?id=${companyId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      fetch(`/api/working-capital/needs?${params}`,  { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    // Load company info from companies API or from existing data
    if (companyRes?.ok) {
      const cj = await companyRes.json().catch(() => null);
      if (cj?.company) setCompany(cj.company);
    }

    if (!needsRes.ok) { setError("Failed to load needs."); setLoading(false); return; }
    const nj = await needsRes.json();
    setNeeds(nj.needs ?? []);
    setTotal(nj.total ?? 0);
    setLoading(false);
  }, [authProfile, companyId, statusFilter, typeFilter, riskFilter, offset]);

  useEffect(() => { loadNeeds(); }, [loadNeeds]);

  // ── Detect now ──────────────────────────────────────────────────────────────

  async function handleDetect() {
    if (!authProfile) return;
    setDetecting(true);
    setDetectResult(null);

    const token = await getToken();
    const res = await fetch("/api/working-capital/detect", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ company_id: companyId }),
    });

    const json = await res.json();
    if (!res.ok) {
      setDetectResult(`Error: ${json.error ?? "Detection failed"}`);
    } else {
      setDetectResult(`Detected ${json.created} new need(s). ${json.skipped} already existed.`);
      await loadNeeds();
    }
    setDetecting(false);
  }

  // ── Action handler ──────────────────────────────────────────────────────────

  async function handleAction(id: string, action: string, note?: string) {
    if (!authProfile) return;
    setActing(id);
    setActionMsg(null);

    const token = await getToken();
    const res = await fetch("/api/working-capital/needs", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ id, action, review_note: note }),
    });

    const json = await res.json();
    setActionMsg(res.ok ? "Done." : `Error: ${json.error ?? "Failed"}`);
    if (res.ok) await loadNeeds();
    setActing(null);
    setReviewModal(null);
    setReviewNote("");
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const totalGap    = needs.reduce((s, n) => s + (n.base_gap_amount ?? n.gap_amount ?? 0), 0);
  const baseCur     = needs[0]?.base_currency ?? "RM";
  const highCrit    = needs.filter((n) => n.risk_level === "High" || n.risk_level === "Critical").length;
  const eligibleSim = needs.filter((n) => n.need_status === "Eligible for Simulation").length;

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
          <span className="text-white">Working Capital</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Working Capital Needs</h1>
            <p className="text-slate-400 text-sm mt-1">
              {company?.name ?? "Company"} — funding gap detection. Decision-support only.
            </p>
          </div>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-colors"
          >
            {detecting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Detecting…
              </>
            ) : "⚡ Detect Working Capital Needs"}
          </button>
        </div>

        {/* Detect result */}
        {detectResult && (
          <div className={`text-sm px-4 py-2 rounded-lg border ${detectResult.startsWith("Error") ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
            {detectResult}
          </div>
        )}

        {/* Stats */}
        {needs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Detected"          value={String(total)}                       color="blue"    />
            <StatCard label="Total Gap Amount"         value={formatGap(totalGap, baseCur)}        color="amber"   />
            <StatCard label="High / Critical"          value={String(highCrit)}                    color="red"     />
            <StatCard label="Eligible for Simulation"  value={String(eligibleSim)}                 color="emerald" />
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
            {ALL_NEED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            {ALL_NEED_TYPES.map((t) => <option key={t} value={t}>{NEED_TYPE_ICONS[t as NeedType]} {t}</option>)}
          </select>

          <select
            value={riskFilter}
            onChange={(e) => { setRiskFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
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
          ) : needs.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <p className="text-slate-500">No working capital needs detected yet.</p>
              <button
                onClick={handleDetect}
                disabled={detecting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-40"
              >
                Run Detection Now
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-slate-400 text-left">
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Job / Proc.</th>
                    <th className="px-4 py-3 font-medium">Gap Amount</th>
                    <th className="px-4 py-3 font-medium">Gap Days</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Rationale</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {needs.map((n) => (
                    <tr key={n.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">{n.need_reference}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <span>{NEED_TYPE_ICONS[n.need_type]}</span>
                          <span className="text-slate-300">{n.need_type}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {n.job_reference ?? n.procurement_reference ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-400 whitespace-nowrap">
                        {formatGap(n.base_gap_amount ?? n.gap_amount, n.base_currency ?? n.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-center">
                        {n.estimated_gap_days != null ? `${n.estimated_gap_days}d` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${NEED_RISK_STYLES[n.risk_level]}`}>
                          {n.risk_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {n.confidence_score != null
                          ? <span className={`text-xs font-semibold ${n.confidence_score >= 75 ? "text-emerald-400" : n.confidence_score >= 50 ? "text-amber-400" : "text-red-400"}`}>{n.confidence_score}%</span>
                          : "—"
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${NEED_STATUS_STYLES[n.need_status]}`}>
                          {n.need_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px]">
                        <span className="line-clamp-2">{n.rationale ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ActionDropdown
                          need={n}
                          acting={acting === n.id}
                          onAction={(action) => {
                            if (action === "add_review_note") {
                              setReviewModal({ id: n.id, ref: n.need_reference });
                            } else {
                              handleAction(n.id, action);
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
          Working capital needs are system-detected funding gap estimates for decision-support only.
          Not a loan approval, credit approval, guaranteed funding, or confirmed repayment evidence.
        </p>
      </div>

      {/* Review note modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold text-white">Add Review Note</h3>
            <p className="text-sm text-slate-400">{reviewModal.ref}</p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={4}
              placeholder="Enter review note…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setReviewModal(null); setReviewNote(""); }}
                className="px-4 py-2 text-sm text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/40">Cancel</button>
              <button
                disabled={!reviewNote.trim()}
                onClick={() => handleAction(reviewModal.id, "add_review_note", reviewNote.trim())}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40"
              >Save Note</button>
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
    blue: "text-blue-400", amber: "text-amber-400", red: "text-red-400", emerald: "text-emerald-400",
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorMap[color] ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function ActionDropdown({
  need,
  acting,
  onAction,
}: {
  need: WorkingCapitalNeed;
  acting: boolean;
  onAction: (action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const opts = actionOptions(need.need_status);

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
          <div className="absolute right-0 top-8 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 min-w-[210px]">
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
