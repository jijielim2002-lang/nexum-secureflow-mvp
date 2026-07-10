"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { KEY_TIP_FIELDS, TIP_FIELD_LABELS } from "@/lib/ontologySuggestions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfidenceStats {
  verifiedCount:    number;
  extractedCount:   number;
  pendingCount:     number;
  rejectedCount:    number;
  avgConfidence:    number | null;
  pendingSuggestions: number;
  appliedSuggestions: number;
  conflictCount:    number;  // suggestions where current_value is not null
  missingFields:    string[];
  dataQuality:      "high" | "medium" | "low" | "none";
}

// ─── Quality logic ────────────────────────────────────────────────────────────

function computeQuality(s: ConfidenceStats): "high" | "medium" | "low" | "none" {
  if (s.verifiedCount === 0 && s.extractedCount === 0) return "none";
  if (s.verifiedCount >= 2 && s.missingFields.length <= 3 && s.conflictCount === 0) return "high";
  if (s.verifiedCount >= 1 || s.appliedSuggestions >= 2) return "medium";
  return "low";
}

const QUALITY_STYLES: Record<string, { bar: string; label: string; text: string }> = {
  high:   { bar: "bg-emerald-500", label: "High",   text: "text-emerald-400" },
  medium: { bar: "bg-amber-500",   label: "Medium",  text: "text-amber-400"  },
  low:    { bar: "bg-red-500",     label: "Low",     text: "text-red-400"    },
  none:   { bar: "bg-slate-700",   label: "No Data", text: "text-slate-600"  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DataConfidenceCard({ jobReference }: Props) {
  const [stats, setStats]   = useState<ConfidenceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const [extRes, suggRes, tipRes] = await Promise.all([
      supabase
        .from("document_extractions")
        .select("extraction_status, confidence_score")
        .eq("job_reference", jobReference),
      supabase
        .from("ontology_update_suggestions")
        .select("status, current_value, target_field")
        .eq("job_reference", jobReference),
      supabase
        .from("trade_intelligence_profiles")
        .select(KEY_TIP_FIELDS.join(", "))
        .eq("job_reference", jobReference)
        .maybeSingle(),
    ]);

    const extractions = (extRes.data ?? []) as { extraction_status: string; confidence_score: number | null }[];
    const suggestions = (suggRes.data ?? []) as { status: string; current_value: string | null; target_field: string }[];
    const tip = tipRes.data as Record<string, unknown> | null;

    const verified  = extractions.filter((e) => e.extraction_status === "Verified");
    const extracted = extractions.filter((e) => e.extraction_status === "Extracted");
    const pending   = extractions.filter((e) => e.extraction_status === "Pending");
    const rejected  = extractions.filter((e) => e.extraction_status === "Rejected");

    // Average confidence from verified extractions only
    const confScores = verified.map((e) => e.confidence_score).filter((c): c is number => c !== null);
    const avgConf = confScores.length > 0
      ? confScores.reduce((a, b) => a + b, 0) / confScores.length
      : null;

    const pendingSugg  = suggestions.filter((s) => s.status === "Pending").length;
    const appliedSugg  = suggestions.filter((s) => s.status === "Applied").length;
    // Conflicting = suggestion exists for a field that already has a value
    const conflictCount = suggestions.filter((s) => s.status === "Pending" && s.current_value !== null).length;

    // Missing key fields — null in TIP (or TIP doesn't exist)
    const missingFields = KEY_TIP_FIELDS.filter((f) => {
      if (!tip) return true;
      const v = tip[f];
      return v === null || v === undefined || String(v).trim() === "";
    });

    const base: Omit<ConfidenceStats, "dataQuality"> = {
      verifiedCount:      verified.length,
      extractedCount:     extracted.length,
      pendingCount:       pending.length,
      rejectedCount:      rejected.length,
      avgConfidence:      avgConf,
      pendingSuggestions: pendingSugg,
      appliedSuggestions: appliedSugg,
      conflictCount,
      missingFields:      missingFields as unknown as string[],
    };

    const withQuality: ConfidenceStats = {
      ...base,
      dataQuality: computeQuality(base as ConfidenceStats),
    };

    setStats(withQuality);
    setLoading(false);
  }, [jobReference]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <span className="animate-pulse">◌</span> Loading data confidence…
        </p>
      </div>
    );
  }

  if (!stats) return null;

  const q = QUALITY_STYLES[stats.dataQuality];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-slate-300">Data Confidence</h2>
          <span className={`text-xs font-semibold ${q.text}`}>{q.label}</span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          {expanded ? "▲ Collapse" : "▾ Details"}
        </button>
      </div>

      {/* Quality bar */}
      <div className="mb-4">
        <div className="h-1.5 w-full rounded-full bg-slate-800">
          <div
            className={`h-1.5 rounded-full transition-all ${q.bar}`}
            style={{
              width: stats.dataQuality === "high" ? "90%"
                   : stats.dataQuality === "medium" ? "55%"
                   : stats.dataQuality === "low"    ? "20%"
                   : "4%",
            }}
          />
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Metric label="Verified Docs"     value={String(stats.verifiedCount)}
          color={stats.verifiedCount > 0 ? "text-emerald-400" : "text-slate-600"} />
        <Metric label="Avg Confidence"
          value={stats.avgConfidence !== null ? `${Math.round(stats.avgConfidence * 100)}%` : "—"}
          color={stats.avgConfidence !== null && stats.avgConfidence >= 0.9 ? "text-emerald-400"
                : stats.avgConfidence !== null ? "text-amber-400" : "text-slate-600"} />
        <Metric label="Pending Suggests"  value={String(stats.pendingSuggestions)}
          color={stats.pendingSuggestions > 0 ? "text-amber-400" : "text-slate-600"} />
        <Metric label="Missing Fields"    value={String(stats.missingFields.length)}
          color={stats.missingFields.length === 0 ? "text-emerald-400"
                : stats.missingFields.length <= 3 ? "text-amber-400" : "text-red-400"} />
        <Metric label="Conflicts"         value={String(stats.conflictCount)}
          color={stats.conflictCount > 0 ? "text-red-400" : "text-slate-600"} />
        <Metric label="Applied Updates"   value={String(stats.appliedSuggestions)}
          color={stats.appliedSuggestions > 0 ? "text-emerald-400" : "text-slate-600"} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-4 border-t border-slate-800/60 pt-4 space-y-3">

          {stats.missingFields.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Missing key fields ({stats.missingFields.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stats.missingFields.map((f) => (
                  <span key={f} className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-[10px] text-red-400">
                    {TIP_FIELD_LABELS[f] ?? f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.conflictCount > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Conflicting fields
              </p>
              <p className="text-xs text-amber-400">
                {stats.conflictCount} suggestion(s) would overwrite existing values. Review in the Ontology Update Suggestions panel.
              </p>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Extraction breakdown
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Verified: <span className="text-emerald-400">{stats.verifiedCount}</span></span>
              <span>Extracted: <span className="text-amber-400">{stats.extractedCount}</span></span>
              <span>Pending: {stats.pendingCount}</span>
              {stats.rejectedCount > 0 && <span>Rejected: {stats.rejectedCount}</span>}
            </div>
          </div>

          {stats.dataQuality === "none" && (
            <p className="text-xs text-slate-600">
              No document extractions yet. Upload trade documents and run extraction to improve data confidence.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Metric cell ──────────────────────────────────────────────────────────────

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/80 px-3 py-2.5">
      <p className="text-[10px] text-slate-600 leading-tight">{label}</p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
