"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminNav } from "@/components/AdminNav";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MismatchedField {
  field:     string;
  primary:   unknown;
  secondary: unknown;
}

interface Comparison {
  id:                   string;
  file_id:              string;
  job_reference:        string | null;
  primary_provider:     string;
  secondary_provider:   string;
  comparison_status:    string;
  matched_fields:       string[];
  mismatched_fields:    MismatchedField[];
  missing_fields:       string[];
  confidence_score:     number | null;
  final_review_status:  string;
  reviewed_by:          string | null;
  reviewed_at:          string | null;
  review_note:          string | null;
  created_at:           string;
}

// ─── Colour maps ──────────────────────────────────────────────────────────────

const compStatusColors: Record<string, string> = {
  Matched:            "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Minor Differences": "bg-amber-500/15  text-amber-400  border-amber-500/30",
  Conflict:           "bg-red-500/15    text-red-400    border-red-500/30",
  Failed:             "bg-slate-700     text-slate-400  border-slate-600",
  Pending:            "bg-slate-700     text-slate-400  border-slate-600",
  Reviewed:           "bg-blue-500/15   text-blue-400   border-blue-500/30",
};

const reviewColors: Record<string, string> = {
  Pending:   "text-amber-400",
  Accepted:  "text-emerald-400",
  Corrected: "text-blue-400",
  Rejected:  "text-red-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function ExtractionReviewInner() {
  const { profile } = useAuth();
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [filter,      setFilter]      = useState<string>("all");
  const [selected,    setSelected]    = useState<Comparison | null>(null);
  const [reviewNote,  setReviewNote]  = useState("");
  const [saving,      setSaving]      = useState(false);

  function getToken() {
    try {
      const s = localStorage.getItem("supabase.auth.token");
      return s ? (JSON.parse(s) as { access_token?: string }).access_token ?? "" : "";
    } catch { return ""; }
  }

  const fetchComparisons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const res   = await fetch("/api/admin/extraction-comparisons", {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json() as { ok?: boolean; comparisons?: Comparison[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to load comparisons");
      setComparisons(json.comparisons ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchComparisons(); }, [fetchComparisons]);

  async function handleReview(status: "Accepted" | "Corrected" | "Rejected") {
    if (!selected) return;
    setSaving(true);
    try {
      const token = getToken();
      const res   = await fetch("/api/admin/extraction-comparisons?id=" + selected.id, {
        method:  "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body:    JSON.stringify({ final_review_status: status, review_note: reviewNote }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Review failed");
      setSelected(null);
      setReviewNote("");
      await fetchComparisons();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const filtered = filter === "all"
    ? comparisons
    : comparisons.filter(c =>
        filter === "pending"  ? c.final_review_status === "Pending" :
        filter === "conflict" ? c.comparison_status   === "Conflict" :
        c.comparison_status === filter
      );

  const conflictCount = comparisons.filter(c => c.comparison_status === "Conflict").length;
  const pendingCount  = comparisons.filter(c => c.final_review_status === "Pending").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <AdminNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-50">AI Extraction Review</h1>
          <p className="mt-1 text-sm text-slate-400">
            Dual-LLM cross-check results · {conflictCount} conflict{conflictCount !== 1 ? "s" : ""} · {pendingCount} pending review
          </p>
          <p className="mt-1 text-xs text-slate-600">
            All results are AI-extracted drafts. Human review is required before values are treated as verified.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total",        value: comparisons.length,                                               color: "text-slate-200" },
            { label: "Matched",      value: comparisons.filter(c => c.comparison_status === "Matched").length, color: "text-emerald-400" },
            { label: "Conflicts",    value: conflictCount,                                                     color: "text-red-400" },
            { label: "Needs review", value: pendingCount,                                                      color: "text-amber-400" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="mb-4 flex gap-2 flex-wrap">
          {["all", "pending", "conflict", "Matched", "Minor Differences", "Reviewed"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "border-purple-500/40 bg-purple-500/20 text-purple-300"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-20 text-center">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent mb-4" />
            <p className="text-sm text-slate-400">Loading comparison results…</p>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Job Ref</th>
                  <th className="px-4 py-3">Providers</th>
                  <th className="px-4 py-3">Check result</th>
                  <th className="px-4 py-3 text-right">Confidence</th>
                  <th className="px-4 py-3">Mismatches</th>
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-600">
                      No results found
                    </td>
                  </tr>
                ) : (
                  filtered.map(c => (
                    <tr key={c.id} className="bg-slate-900/40 hover:bg-slate-900 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-blue-400 whitespace-nowrap">
                        {c.job_reference ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {c.primary_provider} + {c.secondary_provider}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${compStatusColors[c.comparison_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                          {c.comparison_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-300 whitespace-nowrap">
                        {c.confidence_score != null ? c.confidence_score.toFixed(0) + "%" : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {Array.isArray(c.mismatched_fields) && c.mismatched_fields.length > 0 ? (
                          <span className="text-red-400">{c.mismatched_fields.length} field{c.mismatched_fields.length !== 1 ? "s" : ""}</span>
                        ) : (
                          <span className="text-slate-600">None</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${reviewColors[c.final_review_status] ?? "text-slate-400"}`}>
                        {c.final_review_status}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(c.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => { setSelected(c); setReviewNote(c.review_note ?? ""); }}
                          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Review detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">Extraction Comparison</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selected.primary_provider} (primary) vs {selected.secondary_provider} (secondary)
                  {selected.job_reference ? " · " + selected.job_reference : ""}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  AI-extracted draft — values require admin confirmation before use
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300 text-lg shrink-0">✕</button>
            </div>

            {/* Status + confidence */}
            <div className="mb-4 flex gap-3">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${compStatusColors[selected.comparison_status] ?? ""}`}>
                {selected.comparison_status}
              </span>
              {selected.confidence_score != null && (
                <span className="text-xs text-slate-400">
                  Avg confidence: <span className="text-slate-200 font-semibold">{selected.confidence_score.toFixed(0)}%</span>
                </span>
              )}
            </div>

            {/* Matched fields */}
            {selected.matched_fields.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-emerald-400">
                  ✓ Matched fields ({selected.matched_fields.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.matched_fields.map(f => (
                    <span key={f} className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mismatched fields */}
            {Array.isArray(selected.mismatched_fields) && selected.mismatched_fields.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-red-400">
                  ✗ Mismatched fields ({selected.mismatched_fields.length})
                </p>
                <div className="space-y-2">
                  {selected.mismatched_fields.map((m, i) => (
                    <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                      <p className="mb-1 text-xs font-semibold text-slate-300">{m.field}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-slate-500">{selected.primary_provider}</p>
                          <p className="text-slate-200 font-mono">{String(m.primary ?? "—")}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">{selected.secondary_provider}</p>
                          <p className="text-slate-200 font-mono">{String(m.secondary ?? "—")}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing fields */}
            {selected.missing_fields.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-amber-400">
                  ⚠ Missing in one provider ({selected.missing_fields.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.missing_fields.map(f => (
                    <span key={f} className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Review note */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-slate-400">Review note (optional)</label>
              <textarea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={2}
                placeholder="Describe any corrections made or reason for rejection…"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-purple-500 focus:outline-none resize-none"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => void handleReview("Accepted")}
                disabled={saving}
                className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => void handleReview("Corrected")}
                disabled={saving}
                className="flex-1 rounded-lg border border-blue-500/30 bg-blue-500/10 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
              >
                Accept with corrections
              </button>
              <button
                onClick={() => void handleReview("Rejected")}
                disabled={saving}
                className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
            {saving && <p className="mt-2 text-center text-xs text-slate-500">Saving…</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExtractionReviewPage() {
  return (
    <AuthGuard requiredRole="admin">
      <ExtractionReviewInner />
    </AuthGuard>
  );
}
