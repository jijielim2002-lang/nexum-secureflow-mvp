"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import {
  applyOntologySuggestion,
  TIP_FIELD_LABELS,
  type SuggestionRow,
} from "@/lib/ontologySuggestions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  actorId?:     string;
  actorName?:   string;
}

// ─── Per-suggestion action state ──────────────────────────────────────────────

type ActionState = "idle" | "working" | "done" | "error";

interface SuggestionState {
  approveState: ActionState;
  applyState:   ActionState;
  rejectState:  ActionState;
  errorMsg:     string;
}

function defaultSuggState(): SuggestionState {
  return { approveState: "idle", applyState: "idle", rejectState: "idle", errorMsg: "" };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Pending:  "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Approved: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Applied:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Rejected: "border-slate-700 bg-slate-800 text-slate-500",
};

function confBadge(score: number): string {
  if (score >= 0.9)  return "text-emerald-400";
  if (score >= 0.75) return "text-amber-400";
  return "text-red-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OntologySuggestionsPanel({ jobReference, actorId, actorName }: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [states, setStates]           = useState<Record<string, SuggestionState>>({});

  const actor = actorName ?? "Nexum Admin";

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadSuggestions = useCallback(async () => {
    const { data } = await supabase
      .from("ontology_update_suggestions")
      .select("*, document_extractions(document_type)")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false });

    const rows = (data as SuggestionRow[]) ?? [];
    setSuggestions(rows);
    setLoading(false);
    setStates((prev) => {
      const next = { ...prev };
      for (const r of rows) { if (!next[r.id]) next[r.id] = defaultSuggState(); }
      return next;
    });
  }, [jobReference]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function patchState(id: string, patch: Partial<SuggestionState>) {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function patchRow(id: string, patch: Partial<SuggestionRow>) {
    setSuggestions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleApprove(s: SuggestionRow) {
    patchState(s.id, { approveState: "working", errorMsg: "" });
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("ontology_update_suggestions")
      .update({ status: "Approved", reviewed_by: actorId ?? null, reviewed_at: now })
      .eq("id", s.id);

    if (error) { patchState(s.id, { approveState: "error", errorMsg: error.message }); return; }
    patchRow(s.id, { status: "Approved" });
    patchState(s.id, { approveState: "done" });
  }

  async function handleApply(s: SuggestionRow) {
    patchState(s.id, { applyState: "working", errorMsg: "" });
    const { error } = await applyOntologySuggestion(s, actorId, actor);
    if (error) { patchState(s.id, { applyState: "error", errorMsg: error }); return; }
    patchRow(s.id, { status: "Applied" });
    patchState(s.id, { applyState: "done" });
  }

  async function handleReject(s: SuggestionRow) {
    patchState(s.id, { rejectState: "working", errorMsg: "" });
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("ontology_update_suggestions")
      .update({ status: "Rejected", reviewed_by: actorId ?? null, reviewed_at: now })
      .eq("id", s.id);

    if (error) { patchState(s.id, { rejectState: "error", errorMsg: error.message }); return; }
    patchRow(s.id, { status: "Rejected" });
    patchState(s.id, { rejectState: "done" });

    insertAuditLog({
      job_reference: jobReference,
      actor_role:    "admin",
      actor_name:    actor,
      action:        "ontology_update_rejected",
      description:   `Ontology suggestion rejected: "${TIP_FIELD_LABELS[s.target_field] ?? s.target_field}" field update.`,
      metadata:      { target_field: s.target_field, rejected_value: s.suggested_value },
    }).catch(() => {});
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const pending  = suggestions.filter((s) => s.status === "Pending");
  const approved = suggestions.filter((s) => s.status === "Approved");
  const resolved = suggestions.filter((s) => s.status === "Applied" || s.status === "Rejected");

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <span className="animate-pulse">◌</span> Loading ontology suggestions…
        </p>
      </section>
    );
  }

  if (suggestions.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-300">Ontology Update Suggestions</h2>
        </div>
        <p className="text-xs text-slate-600">
          No suggestions yet. Suggestions are created automatically when document extractions are verified.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-300">Ontology Update Suggestions</h2>
        {pending.length > 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            {pending.length} pending
          </span>
        )}
        {approved.length > 0 && (
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
            {approved.length} approved
          </span>
        )}
        {resolved.length > 0 && (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
            {resolved.length} resolved
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {/* Pending first */}
        {[...pending, ...approved, ...resolved].map((s) => {
          const st = states[s.id] ?? defaultSuggState();
          const docType = s.document_extractions?.document_type ?? "Document";
          const fieldLabel = TIP_FIELD_LABELS[s.target_field] ?? s.target_field;
          const isActive = s.status === "Pending" || s.status === "Approved";

          return (
            <div
              key={s.id}
              className={`rounded-lg border ${isActive ? "border-slate-700/80" : "border-slate-800/40"} bg-slate-900/40 p-3`}
            >
              {/* Header row */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[s.status]}`}>
                  {s.status}
                </span>
                <span className="text-xs font-semibold text-slate-200">{fieldLabel}</span>
                <span className="text-[10px] text-slate-600">·</span>
                <span className="text-[10px] text-slate-500">{docType}</span>
                <span className={`ml-auto font-mono text-[10px] ${confBadge(s.confidence_score)}`}>
                  {Math.round(s.confidence_score * 100)}% confidence
                </span>
              </div>

              {/* Value comparison */}
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">Current value</p>
                  <p className={`text-xs ${s.current_value ? "text-slate-300" : "text-slate-700 italic"}`}>
                    {s.current_value ?? "empty"}
                  </p>
                </div>
                <div className={`rounded-md border px-3 py-2 ${isActive ? "border-indigo-500/30 bg-indigo-500/5" : "border-slate-800 bg-slate-950/60"}`}>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">Suggested value</p>
                  <p className={`text-xs font-medium ${isActive ? "text-indigo-300" : "text-slate-400"}`}>
                    {s.suggested_value}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              {isActive && (
                <div className="flex flex-wrap items-center gap-2">
                  {s.status === "Pending" && (
                    <button
                      onClick={() => handleApprove(s)}
                      disabled={st.approveState === "working"}
                      className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                      {st.approveState === "working" ? "…" : "Approve"}
                    </button>
                  )}
                  <button
                    onClick={() => handleApply(s)}
                    disabled={st.applyState === "working"}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {st.applyState === "working" ? "Applying…" : "Apply"}
                  </button>
                  <button
                    onClick={() => handleReject(s)}
                    disabled={st.rejectState === "working"}
                    className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {st.rejectState === "working" ? "…" : "Reject"}
                  </button>
                  {(st.applyState === "error" || st.approveState === "error" || st.rejectState === "error") && (
                    <span className="text-[10px] text-red-400">{st.errorMsg || "Action failed"}</span>
                  )}
                </div>
              )}

              {/* Resolved note */}
              {s.status === "Applied" && (
                <p className="text-[10px] text-emerald-600">
                  ✓ Applied — {s.target_table === "trade_intelligence_profiles" ? "Trade Intelligence Profile" : s.target_table} updated.
                </p>
              )}
              {s.status === "Rejected" && (
                <p className="text-[10px] text-slate-700">✕ Rejected — no changes made.</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 border-t border-slate-800/60 pt-3 text-[10px] text-slate-700">
        Suggestions marked <em>Pending</em> require admin review. Auto-applied suggestions (confidence ≥ 90%, field was empty) are already marked <em>Applied</em>.
      </p>
    </section>
  );
}
