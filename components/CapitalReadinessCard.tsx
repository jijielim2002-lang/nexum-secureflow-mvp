"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ASSESSMENT_TYPES,
  STATUS_CONFIG,
  type AssessmentType,
  type CapitalReadinessRow,
} from "@/lib/capitalReadiness";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference?: string;
  companyId?:    string;
  actorId?:      string;
  actorName?:    string;
  currency?:     string;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color =
    pct >= 85 ? "bg-purple-500" :
    pct >= 70 ? "bg-emerald-500" :
    pct >= 50 ? "bg-amber-500"   : "bg-red-500";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-500">Readiness Score</span>
        <span className={`font-mono text-sm font-bold tabular-nums ${
          pct >= 85 ? "text-purple-400" :
          pct >= 70 ? "text-emerald-400" :
          pct >= 50 ? "text-amber-400"   : "text-red-400"
        }`}>{pct}/100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-slate-700">
        <span>Not Ready (0)</span>
        <span>Monitor (50)</span>
        <span>Eligible (70)</span>
        <span>Priority (85)</span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CapitalReadinessCard({
  jobReference,
  companyId,
  actorId,
  actorName = "Admin",
  currency = "RM",
}: Props) {
  const [assessment, setAssessment] = useState<CapitalReadinessRow | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [running,    setRunning]    = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [selType,    setSelType]    = useState<AssessmentType>("Customer Trade Credit");
  const [error,      setError]      = useState<string | null>(null);
  const [history,    setHistory]    = useState<CapitalReadinessRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "5" });
      if (jobReference) params.set("jobReference", jobReference);
      if (companyId)    params.set("companyId",    companyId);
      const res  = await window.fetch(`/api/capital-readiness?${params}`);
      const json = await res.json() as { assessments: CapitalReadinessRow[] };
      setHistory(json.assessments ?? []);
      setAssessment(json.assessments?.[0] ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [jobReference, companyId]);

  useEffect(() => { void fetch(); }, [fetch]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res   = await window.fetch("/api/capital-readiness", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          companyId,
          jobReference,
          assessmentType: selType,
          currency,
          actorId,
          actorName,
        }),
      });
      const json = await res.json() as { assessment?: CapitalReadinessRow; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Assessment failed");
      } else {
        setShowModal(false);
        await fetch();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const cfg = assessment ? STATUS_CONFIG[assessment.readiness_status] : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">💼</span>
          <h3 className="text-sm font-semibold text-slate-200">Capital Readiness Assessment</h3>
          {assessment && cfg && (
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cfg.badge}`}>
              {assessment.readiness_status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {history.length > 1 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showHistory ? "Hide" : `History (${history.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-3 py-1.5 text-[10px] font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors"
          >
            ▶ Run Assessment
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <p className="text-sm text-slate-600 animate-pulse">Loading…</p>
        ) : !assessment ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-slate-400">No assessment yet</p>
            <p className="mt-1 text-xs text-slate-600">
              Click <strong className="text-slate-500">▶ Run Assessment</strong> to score this company's financing readiness.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score bar */}
            <ScoreBar score={Number(assessment.readiness_score)} />

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="rounded border border-slate-800 bg-slate-950/60 px-2 py-0.5">
                {assessment.assessment_type}
              </span>
              {assessment.company_name && (
                <span className="text-slate-600">{assessment.company_name}</span>
              )}
              <span className="ml-auto">
                Assessed {new Date(assessment.assessed_at).toLocaleDateString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>

            {/* Recommended amount */}
            {assessment.max_recommended_amount != null && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  Max Recommended Amount
                </p>
                <p className="mt-1 text-xl font-bold font-mono text-emerald-400">
                  {assessment.currency}{" "}
                  {Number(assessment.max_recommended_amount).toLocaleString("en-MY", {
                    minimumFractionDigits: 0,
                  })}
                </p>
                {assessment.suggested_tenure_days && (
                  <p className="mt-0.5 text-[10px] text-emerald-700">
                    Suggested tenure: {assessment.suggested_tenure_days} days
                  </p>
                )}
                {assessment.suggested_pricing_note && (
                  <p className="mt-1 text-[10px] text-slate-500 leading-snug">
                    {assessment.suggested_pricing_note}
                  </p>
                )}
              </div>
            )}

            {/* Strengths / Risks / Conditions grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {assessment.key_strengths && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-3 py-2.5">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
                    ✓ Key Strengths
                  </p>
                  <ul className="space-y-1">
                    {assessment.key_strengths.split("\n").filter(Boolean).map((s, i) => (
                      <li key={i} className="text-[10px] text-emerald-400 leading-snug">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assessment.key_risks && (
                <div className="rounded-lg border border-red-500/20 bg-red-950/10 px-3 py-2.5">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-red-600">
                    ⚠ Key Risks
                  </p>
                  <ul className="space-y-1">
                    {assessment.key_risks.split("\n").filter(Boolean).map((r, i) => (
                      <li key={i} className="text-[10px] text-red-400 leading-snug">{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assessment.required_conditions && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2.5">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600">
                    ⟳ Required Conditions
                  </p>
                  <ul className="space-y-1">
                    {assessment.required_conditions.split("\n").filter(Boolean).map((c, i) => (
                      <li key={i} className="text-[10px] text-amber-400 leading-snug">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Scoring breakdown (collapsed) */}
            {assessment.source_summary && (
              <details className="group">
                <summary className="cursor-pointer text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                  ▸ View scoring inputs
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[9px]">
                  {Object.entries(assessment.source_summary ?? {})
                    .filter(([k]) => k !== "scoring_breakdown")
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5 border-b border-slate-800/50 last:border-0 col-span-1">
                        <span className="text-slate-600 capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="text-slate-400 font-mono">{String(v ?? "—")}</span>
                      </div>
                    ))}
                </div>
              </details>
            )}

            {/* History list */}
            {showHistory && history.length > 1 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden">
                <p className="px-3 py-2 text-[9px] uppercase tracking-wider text-slate-600 font-semibold border-b border-slate-800">
                  Assessment History
                </p>
                <div className="divide-y divide-slate-800/50">
                  {history.map((h) => {
                    const hcfg = STATUS_CONFIG[h.readiness_status];
                    return (
                      <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div>
                          <p className="text-[10px] text-slate-400">{h.assessment_type}</p>
                          <p className="text-[9px] text-slate-600">
                            {new Date(h.assessed_at).toLocaleDateString("en-GB")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400">{h.readiness_score}/100</span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${hcfg.badge}`}>
                            {h.readiness_status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Run Assessment Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h4 className="mb-1 text-base font-bold text-slate-100">Run Capital Readiness Assessment</h4>
            <p className="mb-4 text-xs text-slate-500">
              Scores this company/job for financing readiness. No money is disbursed — scoring only.
            </p>

            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Assessment Type
            </label>
            <select
              value={selType}
              onChange={(e) => setSelType(e.target.value as AssessmentType)}
              className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              {ASSESSMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {error && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowModal(false); setError(null); }}
                disabled={running}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRun}
                disabled={running}
                className="flex-1 rounded-lg border border-blue-600/40 bg-blue-600/20 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
              >
                {running ? "Scoring…" : "▶ Run Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
