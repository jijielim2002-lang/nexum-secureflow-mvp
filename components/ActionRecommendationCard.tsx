"use client";

// ─── ActionRecommendationCard ─────────────────────────────────────────────────
// Self-fetching card. Shows playbook-generated action recommendations for a
// job or procurement order.
//
// Admin view: full actions — accept / create task / dismiss / escalate / complete.
// Customer/provider view: simplified — see recommendations assigned to their role.

import { useEffect, useCallback, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  RECOMMENDATION_STATUS_BADGE,
  PRIORITY_BADGE,
  PRIORITY_ICON,
  TRIGGER_TYPE_ICON,
  PLAYBOOK_COMPLIANCE_WORDING,
  type ActionRecommendationRow,
  type PlaybookTriggerType,
} from "@/lib/actionPlaybook";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  jobReference?:          string;
  procurementReference?:  string;
  role:                   "admin" | "customer" | "service_provider";
}

type ActionModal =
  | { kind: "dismiss"; id: string; action: string }
  | { kind: "escalate"; id: string; action: string }
  | { kind: "complete"; id: string; action: string }
  | null;

// ── Component ──────────────────────────────────────────────────────────────────

export function ActionRecommendationCard({ jobReference, procurementReference, role }: Props) {
  const [rows,        setRows]        = useState<ActionRecommendationRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [genMsg,      setGenMsg]      = useState<string | null>(null);
  const [actionBusy,  setActionBusy]  = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [noteInput,   setNoteInput]   = useState("");
  const [actionErr,   setActionErr]   = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>("active");

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const params = new URLSearchParams();
    if (jobReference)         params.set("job_reference", jobReference);
    if (procurementReference) params.set("procurement_reference", procurementReference);
    if (filterStatus !== "active" && filterStatus !== "all") {
      params.set("status", filterStatus);
    }
    if (filterStatus === "all") {
      // No status filter — API will default to active; override by not passing status
      // We fetch all manually
      params.set("status", "all");
    }

    const res = await fetch(`/api/action-recommendations?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      let data = (json.data ?? []) as ActionRecommendationRow[];
      if (filterStatus === "all") {
        // API doesn't support "all" — fetch again without status filter
        const res2 = await fetch(`/api/action-recommendations?${
          new URLSearchParams([
            ...(jobReference ? [["job_reference", jobReference]] : []),
            ...(procurementReference ? [["procurement_reference", procurementReference]] : []),
          ])
        }`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res2.ok) data = ((await res2.json()).data ?? []) as ActionRecommendationRow[];
      }
      setRows(data);
    }
    setLoading(false);
  }, [jobReference, procurementReference, filterStatus]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Generate recommendations ───────────────────────────────────────────────

  const generate = async () => {
    setGenerating(true);
    setGenMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setGenerating(false); return; }

    const body: Record<string, string> = {};
    if (jobReference)         body.job_reference         = jobReference;
    if (procurementReference) body.procurement_reference = procurementReference;

    const res = await fetch("/api/action-recommendations/generate", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok) {
      const { generated = 0, new: n = 0, existing = 0 } = json;
      setGenMsg(generated === 0
        ? "No blockers detected — no new recommendations generated."
        : `Scanned ${generated} blocker${generated !== 1 ? "s" : ""}: ${n} new recommendation${n !== 1 ? "s" : ""}, ${existing} already on record.`
      );
      fetchRows();
    } else {
      setGenMsg(`Generation failed: ${json.error ?? "Unknown error"}`);
    }
    setGenerating(false);
  };

  // ── Patch action ───────────────────────────────────────────────────────────

  const patch = async (id: string, payload: Record<string, unknown>) => {
    setActionBusy(id);
    setActionErr(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setActionBusy(null); return; }

    const res = await fetch(`/api/action-recommendations/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) setActionErr(json.error ?? "Action failed");
    else fetchRows();
    setActionBusy(null);
    return json;
  };

  const handleAccept    = (id: string) => patch(id, { action: "accept" });
  const handleCreateTask = async (id: string) => {
    const result = await patch(id, { action: "create_task" });
    if (result?.data?.task_id) {
      setGenMsg(`✓ Workflow task created (ID: ${result.data.task_id})`);
    }
  };

  const openModal = (kind: "dismiss" | "escalate" | "complete", id: string, action: string) => {
    setNoteInput("");
    setActionErr(null);
    setActionModal({ kind, id, action });
  };

  const submitModal = async () => {
    if (!actionModal) return;
    if (actionModal.kind === "dismiss" && !noteInput.trim()) {
      setActionErr("A reason is required.");
      return;
    }
    await patch(actionModal.id, {
      action:           actionModal.kind,
      dismissed_reason: actionModal.kind === "dismiss"  ? noteInput.trim() : undefined,
      escalated_note:   actionModal.kind === "escalate" ? noteInput.trim() || undefined : undefined,
      completed_note:   actionModal.kind === "complete" ? noteInput.trim() || undefined : undefined,
    });
    setActionModal(null);
  };

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeRows  = rows.filter(r => ["Suggested", "Accepted", "Task Created", "Escalated"].includes(r.recommendation_status));
  const displayRows = filterStatus === "active" ? activeRows : rows;

  const criticalCount = activeRows.filter(r => r.priority === "Critical").length;
  const highCount     = activeRows.filter(r => r.priority === "High").length;
  const suggestedCount = activeRows.filter(r => r.recommendation_status === "Suggested").length;
  const withTaskCount = activeRows.filter(r => r.recommendation_status === "Task Created").length;

  // ── Customer/provider simplified view ─────────────────────────────────────

  if (role !== "admin") {
    const myRows = activeRows.filter(r => r.assigned_role === role);
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Action Recommendations</h3>
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
        </div>

        {!loading && myRows.length === 0 && (
          <p className="text-xs text-slate-500">No action recommendations assigned to your role at this time.</p>
        )}

        {!loading && myRows.length > 0 && (
          <div className="space-y-2">
            {myRows.slice(0, 5).map(row => (
              <div key={row.id} className={`rounded-lg border px-3 py-2.5 ${
                row.priority === "Critical" ? "border-red-500/30 bg-red-500/5" :
                row.priority === "High"     ? "border-orange-500/20 bg-orange-500/5" :
                "border-slate-700/40 bg-slate-800/20"
              }`}>
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0 mt-0.5">
                    {TRIGGER_TYPE_ICON[(row.playbook as { trigger_type?: PlaybookTriggerType })?.trigger_type ?? "Other"]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_BADGE[row.priority]}`}>
                        {PRIORITY_ICON[row.priority]} {row.priority}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${RECOMMENDATION_STATUS_BADGE[row.recommendation_status]}`}>
                        {row.recommendation_status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{row.recommended_action}</p>
                    {row.due_at && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        Due: {new Date(row.due_at).toLocaleString()}
                        {new Date(row.due_at) < new Date() && (
                          <span className="ml-1 text-red-400 font-medium">OVERDUE</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Simple action for non-admin */}
                {row.recommendation_status === "Suggested" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleAccept(row.id)}
                      disabled={actionBusy === row.id}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30
                                 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                    >
                      {actionBusy === row.id ? "…" : "Acknowledge"}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {myRows.length > 5 && (
              <p className="text-xs text-slate-500">… and {myRows.length - 5} more</p>
            )}
          </div>
        )}

        <p className="mt-3 text-[10px] text-slate-600 italic">{PLAYBOOK_COMPLIANCE_WORDING.basis}</p>
      </div>
    );
  }

  // ── Admin full view ────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/40 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-200 flex-1">
          Exception-to-Action Playbook
        </h3>

        {/* Summary badges */}
        {!loading && (
          <div className="flex items-center gap-2 flex-wrap">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-500/15 text-red-400 border-red-500/30">
                🚨 {criticalCount} Critical
              </span>
            )}
            {highCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/15 text-orange-400 border-orange-500/30">
                ⛔ {highCount} High
              </span>
            )}
            {suggestedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-500/15 text-blue-400 border-blue-500/30">
                {suggestedCount} Suggested
              </span>
            )}
            {withTaskCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-500/15 text-violet-400 border-violet-500/30">
                {withTaskCount} Task Created
              </span>
            )}
            {activeRows.length === 0 && !loading && (
              <span className="text-xs text-emerald-400">No active recommendations</span>
            )}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-violet-600/20 text-violet-300 border border-violet-500/30
                     hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? <><span className="animate-spin">⟳</span> Scanning…</> : <><span>⚡</span> Generate Recommendations</>}
        </button>
      </div>

      {/* Generation result banner */}
      {genMsg && (
        <div className={`px-4 py-2 text-xs border-b border-slate-700/40 ${
          genMsg.startsWith("No blockers") || genMsg.startsWith("✓")
            ? "bg-emerald-500/10 text-emerald-400"
            : genMsg.startsWith("Generation failed")
            ? "bg-red-500/10 text-red-400"
            : "bg-violet-500/10 text-violet-300"
        }`}>
          {genMsg}
        </div>
      )}

      {/* Compliance notice */}
      <div className="px-4 py-2 bg-slate-900/30 border-b border-slate-700/40">
        <p className="text-xs text-slate-500 italic">{PLAYBOOK_COMPLIANCE_WORDING.basis}</p>
      </div>

      {/* Filter tabs */}
      <div className="px-4 pt-3 flex gap-1 flex-wrap">
        {(["active", "all", "Suggested", "Accepted", "Task Created", "Escalated", "Dismissed", "Completed"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filterStatus === s
                ? "bg-slate-600/60 text-slate-200"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
            }`}
          >
            {s === "active" ? "Active" : s}
          </button>
        ))}
      </div>

      {/* Error from action */}
      {actionErr && (
        <div className="mx-4 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
          {actionErr}
        </div>
      )}

      {/* List */}
      <div className="p-4 space-y-3">
        {loading && (
          <div className="text-xs text-slate-500 animate-pulse py-4 text-center">Scanning for blockers…</div>
        )}

        {!loading && displayRows.length === 0 && (
          <p className="text-xs text-slate-500 py-4 text-center">
            {filterStatus === "active"
              ? "No active action recommendations. Click Generate Recommendations to scan for blockers."
              : `No ${filterStatus} recommendations.`}
          </p>
        )}

        {!loading && displayRows.map(row => {
          const isExpanded = expanded.has(row.id);
          const isBusy     = actionBusy === row.id;
          const isTerminal = ["Dismissed", "Completed"].includes(row.recommendation_status);
          const isOverdue  = row.due_at && new Date(row.due_at) < new Date() && !isTerminal;
          const triggerType = (row.playbook as { trigger_type?: PlaybookTriggerType } | null)?.trigger_type;
          const icon = TRIGGER_TYPE_ICON[triggerType ?? "Other"];

          return (
            <div
              key={row.id}
              className={`rounded-lg border transition-colors ${
                row.recommendation_status === "Escalated"
                  ? "border-red-500/30 bg-red-500/5"
                  : row.priority === "Critical"
                  ? "border-red-500/30 bg-red-500/5"
                  : row.priority === "High"
                  ? "border-orange-500/20 bg-orange-500/5"
                  : isTerminal
                  ? "border-slate-800/40 bg-slate-900/20"
                  : "border-slate-700/40 bg-slate-800/20"
              }`}
            >
              {/* Row header */}
              <div
                className="px-3 py-2.5 flex items-start gap-2 cursor-pointer"
                onClick={() => toggleExpand(row.id)}
              >
                <span className="text-base mt-0.5 shrink-0">{icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_BADGE[row.priority]}`}>
                      {PRIORITY_ICON[row.priority]} {row.priority}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${RECOMMENDATION_STATUS_BADGE[row.recommendation_status]}`}>
                      {row.recommendation_status}
                    </span>
                    {triggerType && (
                      <span className="text-xs text-slate-500">{triggerType}</span>
                    )}
                    {row.assigned_role && (
                      <span className="text-[10px] bg-slate-700/40 text-slate-400 border border-slate-600/40 px-1.5 py-0.5 rounded">
                        → {row.assigned_role}
                      </span>
                    )}
                    {isOverdue && (
                      <span className="text-xs text-red-400 font-medium animate-pulse">OVERDUE</span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed truncate">
                    {row.recommended_action}
                  </p>

                  {row.due_at && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Due: {new Date(row.due_at).toLocaleString()}
                    </p>
                  )}
                </div>

                <span className="text-slate-500 text-xs mt-1 shrink-0 ml-1">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-slate-700/30 px-3 py-3 space-y-3">
                  {/* Full recommended action */}
                  <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2">
                    <p className="text-xs text-amber-400 font-medium mb-0.5">Recommended Action</p>
                    <p className="text-xs text-amber-300/80 leading-relaxed">{row.recommended_action}</p>
                  </div>

                  {/* Rationale */}
                  {row.rationale && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Why this was generated</p>
                      <p className="text-xs text-slate-400 italic leading-relaxed">{row.rationale}</p>
                    </div>
                  )}

                  {/* Escalation note from playbook */}
                  {(row.playbook as { escalation_note?: string | null } | null)?.escalation_note && (
                    <div className="rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2">
                      <p className="text-xs text-red-400 font-medium mb-0.5">Escalation Note</p>
                      <p className="text-xs text-red-300/80 leading-relaxed">
                        {(row.playbook as { escalation_note: string }).escalation_note}
                      </p>
                    </div>
                  )}

                  {/* Source */}
                  {row.source_type && (
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>Source: <span className="text-slate-400">{row.source_type}</span></span>
                      {row.source_id && <span>ID: <span className="text-slate-400 font-mono">{row.source_id.slice(0, 8)}…</span></span>}
                    </div>
                  )}

                  {/* Resolution fields */}
                  {row.dismissed_reason && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Dismissed Reason</p>
                      <p className="text-xs text-slate-400">{row.dismissed_reason}</p>
                    </div>
                  )}
                  {row.escalated_note && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Escalation Note</p>
                      <p className="text-xs text-slate-400">{row.escalated_note}</p>
                    </div>
                  )}
                  {row.completed_note && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Completion Note</p>
                      <p className="text-xs text-slate-400">{row.completed_note}</p>
                    </div>
                  )}
                  {row.task_id && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Linked Workflow Task</p>
                      <p className="text-xs text-violet-400 font-mono">{row.task_id}</p>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    <span>Generated: {new Date(row.created_at).toLocaleString()}</span>
                    {row.accepted_at && <span>Accepted: {new Date(row.accepted_at).toLocaleString()}</span>}
                  </div>

                  {/* Admin actions */}
                  {!isTerminal && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {row.recommendation_status === "Suggested" && (
                        <button
                          onClick={() => handleAccept(row.id)}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30
                                     hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                        >
                          {isBusy ? "…" : "Accept"}
                        </button>
                      )}
                      {["Suggested", "Accepted"].includes(row.recommendation_status) && (
                        <button
                          onClick={() => handleCreateTask(row.id)}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-violet-500/15 text-violet-400 border border-violet-500/30
                                     hover:bg-violet-500/25 disabled:opacity-50 transition-colors"
                        >
                          {isBusy ? "…" : "⊕ Create Task"}
                        </button>
                      )}
                      <button
                        onClick={() => openModal("complete", row.id, row.recommended_action ?? "")}
                        disabled={isBusy}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30
                                   hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                      >
                        Complete
                      </button>
                      {row.recommendation_status !== "Escalated" && (
                        <button
                          onClick={() => openModal("escalate", row.id, row.recommended_action ?? "")}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30
                                     hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                        >
                          Escalate
                        </button>
                      )}
                      <button
                        onClick={() => openModal("dismiss", row.id, row.recommended_action ?? "")}
                        disabled={isBusy}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-slate-600/30 text-slate-400 border border-slate-600/40
                                   hover:bg-slate-600/50 disabled:opacity-50 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl p-5 space-y-4">
            <h4 className="text-sm font-semibold text-slate-200 capitalize">
              {actionModal.kind} Recommendation
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {actionModal.action.slice(0, 200)}
            </p>

            <p className="text-xs text-slate-500 italic">
              {actionModal.kind === "complete" ? PLAYBOOK_COMPLIANCE_WORDING.no_auto_release :
               actionModal.kind === "dismiss"  ? "Dismissed recommendations remain on record for audit purposes." :
               PLAYBOOK_COMPLIANCE_WORDING.no_auto_resolve}
            </p>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {actionModal.kind === "dismiss"  ? "Reason *" :
                 actionModal.kind === "escalate" ? "Escalation note (optional)" :
                 "Completion note (optional)"}
              </label>
              <textarea
                rows={3}
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder={
                  actionModal.kind === "dismiss"  ? "Reason for dismissing this recommendation…" :
                  actionModal.kind === "escalate" ? "Why is this being escalated?" :
                  "How was this resolved?"
                }
                className="w-full rounded-lg bg-slate-800 border border-slate-700/60 text-slate-200 text-xs px-3 py-2
                           placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none"
              />
            </div>

            {actionErr && <p className="text-xs text-red-400">{actionErr}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setActionModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200
                           bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitModal}
                disabled={!!actionBusy}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                  actionModal.kind === "complete"
                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
                    : actionModal.kind === "escalate"
                    ? "bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
                    : "bg-slate-600/30 text-slate-300 border border-slate-600/40 hover:bg-slate-600/50"
                }`}
              >
                {actionBusy
                  ? "…"
                  : actionModal.kind === "complete" ? "Mark Complete"
                  : actionModal.kind === "escalate" ? "Escalate"
                  : "Dismiss"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
