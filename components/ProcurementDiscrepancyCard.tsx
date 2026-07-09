"use client";

// ─── ProcurementDiscrepancyCard ───────────────────────────────────────────────
// Self-fetching card.  Shown on admin procurement order detail, admin job detail,
// and (simplified) customer procurement order detail.
//
// Props:
//   procurementReference  – filter to one procurement order
//   jobReference          – filter to all orders under a job
//   role                  – "admin" | "customer"
//
// Admin view: full detail — source A vs source B, actions (review / resolve /
//             ignore / escalate), run-detection button.
// Customer view: count + highest severity only, no source values exposed.

import { useEffect, useCallback, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ProcurementDiscrepancyRow,
  SEVERITY_BADGE,
  SEVERITY_ICON,
  STATUS_BADGE,
  DISCREPANCY_TYPE_ICON,
  DISCREPANCY_COMPLIANCE_WORDING,
  DiscrepancySeverity,
} from "@/lib/procurementDiscrepancy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── helpers ────────────────────────────────────────────────────────────────────

function severityOrder(s: DiscrepancySeverity): number {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[s] ?? 4;
}

function highestSeverity(rows: ProcurementDiscrepancyRow[]): DiscrepancySeverity | null {
  if (rows.length === 0) return null;
  return rows.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))[0].severity;
}

// ── types ──────────────────────────────────────────────────────────────────────

interface Props {
  procurementReference?: string;
  jobReference?: string;
  role: "admin" | "customer";
}

type ActionModal =
  | { kind: "resolve";  id: string; type: string }
  | { kind: "ignore";   id: string; type: string }
  | { kind: "escalate"; id: string; type: string }
  | null;

// ── component ──────────────────────────────────────────────────────────────────

export function ProcurementDiscrepancyCard({ procurementReference, jobReference, role }: Props) {
  const [rows,        setRows]        = useState<ProcurementDiscrepancyRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [detecting,   setDetecting]   = useState(false);
  const [detectMsg,   setDetectMsg]   = useState<string | null>(null);
  const [actionBusy,  setActionBusy]  = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [noteInput,   setNoteInput]   = useState("");
  const [actionErr,   setActionErr]   = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>("active");

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const params = new URLSearchParams();
    if (procurementReference) params.set("procurement_reference", procurementReference);
    if (jobReference)         params.set("job_reference", jobReference);
    if (filterStatus === "active") {
      // admin fetch all statuses; customer API already filters
    } else if (filterStatus !== "all") {
      params.set("status", filterStatus);
    }

    const res = await fetch(`/api/procurement-discrepancies?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setRows((json.data ?? []) as ProcurementDiscrepancyRow[]);
    }
    setLoading(false);
  }, [procurementReference, jobReference, filterStatus]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── run detection ──────────────────────────────────────────────────────────

  const runDetection = async () => {
    setDetecting(true);
    setDetectMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDetecting(false); return; }

    const body: Record<string, string> = {};
    if (procurementReference) body.procurement_reference = procurementReference;
    if (jobReference)         body.job_reference         = jobReference;

    const res = await fetch("/api/procurement-discrepancies/detect", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok) {
      const { detected = 0, new: newCount = 0, existing = 0 } = json;
      setDetectMsg(
        detected === 0
          ? "No discrepancies detected."
          : `Detected ${detected} discrepancy${detected !== 1 ? "s" : ""}: ${newCount} new, ${existing} already on record.`,
      );
      fetchRows();
    } else {
      setDetectMsg(`Detection failed: ${json.error ?? "Unknown error"}`);
    }
    setDetecting(false);
  };

  // ── action helpers ─────────────────────────────────────────────────────────

  const patchAction = async (id: string, payload: Record<string, unknown>) => {
    setActionBusy(id);
    setActionErr(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setActionBusy(null); return; }

    const res = await fetch(`/api/procurement-discrepancies/${id}`, {
      method:  "PATCH",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionErr(json.error ?? "Action failed");
    } else {
      fetchRows();
    }
    setActionBusy(null);
  };

  const handleReview = (id: string) => patchAction(id, { action: "review" });

  const openModal = (kind: "resolve" | "ignore" | "escalate", id: string, type: string) => {
    setNoteInput("");
    setActionErr(null);
    setActionModal({ kind, id, type });
  };

  const submitModal = async () => {
    if (!actionModal) return;
    if ((actionModal.kind === "resolve" || actionModal.kind === "ignore") && !noteInput.trim()) {
      setActionErr("A note is required.");
      return;
    }
    await patchAction(actionModal.id, {
      action:          actionModal.kind,
      resolution_note: noteInput.trim() || undefined,
    });
    setActionModal(null);
  };

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── derived ────────────────────────────────────────────────────────────────

  const activeRows = rows.filter(r => ["Open", "Under Review", "Escalated"].includes(r.status));
  const displayRows =
    filterStatus === "active" ? activeRows :
    filterStatus === "all"    ? rows :
    rows.filter(r => r.status === filterStatus);

  const openCount     = rows.filter(r => r.status === "Open").length;
  const criticalCount = rows.filter(r => r.severity === "Critical" && r.status !== "Resolved" && r.status !== "Ignored").length;
  const highCount     = rows.filter(r => r.severity === "High"     && r.status !== "Resolved" && r.status !== "Ignored").length;
  const topSeverity   = highestSeverity(activeRows);

  // ── customer simplified view ───────────────────────────────────────────────

  if (role === "customer") {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Document Discrepancy Check</h3>
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
        </div>

        {!loading && activeRows.length === 0 && (
          <p className="text-xs text-emerald-400">No active discrepancies detected on this order.</p>
        )}

        {!loading && activeRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${topSeverity ? SEVERITY_BADGE[topSeverity] : ""}`}>
                {topSeverity && SEVERITY_ICON[topSeverity]} {topSeverity} priority
              </span>
              <span className="text-xs text-slate-400">
                {activeRows.length} discrepanc{activeRows.length !== 1 ? "ies" : "y"} under review
              </span>
            </div>
            <p className="text-xs text-amber-400/80 leading-relaxed">
              Our compliance team is reviewing document mismatches on this order. No action is required from you at this time.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed italic">
              {DISCREPANCY_COMPLIANCE_WORDING.basis}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── admin full view ────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/40 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-200 flex-1">
          Procurement Discrepancy Detection
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
            {openCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-500/15 text-red-400 border-red-500/30">
                {openCount} Open
              </span>
            )}
            {activeRows.length === 0 && (
              <span className="text-xs text-emerald-400">No active discrepancies</span>
            )}
          </div>
        )}

        {/* Run detection button */}
        <button
          onClick={runDetection}
          disabled={detecting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-violet-600/20 text-violet-300 border border-violet-500/30
                     hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {detecting ? (
            <><span className="animate-spin">⟳</span> Running…</>
          ) : (
            <><span>⚡</span> Run Discrepancy Check</>
          )}
        </button>
      </div>

      {/* Detection result banner */}
      {detectMsg && (
        <div className={`px-4 py-2 text-xs border-b border-slate-700/40 ${
          detectMsg.startsWith("No discrepancies")
            ? "bg-emerald-500/10 text-emerald-400"
            : detectMsg.startsWith("Detection failed")
            ? "bg-red-500/10 text-red-400"
            : "bg-violet-500/10 text-violet-300"
        }`}>
          {detectMsg}
        </div>
      )}

      {/* Compliance notice */}
      <div className="px-4 py-2 bg-slate-900/30 border-b border-slate-700/40">
        <p className="text-xs text-slate-500 italic">{DISCREPANCY_COMPLIANCE_WORDING.basis}</p>
      </div>

      {/* Filter tabs */}
      <div className="px-4 pt-3 flex gap-1 flex-wrap">
        {(["active", "all", "Open", "Under Review", "Escalated", "Resolved", "Ignored"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filterStatus === s
                ? "bg-slate-600/60 text-slate-200"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
            }`}
          >
            {s === "active" ? "Active" : s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="p-4 space-y-3">
        {loading && (
          <div className="text-xs text-slate-500 animate-pulse py-4 text-center">Loading discrepancies…</div>
        )}

        {!loading && displayRows.length === 0 && (
          <p className="text-xs text-slate-500 py-4 text-center">
            {filterStatus === "active" ? "No active discrepancies." : `No ${filterStatus} discrepancies.`}
          </p>
        )}

        {!loading && displayRows.map(row => {
          const isExpanded = expanded.has(row.id);
          const isBusy     = actionBusy === row.id;
          const icon       = DISCREPANCY_TYPE_ICON[row.discrepancy_type] ?? "❓";

          return (
            <div
              key={row.id}
              className={`rounded-lg border transition-colors ${
                row.status === "Escalated"
                  ? "border-purple-500/30 bg-purple-500/5"
                  : row.severity === "Critical"
                  ? "border-red-500/30 bg-red-500/5"
                  : row.severity === "High"
                  ? "border-orange-500/20 bg-orange-500/5"
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
                    <span className="text-sm font-medium text-slate-200 truncate">
                      {row.discrepancy_type}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${SEVERITY_BADGE[row.severity]}`}>
                      {SEVERITY_ICON[row.severity]} {row.severity}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[row.status]}`}>
                      {row.status}
                    </span>
                    {row.procurement_reference && (
                      <span className="text-xs text-slate-500 font-mono">{row.procurement_reference}</span>
                    )}
                  </div>

                  {/* Source comparison preview */}
                  {row.source_a && row.source_b && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="bg-slate-700/40 px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
                        {row.source_a}: {row.source_a_value ?? "—"}
                      </span>
                      <span className="text-slate-600">≠</span>
                      <span className="bg-slate-700/40 px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
                        {row.source_b}: {row.source_b_value ?? "—"}
                      </span>
                    </div>
                  )}
                </div>

                <span className="text-slate-500 text-xs mt-1 shrink-0 ml-1">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-slate-700/30 px-3 py-3 space-y-3">
                  {/* Source comparison */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-900/40 px-3 py-2">
                      <p className="text-xs text-slate-500 mb-0.5">Source A</p>
                      <p className="text-xs font-medium text-slate-300">{row.source_a ?? "—"}</p>
                      <p className="text-xs text-amber-300/80 font-mono mt-0.5">{row.source_a_value ?? "—"}</p>
                    </div>
                    <div className="rounded-lg bg-slate-900/40 px-3 py-2">
                      <p className="text-xs text-slate-500 mb-0.5">Source B</p>
                      <p className="text-xs font-medium text-slate-300">{row.source_b ?? "—"}</p>
                      <p className="text-xs text-amber-300/80 font-mono mt-0.5">{row.source_b_value ?? "—"}</p>
                    </div>
                  </div>

                  {/* Detection rule */}
                  {row.detected_rule && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Detection Rule</p>
                      <p className="text-xs text-slate-400 italic">{row.detected_rule}</p>
                    </div>
                  )}

                  {/* Recommended action */}
                  {row.recommended_action && (
                    <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2">
                      <p className="text-xs text-amber-400 font-medium mb-0.5">Recommended Action</p>
                      <p className="text-xs text-amber-300/80 leading-relaxed">{row.recommended_action}</p>
                    </div>
                  )}

                  {/* Resolution note */}
                  {row.resolution_note && (
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Resolution Note</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{row.resolution_note}</p>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    <span>Detected: {new Date(row.created_at).toLocaleString()}</span>
                    {row.reviewed_at && <span>Reviewed: {new Date(row.reviewed_at).toLocaleString()}</span>}
                  </div>

                  {/* Admin actions — only for non-terminal statuses */}
                  {!["Resolved", "Ignored"].includes(row.status) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {row.status === "Open" && (
                        <button
                          onClick={() => handleReview(row.id)}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30
                                     hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                        >
                          {isBusy ? "…" : "Mark Under Review"}
                        </button>
                      )}
                      <button
                        onClick={() => openModal("resolve", row.id, row.discrepancy_type)}
                        disabled={isBusy}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30
                                   hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => openModal("ignore", row.id, row.discrepancy_type)}
                        disabled={isBusy}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-slate-600/30 text-slate-400 border border-slate-600/40
                                   hover:bg-slate-600/50 disabled:opacity-50 transition-colors"
                      >
                        Ignore
                      </button>
                      {row.status !== "Escalated" && (
                        <button
                          onClick={() => openModal("escalate", row.id, row.discrepancy_type)}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30
                                     hover:bg-purple-500/25 disabled:opacity-50 transition-colors"
                        >
                          Escalate
                        </button>
                      )}
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
              {actionModal.kind} Discrepancy
            </h4>
            <p className="text-xs text-slate-400">
              Discrepancy: <span className="text-slate-300 font-medium">{actionModal.type}</span>
            </p>

            {actionModal.kind !== "escalate" && (
              <p className="text-xs text-slate-500 italic">{DISCREPANCY_COMPLIANCE_WORDING.not_fraud}</p>
            )}
            {actionModal.kind === "escalate" && (
              <p className="text-xs text-slate-500 italic">{DISCREPANCY_COMPLIANCE_WORDING.escalation}</p>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {actionModal.kind === "escalate" ? "Escalation note (optional)" : "Resolution note *"}
              </label>
              <textarea
                rows={3}
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder={
                  actionModal.kind === "resolve"  ? "Describe how this was resolved…" :
                  actionModal.kind === "ignore"   ? "Reason for ignoring this discrepancy…" :
                  "Optional escalation context…"
                }
                className="w-full rounded-lg bg-slate-800 border border-slate-700/60 text-slate-200 text-xs px-3 py-2
                           placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none"
              />
            </div>

            {actionErr && (
              <p className="text-xs text-red-400">{actionErr}</p>
            )}

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
                  actionModal.kind === "resolve"
                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
                    : actionModal.kind === "ignore"
                    ? "bg-slate-600/30 text-slate-300 border border-slate-600/40 hover:bg-slate-600/50"
                    : "bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30"
                }`}
              >
                {actionBusy ? "…" : actionModal.kind === "resolve" ? "Resolve" : actionModal.kind === "ignore" ? "Ignore" : "Escalate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
