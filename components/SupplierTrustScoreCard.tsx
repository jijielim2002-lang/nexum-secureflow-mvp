"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  GRADE_BADGE,
  GRADE_LABEL,
  RISK_BADGE,
  SCORE_BAR_COLOR,
  TRUST_COMPLIANCE_WORDING,
  type SupplierTrustScoreRow,
} from "@/lib/supplierTrustScore";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role: "admin" | "customer" | "service_provider";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierTrustScoreCard({ jobReference, role }: Props) {
  const [scores,    setScores]    = useState<SupplierTrustScoreRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState<Set<string>>(new Set());
  const [error,     setError]     = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const fetchScores = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/supplier-trust-scores?job_reference=${encodeURIComponent(jobReference)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load trust scores");
      setScores(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) fetchScores(session.access_token);
    });
  }, [fetchScores]);

  async function handleRecalculate(supplierId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy((s) => new Set(s).add(supplierId));
    try {
      const res = await fetch(`/api/supplier-trust-scores/${supplierId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) await fetchScores(session.access_token);
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

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <p className="text-xs text-slate-500 animate-pulse">Loading supplier risk context…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-950/10 px-4 py-3">
        <p className="text-xs text-red-400">Failed to load supplier trust scores: {error}</p>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
        <p className="text-xs text-slate-500">No supplier trust score available.</p>
        <p className="mt-1 text-[10px] text-slate-600">
          Scores are calculated when a supplier counterparty is linked and a protection flow is recalculated.
          {role === "admin" && " Link a supplier on this job and click Recalculate."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {scores.map((score) => {
        const isExpanded  = expanded.has(score.id);
        const isBusy      = busy.has(score.supplier_id ?? "");
        const trustScore  = score.overall_supplier_trust_score ?? 0;
        const grade       = score.supplier_grade;
        const risk        = score.risk_level;
        const barColor    = SCORE_BAR_COLOR[grade];
        const gradeBadge  = GRADE_BADGE[grade];
        const riskBadge   = RISK_BADGE[risk];
        const isWatchlist = grade === "Watchlist" || grade === "Blocked";

        return (
          <div
            key={score.id}
            className={`rounded-xl border bg-slate-900/60 overflow-hidden transition-all ${
              isWatchlist ? "border-red-500/40" : "border-slate-800"
            }`}
          >
            {/* Watchlist / Blocked banner */}
            {isWatchlist && (
              <div className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 ${
                grade === "Blocked"
                  ? "bg-slate-800/80 text-slate-300 border-b border-slate-700"
                  : "bg-red-950/40 text-red-300 border-b border-red-500/30"
              }`}>
                {grade === "Blocked" ? "🚫" : "⚠"}{" "}
                {grade === "Blocked"
                  ? "Blocked Supplier — Do not proceed without admin override"
                  : "Watchlist Supplier — Enhanced due diligence required"}
              </div>
            )}

            {/* Header */}
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/30"
              onClick={() => toggleExpand(score.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div>
                  <p className="text-sm font-semibold text-slate-200 truncate">
                    {score.supplier_name ?? "Unnamed Supplier"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {score.supplier_country ?? "—"} ·{" "}
                    {score.last_calculated_at
                      ? `Score calculated ${new Date(score.last_calculated_at).toLocaleDateString()}`
                      : "Not yet calculated"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Trust score */}
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-100">{trustScore}</p>
                  <p className="text-[10px] text-slate-500">/ 100</p>
                </div>

                {/* Grade badge */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeBadge}`}>
                  {grade}
                </span>

                {/* Risk badge */}
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${riskBadge}`}>
                  {risk}
                </span>

                <span className="text-slate-600 text-xs ml-1">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Score bar */}
            <div className="h-1 bg-slate-800 mx-4">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.max(2, trustScore)}%` }}
              />
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-3 space-y-4">
                {/* Admin: full detail */}
                {role === "admin" && (
                  <>
                    {/* Grade label + release model */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-1 rounded ${gradeBadge}`}>
                        {GRADE_LABEL[grade]}
                      </span>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: "Protection Flows",   value: score.total_protection_flows },
                        { label: "Completed Flows",    value: score.completed_protection_flows },
                        { label: "Disputed Flows",     value: score.disputed_flows, warn: score.disputed_flows > 0 },
                        { label: "Total Jobs",         value: score.total_jobs },
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
                      ].map(({ label, value, warn }) => (
                        <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <p className="text-[10px] text-slate-500">{label}</p>
                          <p className={`text-sm font-semibold ${warn ? "text-red-400" : "text-slate-200"}`}>
                            {value ?? "—"}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Recommended release model */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <p className="text-[10px] text-slate-500 mb-1">Recommended Release Model</p>
                      <p className="text-xs text-slate-200 font-medium">{score.recommended_release_model ?? "—"}</p>
                      {score.recommended_advance_limit != null && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          Advance limit: up to {score.recommended_advance_limit}% of trade value
                        </p>
                      )}
                    </div>

                    {/* Recommended precaution */}
                    {score.recommended_precaution && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                        <p className="text-[10px] text-amber-400 font-semibold mb-1">Recommended Precaution</p>
                        <p className="text-xs text-slate-300">{score.recommended_precaution}</p>
                      </div>
                    )}

                    {/* Compliance wording */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 space-y-1">
                      <p className="text-[10px] text-slate-600">{TRUST_COMPLIANCE_WORDING.basis}</p>
                      <p className="text-[10px] text-slate-600">{TRUST_COMPLIANCE_WORDING.not_guaranteed}</p>
                      <p className="text-[10px] text-slate-600">{TRUST_COMPLIANCE_WORDING.no_auto_release}</p>
                    </div>

                    {/* Recalculate button */}
                    {score.supplier_id && (
                      <button
                        disabled={isBusy}
                        onClick={() => handleRecalculate(score.supplier_id!)}
                        className="rounded-lg border border-purple-500/30 bg-purple-900/20 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isBusy ? "Recalculating…" : "↻ Recalculate Supplier Trust"}
                      </button>
                    )}
                  </>
                )}

                {/* Customer: simplified view */}
                {role === "customer" && (
                  <>
                    <div className="space-y-2">
                      {/* Grade summary */}
                      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                        <p className="text-[10px] text-slate-500 mb-1">Supplier Risk Context</p>
                        <p className={`text-xs font-semibold px-2 py-0.5 rounded inline-block ${gradeBadge}`}>
                          {GRADE_LABEL[grade]}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Based on Nexum workflow records · {TRUST_COMPLIANCE_WORDING.not_approved}
                        </p>
                      </div>

                      {/* Milestone release recommendation */}
                      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                        <p className="text-[10px] text-slate-500 mb-1">Recommended Milestone Release Model</p>
                        <p className="text-xs text-slate-300">{score.recommended_release_model ?? "Standard milestone release"}</p>
                      </div>

                      {/* Precaution */}
                      {score.recommended_precaution && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                          <p className="text-[10px] text-amber-400 font-semibold mb-1">Recommended Precaution</p>
                          <p className="text-xs text-slate-300">{score.recommended_precaution}</p>
                        </div>
                      )}

                      {/* Watchlist / blocked warning */}
                      {isWatchlist && (
                        <div className="rounded-lg border border-red-500/30 bg-red-950/10 px-3 py-2">
                          <p className="text-xs text-red-300 font-semibold">
                            {grade === "Blocked"
                              ? "⚠ This supplier has been flagged as Blocked. Please contact your Nexum account manager."
                              : "⚠ This supplier is on the Watchlist. Enhanced precautions are recommended."}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Compliance wording */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 space-y-1">
                      <p className="text-[10px] text-slate-600">{TRUST_COMPLIANCE_WORDING.basis}</p>
                      <p className="text-[10px] text-slate-600">{TRUST_COMPLIANCE_WORDING.not_guaranteed}</p>
                    </div>
                  </>
                )}

                {/* Service provider: read-only */}
                {role === "service_provider" && (
                  <>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <p className="text-[10px] text-slate-500 mb-1">Supplier Risk Context</p>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${gradeBadge}`}>{grade}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] ${riskBadge}`}>{risk}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-1">{TRUST_COMPLIANCE_WORDING.basis}</p>
                    </div>
                    {score.recommended_release_model && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                        <p className="text-[10px] text-slate-500 mb-1">Recommended Release Model</p>
                        <p className="text-xs text-slate-300">{score.recommended_release_model}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
