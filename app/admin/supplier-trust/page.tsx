"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  GRADE_BADGE,
  GRADE_LABEL,
  RISK_BADGE,
  SCORE_BAR_COLOR,
  TRUST_COMPLIANCE_WORDING,
  type SupplierTrustScoreRow,
  type SupplierGrade,
  type TrustRiskLevel,
} from "@/lib/supplierTrustScore";

// ── Types ─────────────────────────────────────────────────────────────────────

type GradeFilter = "All" | SupplierGrade;
type RiskFilter  = "All" | TrustRiskLevel;

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierTrustPage() {
  const [scores,      setScores]      = useState<SupplierTrustScoreRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("All");
  const [riskFilter,  setRiskFilter]  = useState<RiskFilter>("All");
  const [busy,        setBusy]        = useState<Set<string>>(new Set());
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    try {
      const res = await fetch("/api/supplier-trust-scores", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setScores(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRecalculate(supplierId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy((s) => new Set(s).add(supplierId));
    try {
      const res = await fetch(`/api/supplier-trust-scores/${supplierId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) await load();
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(supplierId); return n; });
    }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filtered = scores.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (s.supplier_name ?? "").toLowerCase().includes(q) ||
      (s.supplier_country ?? "").toLowerCase().includes(q);
    const matchGrade = gradeFilter === "All" || s.supplier_grade === gradeFilter;
    const matchRisk  = riskFilter  === "All" || s.risk_level     === riskFilter;
    return matchSearch && matchGrade && matchRisk;
  });

  // Sort: Blocked first, then Watchlist, then D → A
  const sortOrder: SupplierGrade[] = ["Blocked", "Watchlist", "D", "C", "B", "A"];
  const sorted = [...filtered].sort(
    (a, b) => sortOrder.indexOf(a.supplier_grade) - sortOrder.indexOf(b.supplier_grade)
  );

  // Summary metrics
  const total    = scores.length;
  const gradeA   = scores.filter((s) => s.supplier_grade === "A").length;
  const gradeB   = scores.filter((s) => s.supplier_grade === "B").length;
  const gradeC   = scores.filter((s) => s.supplier_grade === "C").length;
  const gradeD   = scores.filter((s) => s.supplier_grade === "D").length;
  const watchlist = scores.filter((s) => s.supplier_grade === "Watchlist").length;
  const blocked  = scores.filter((s) => s.supplier_grade === "Blocked").length;
  const avgScore = total > 0
    ? Math.round(scores.reduce((s, r) => s + (r.overall_supplier_trust_score ?? 0), 0) / total)
    : 0;

  return (
    <AuthGuard requiredRole="admin">
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* Nav */}
        <nav className="border-b border-slate-800 bg-slate-900/80 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="text-sm text-slate-400 hover:text-slate-200">← Dashboard</Link>
            <span className="text-slate-700">|</span>
            <h1 className="text-sm font-semibold text-slate-100">🔒 Supplier Trust Scores</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <LogoutButton />
          </div>
        </nav>

        <main className="mx-auto max-w-7xl px-6 py-8">
          {/* Compliance disclaimer */}
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
            <p className="text-xs text-slate-500">
              {TRUST_COMPLIANCE_WORDING.basis}{" "}
              {TRUST_COMPLIANCE_WORDING.not_guaranteed}{" "}
              {TRUST_COMPLIANCE_WORDING.not_approved}
            </p>
          </div>

          {/* Summary metrics */}
          <div className="mb-6 grid grid-cols-4 gap-3 sm:grid-cols-7">
            {[
              { label: "Total",     value: total,     color: "text-slate-200" },
              { label: "Avg Score", value: avgScore,  color: "text-slate-200" },
              { label: "Grade A",   value: gradeA,    color: "text-emerald-400" },
              { label: "Grade B",   value: gradeB,    color: "text-green-400" },
              { label: "Grade C",   value: gradeC,    color: "text-yellow-400" },
              { label: "Grade D",   value: gradeD,    color: "text-orange-400" },
              { label: "Watchlist/Blocked", value: watchlist + blocked, color: watchlist + blocked > 0 ? "text-red-400" : "text-slate-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
                <p className="text-[10px] text-slate-500">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Alert banners */}
          {blocked > 0 && (
            <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
              <p className="text-xs font-semibold text-slate-300">
                🚫 {blocked} blocked supplier{blocked !== 1 ? "s" : ""} — do not proceed without admin override.
              </p>
            </div>
          )}
          {watchlist > 0 && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
              <p className="text-xs font-semibold text-red-300">
                ⚠ {watchlist} watchlist supplier{watchlist !== 1 ? "s" : ""} — enhanced due diligence required.
              </p>
            </div>
          )}

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search supplier name or country…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 w-64"
            />
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value as GradeFilter)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300"
            >
              <option value="All">All Grades</option>
              {(["A","B","C","D","Watchlist","Blocked"] as SupplierGrade[]).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300"
            >
              <option value="All">All Risk Levels</option>
              {(["Low","Medium","High","Critical"] as TrustRiskLevel[]).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <span className="text-xs text-slate-600">{sorted.length} result{sorted.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-700/40 bg-red-950/10 px-4 py-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500 animate-pulse">Loading supplier trust scores…</p>
            </div>
          )}

          {/* Empty */}
          {!loading && sorted.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
              <p className="text-sm text-slate-500">No supplier trust scores found.</p>
              <p className="mt-1 text-xs text-slate-600">
                Scores are generated when a supplier counterparty is linked to a job and the score is recalculated.
              </p>
            </div>
          )}

          {/* Supplier rows */}
          {!loading && sorted.length > 0 && (
            <div className="space-y-2">
              {sorted.map((score) => {
                const isExpanded = expanded.has(score.id);
                const isBusy     = busy.has(score.supplier_id ?? "");
                const trustScore = score.overall_supplier_trust_score ?? 0;
                const grade      = score.supplier_grade;
                const gradeBadge = GRADE_BADGE[grade];
                const riskBadge  = RISK_BADGE[score.risk_level];
                const barColor   = SCORE_BAR_COLOR[grade];
                const isAlert    = grade === "Blocked" || grade === "Watchlist";

                return (
                  <div
                    key={score.id}
                    className={`rounded-xl border bg-slate-900/60 overflow-hidden ${
                      isAlert ? "border-red-500/30" : "border-slate-800"
                    }`}
                  >
                    {/* Row header */}
                    <div
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800/30"
                      onClick={() => toggleExpand(score.id)}
                    >
                      {/* Name + country */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">
                          {score.supplier_name ?? "Unnamed Supplier"}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {score.supplier_country ?? "—"}
                          {score.last_calculated_at
                            ? ` · Calculated ${new Date(score.last_calculated_at).toLocaleDateString()}`
                            : " · Not calculated"}
                        </p>
                      </div>

                      {/* Score bar */}
                      <div className="w-24 hidden sm:block">
                        <div className="h-1.5 bg-slate-800 rounded-full">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${Math.max(2, trustScore)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 text-right">{trustScore}/100</p>
                      </div>

                      {/* Badges */}
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeBadge}`}>{grade}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${riskBadge}`}>{score.risk_level}</span>

                      {/* Flows & disputes */}
                      <div className="hidden md:flex gap-3 text-[10px] text-slate-500">
                        <span>{score.total_protection_flows}P</span>
                        <span className={score.disputed_flows > 0 ? "text-red-400" : ""}>{score.disputed_flows}D</span>
                      </div>

                      <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 px-4 py-4 space-y-4">
                        {/* Grade label */}
                        <p className="text-xs font-semibold text-slate-300">{GRADE_LABEL[grade]}</p>

                        {/* Metrics grid */}
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                          {[
                            { label: "Total Jobs",          value: score.total_jobs },
                            { label: "Total Flows",         value: score.total_protection_flows },
                            { label: "Completed Flows",     value: score.completed_protection_flows },
                            { label: "Active Flows",        value: score.active_protection_flows },
                            { label: "Disputed Flows",      value: score.disputed_flows,    warn: score.disputed_flows > 0 },
                            { label: "Verified Milestones", value: score.verified_milestones },
                            { label: "Rejected Milestones", value: score.rejected_milestones, warn: score.rejected_milestones > 0 },
                            {
                              label: "Evidence Quality",
                              value: score.evidence_quality_score != null
                                ? `${Math.round(score.evidence_quality_score * 100)}%`
                                : "—",
                            },
                            {
                              label: "Dispute Score",
                              value: score.dispute_score != null
                                ? `${Math.round(score.dispute_score * 100)}%`
                                : "—",
                            },
                            {
                              label: "Doc Consistency",
                              value: score.document_consistency_score != null
                                ? `${Math.round(score.document_consistency_score * 100)}%`
                                : "—",
                            },
                          ].map(({ label, value, warn }) => (
                            <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5">
                              <p className="text-[10px] text-slate-500">{label}</p>
                              <p className={`text-sm font-semibold ${warn ? "text-red-400" : "text-slate-200"}`}>
                                {String(value ?? "—")}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Release model */}
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <p className="text-[10px] text-slate-500 mb-1">Recommended Release Model</p>
                          <p className="text-xs text-slate-200 font-medium">{score.recommended_release_model ?? "—"}</p>
                          {score.recommended_advance_limit != null && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Advance limit: up to {score.recommended_advance_limit}% of trade value
                            </p>
                          )}
                        </div>

                        {/* Precaution */}
                        {score.recommended_precaution && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                            <p className="text-[10px] text-amber-400 font-semibold mb-1">Recommended Precaution</p>
                            <p className="text-xs text-slate-300">{score.recommended_precaution}</p>
                          </div>
                        )}

                        {/* Compliance */}
                        <p className="text-[10px] text-slate-600">{TRUST_COMPLIANCE_WORDING.basis} {TRUST_COMPLIANCE_WORDING.not_guaranteed}</p>

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap">
                          {score.supplier_id && (
                            <button
                              disabled={isBusy}
                              onClick={() => score.supplier_id && handleRecalculate(score.supplier_id)}
                              className="rounded-lg border border-purple-500/30 bg-purple-900/20 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-900/40 disabled:opacity-50"
                            >
                              {isBusy ? "Recalculating…" : "↻ Recalculate Trust Score"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
