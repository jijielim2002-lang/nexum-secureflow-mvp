"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase }                          from "@/lib/supabaseClient";
import { useAuth }                           from "@/contexts/AuthContext";
import {
  SCORE_TYPE_ICONS,
  GRADE_STYLES,
  STATUS_STYLES,
  SCORE_TYPE_STYLES,
  ALL_SCORE_TYPES,
  ALL_GRADES,
  ALL_STATUSES,
  scoreColor,
  formatRecommendedAmount,
  type JobFinanceabilityScore,
  type FinanceabilityGrade,
  type FinanceabilityStatus,
  type ScoreType,
} from "@/lib/financeabilityScore";

// ─── Action options ───────────────────────────────────────────────────────────

function actionOptions(status: FinanceabilityStatus): { label: string; action: string; danger?: boolean }[] {
  const opts: { label: string; action: string; danger?: boolean }[] = [];
  if (status !== "Manual Review Required") opts.push({ label: "Mark Manual Review Required", action: "mark_manual_review" });
  if (status !== "Reviewable")             opts.push({ label: "Mark Reviewable",              action: "mark_reviewable" });
  if (status !== "Not Suitable")           opts.push({ label: "Mark Not Suitable",            action: "mark_not_suitable", danger: true });
  if (["Strong", "Reviewable"].includes(status)) opts.push({ label: "Approve for Simulation",  action: "approve_for_simulation" });
  opts.push({ label: "Add Review Note", action: "add_review_note" });
  return opts;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminFinanceabilityScoresPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [scores,      setScores]      = useState<JobFinanceabilityScore[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [calcResult,  setCalcResult]  = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  // Filters
  const [typeFilter,   setTypeFilter]   = useState("");
  const [gradeFilter,  setGradeFilter]  = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Action state
  const [acting,      setActing]      = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ id: string; ref: string; action: string } | null>(null);
  const [reviewNote,  setReviewNote]  = useState("");
  const [actionMsg,   setActionMsg]   = useState<string | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadScores = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    const token = await getToken();
    const qp = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (typeFilter)   qp.set("score_type",            typeFilter);
    if (gradeFilter)  qp.set("financeability_grade",  gradeFilter);
    if (statusFilter) qp.set("financeability_status", statusFilter);

    const res = await fetch(`/api/financeability-scores?${qp}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setError("Failed to load scores."); setLoading(false); return; }
    const json = await res.json();
    setScores(json.scores ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [profile, typeFilter, gradeFilter, statusFilter, offset]);

  useEffect(() => { loadScores(); }, [loadScores]);

  // ── Calculate all ────────────────────────────────────────────────────────────

  async function handleCalculateAll() {
    if (!profile) return;
    setCalculating(true);
    setCalcResult(null);

    const token = await getToken();
    const res = await fetch("/api/financeability-scores/calculate", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ calculate_all: true }),
    });

    const json = await res.json();
    if (!res.ok) {
      setCalcResult(`Error: ${json.error ?? "Calculation failed"}`);
    } else {
      setCalcResult(`Calculated ${json.created + json.updated} score(s). ${json.created} new, ${json.updated} updated.`);
      await loadScores();
    }
    setCalculating(false);
  }

  // ── Action handler ──────────────────────────────────────────────────────────

  async function handleAction(id: string, action: string, note?: string) {
    if (!profile) return;
    setActing(id);
    setActionMsg(null);

    const token = await getToken();
    const res = await fetch("/api/financeability-scores", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ id, action, review_note: note }),
    });

    const json = await res.json();
    if (res.ok) {
      const msg = action === "approve_for_simulation" && json.financing_offer_id
        ? `Simulation created — offer ID: ${json.financing_offer_id}`
        : "Done.";
      setActionMsg(msg);
      await loadScores();
    } else {
      setActionMsg(`Error: ${json.error ?? "Failed"}`);
    }
    setActing(null);
    setReviewModal(null);
    setReviewNote("");
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const strong       = scores.filter((s) => s.financeability_status === "Strong" || s.financeability_grade === "A").length;
  const notSuitable  = scores.filter((s) => s.financeability_status === "Not Suitable").length;
  const manualReview = scores.filter((s) => s.financeability_status === "Manual Review Required").length;
  const totalAmt     = scores.reduce((s, o) => s + (o.recommended_amount ?? 0), 0);
  const baseCur      = scores[0]?.currency ?? "RM";

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Financeability Scores</h1>
            <p className="text-slate-400 text-sm mt-1">
              Job-level financeability scoring — decision-support only. Not a loan approval or credit facility.
            </p>
          </div>
          <button
            onClick={handleCalculateAll}
            disabled={calculating}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-colors"
          >
            {calculating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Calculating…
              </>
            ) : "⚡ Calculate All Scores"}
          </button>
        </div>

        {/* Calc result */}
        {calcResult && (
          <div className={`text-sm px-4 py-2 rounded-lg border ${calcResult.startsWith("Error") ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
            {calcResult}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Scores"         value={String(total)}                                   color="teal"    />
          <StatCard label="Strong / Grade A"     value={String(strong)}                                  color="emerald" />
          <StatCard label="Manual Review"        value={String(manualReview)}                            color="amber"   />
          <StatCard label="Recommended Amount"   value={formatRecommendedAmount(totalAmt, baseCur)}      color="blue"    />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select value={typeFilter}   onChange={(e) => { setTypeFilter(e.target.value);   setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Score Types</option>
            {ALL_SCORE_TYPES.map((t) => <option key={t} value={t}>{SCORE_TYPE_ICONS[t as ScoreType]} {t}</option>)}
          </select>

          <select value={gradeFilter}  onChange={(e) => { setGradeFilter(e.target.value);  setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Grades</option>
            {ALL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {(typeFilter || gradeFilter || statusFilter) && (
            <button onClick={() => { setTypeFilter(""); setGradeFilter(""); setStatusFilter(""); setOffset(0); }}
              className="px-3 py-2 text-xs text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/40">
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
          ) : scores.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <p className="text-slate-500">No financeability scores calculated yet.</p>
              <button onClick={handleCalculateAll} disabled={calculating}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm disabled:opacity-40">
                Calculate Now
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-slate-400 text-left">
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Grade</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Recommended Product</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Tenure</th>
                    <th className="px-4 py-3 font-medium">Repayment Source</th>
                    <th className="px-4 py-3 font-medium">Key Risks</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {scores.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                        {s.job_reference ?? s.procurement_reference ?? s.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 max-w-[120px] truncate">
                        {s.company_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${SCORE_TYPE_STYLES[s.score_type]}`}>
                          {SCORE_TYPE_ICONS[s.score_type]} {s.score_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${scoreColor(s.financeability_score)}`}>
                          {s.financeability_score}
                          <span className="text-xs font-normal opacity-60">/100</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-bold ${GRADE_STYLES[s.financeability_grade]}`}>
                          {s.financeability_grade}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${STATUS_STYLES[s.financeability_status]}`}>
                          {s.financeability_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                        {s.recommended_product ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-400 whitespace-nowrap text-xs">
                        {formatRecommendedAmount(s.recommended_amount, s.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-center text-xs">
                        {s.suggested_tenure_days != null ? `${s.suggested_tenure_days}d` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[150px]">
                        <span className="line-clamp-2">{s.repayment_source ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-red-400/80 max-w-[180px]">
                        <span className="line-clamp-2">
                          {Array.isArray(s.key_risks) && s.key_risks.length > 0
                            ? (s.key_risks as string[])[0]
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ActionDropdown
                          score={s}
                          acting={acting === s.id}
                          onAction={(act) => {
                            if (act === "add_review_note" || act === "mark_not_suitable") {
                              setReviewModal({ id: s.id, ref: s.job_reference ?? s.id.slice(0, 8), action: act });
                            } else {
                              handleAction(s.id, act);
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

        {/* Compliance footer */}
        <p className="text-xs text-slate-600 text-center border-t border-slate-800 pt-4">
          Financeability scores are system-calculated assessments for decision-support only — subject to lender / admin review.
          Not a loan approval, credit approval, committed facility, or guaranteed funding.
        </p>
      </div>

      {/* Review / reason modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold text-white">
              {reviewModal.action === "add_review_note" ? "Add Review Note" : "Mark Not Suitable"}
            </h3>
            <p className="text-sm text-slate-400 font-mono">{reviewModal.ref}</p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={4}
              placeholder="Enter review note or reason…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setReviewModal(null); setReviewNote(""); }}
                className="px-4 py-2 text-sm text-slate-400 border border-slate-700 rounded-lg hover:bg-slate-700/40">Cancel</button>
              <button
                disabled={reviewModal.action === "add_review_note" && !reviewNote.trim()}
                onClick={() => handleAction(reviewModal.id, reviewModal.action, reviewNote.trim() || undefined)}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-40 ${
                  reviewModal.action === "add_review_note" ? "bg-teal-600 hover:bg-teal-700" : "bg-red-600 hover:bg-red-700"
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
    teal: "text-teal-400", emerald: "text-emerald-400", amber: "text-amber-400", blue: "text-blue-400",
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorMap[color] ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function ActionDropdown({
  score,
  acting,
  onAction,
}: {
  score: JobFinanceabilityScore;
  acting: boolean;
  onAction: (action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const opts = actionOptions(score.financeability_status);

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
