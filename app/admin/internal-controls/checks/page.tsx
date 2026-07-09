"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  CHECK_STATUS_BADGE,
  CHECK_STATUS_ICON,
  WORKFLOW_AREA_ICON,
  CONTROL_COMPLIANCE_WORDING,
  ALL_WORKFLOW_AREAS,
  ALL_CHECK_STATUSES,
  getOverallControlStatus,
  type InternalControlCheckRow,
  type CheckStatus,
  type WorkflowArea,
} from "@/lib/internalControl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function InternalControlChecksPage() {
  const [checks, setChecks]           = useState<InternalControlCheckRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter]   = useState<string>("all");
  const [jobFilter, setJobFilter]     = useState("");
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  // Override modal
  const [overrideId, setOverrideId]   = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not authenticated"); setLoading(false); return; }

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (areaFilter !== "all")   params.set("workflow_area", areaFilter);
    if (jobFilter.trim())       params.set("job_reference", jobFilter.trim());

    const res = await fetch(`/api/internal-control-checks?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json() as { data?: InternalControlCheckRow[]; error?: string };
    if (json.error) { setError(json.error); setLoading(false); return; }
    setChecks(json.data ?? []);
    setLoading(false);
  }, [statusFilter, areaFilter, jobFilter]);

  useEffect(() => { void fetchChecks(); }, [fetchChecks]);

  const doAction = async (id: string, action: "override" | "acknowledge") => {
    if (action === "override" && overrideReason.trim().length < 5) return;
    setActionLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setActionLoading(false); return; }

    const body: Record<string, string> = { action };
    if (action === "override") body.override_reason = overrideReason.trim();

    await fetch(`/api/internal-control-checks/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setActionLoading(false);
    setOverrideId(null);
    setOverrideReason("");
    void fetchChecks();
  };

  const overallStatus = getOverallControlStatus(checks);

  // Metrics
  const failed   = checks.filter(c => c.check_status === "Failed").length;
  const warning  = checks.filter(c => c.check_status === "Warning").length;
  const overridden = checks.filter(c => c.check_status === "Overridden").length;
  const passed   = checks.filter(c => c.check_status === "Passed").length;

  const statusBadge = (s: CheckStatus) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${CHECK_STATUS_BADGE[s]}`}>
      {CHECK_STATUS_ICON[s]} {s}
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Control Check Log</h1>
          <p className="text-slate-400 text-sm mt-1">
            Recorded SOP control checks — results, failures, overrides, warnings.
          </p>
        </div>
        <a
          href="/admin/internal-controls"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
        >
          ← Control Rules
        </a>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Failed",     val: failed,    cls: "text-red-400"    },
          { label: "Warning",    val: warning,   cls: "text-amber-400"  },
          { label: "Overridden", val: overridden, cls: "text-purple-400" },
          { label: "Passed",     val: passed,    cls: "text-emerald-400"},
        ].map(m => (
          <div key={m.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${m.cls}`}>{m.val}</div>
            <div className="text-xs text-slate-500 mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={jobFilter}
          onChange={e => setJobFilter(e.target.value)}
          placeholder="Filter by Job Reference…"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
        />
        <select
          value={areaFilter}
          onChange={e => setAreaFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Areas</option>
          {ALL_WORKFLOW_AREAS.map(a => (
            <option key={a} value={a}>{WORKFLOW_AREA_ICON[a as WorkflowArea]} {a}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Statuses</option>
          {ALL_CHECK_STATUSES.map(s => (
            <option key={s} value={s}>{CHECK_STATUS_ICON[s]} {s}</option>
          ))}
        </select>
        <button
          onClick={() => void fetchChecks()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
        >
          Refresh
        </button>
        <div className="ml-auto text-xs text-slate-500">
          {checks.length} check{checks.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-slate-400 text-sm">Loading control checks…</div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : checks.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
          No control checks found matching these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map(check => (
            <div
              key={check.id}
              className={`bg-slate-900/60 border rounded-xl overflow-hidden ${
                check.check_status === "Failed"
                  ? "border-red-500/30"
                  : check.check_status === "Warning"
                  ? "border-amber-500/30"
                  : check.check_status === "Overridden"
                  ? "border-purple-500/30"
                  : "border-slate-800"
              }`}
            >
              <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
                {/* Left: area + rule name */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">
                    {WORKFLOW_AREA_ICON[check.workflow_area as WorkflowArea] ?? "📌"}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-100 truncate">
                      {check.control_rule?.control_name ?? check.workflow_area ?? "Control Check"}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                      {check.job_reference && <span>Job: {check.job_reference}</span>}
                      {check.procurement_reference && <span>PO: {check.procurement_reference}</span>}
                      {check.checked_at && (
                        <span>Checked {new Date(check.checked_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: status + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(check.check_status)}
                  <button
                    onClick={() => setExpandedId(expandedId === check.id ? null : check.id)}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {expandedId === check.id ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {/* Failure reason quick-show */}
              {check.failure_reason && check.check_status !== "Overridden" && (
                <div className="px-4 pb-2 text-xs text-red-400/80">
                  ⚠ {check.failure_reason}
                </div>
              )}

              {/* Expanded detail */}
              {expandedId === check.id && (
                <div className="border-t border-slate-800 p-4 space-y-3 text-sm">
                  {check.evidence_summary && (
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1">Evidence Summary</div>
                      <p className="text-slate-300 text-xs">{check.evidence_summary}</p>
                    </div>
                  )}
                  {check.failure_reason && (
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1">Failure / Warning Reason</div>
                      <p className="text-red-400 text-xs">{check.failure_reason}</p>
                    </div>
                  )}
                  {check.override_reason && (
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1">Override / Acknowledgment</div>
                      <p className="text-purple-300 text-xs">{check.override_reason}</p>
                    </div>
                  )}

                  {/* Rule details */}
                  {check.control_rule && (
                    <div className="bg-slate-800/40 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                      <div className="font-medium text-slate-300 mb-1">Rule Details</div>
                      <div>Maker: {check.control_rule.maker_role ?? "—"} | Checker: {check.control_rule.checker_role ?? "—"} | Approver: {check.control_rule.approver_role ?? "—"}</div>
                      {check.control_rule.requires_dual_approval && <div className="text-purple-400">Dual Approval Required</div>}
                      {check.control_rule.same_user_restricted && <div className="text-amber-400">Same User Restricted</div>}
                      {check.control_rule.required_evidence && (
                        <div className="text-slate-400 leading-relaxed mt-1">
                          <span className="font-medium">Required Evidence:</span> {check.control_rule.required_evidence}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  {["Failed", "Warning"].includes(check.check_status) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {check.check_status === "Failed" && (
                        <button
                          onClick={() => { setOverrideId(check.id); setOverrideReason(""); }}
                          className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          Override with Reason
                        </button>
                      )}
                      {check.check_status === "Warning" && (
                        <button
                          onClick={() => void doAction(check.id, "acknowledge")}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          Acknowledge Warning
                        </button>
                      )}
                    </div>
                  )}

                  {/* Override reason modal (inline) */}
                  {overrideId === check.id && (
                    <div className="bg-slate-800/80 border border-purple-500/30 rounded-lg p-4 space-y-3">
                      <div className="text-sm font-medium text-purple-300">
                        Override — Written Justification Required
                      </div>
                      <p className="text-xs text-slate-400">{CONTROL_COMPLIANCE_WORDING.override}</p>
                      <textarea
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                        placeholder="Provide a clear written justification for overriding this failed control…"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void doAction(check.id, "override")}
                          disabled={actionLoading || overrideReason.trim().length < 5}
                          className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                        >
                          {actionLoading ? "Saving…" : "Confirm Override"}
                        </button>
                        <button
                          onClick={() => { setOverrideId(null); setOverrideReason(""); }}
                          className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 text-xs text-slate-600 space-y-1">
        <p>{CONTROL_COMPLIANCE_WORDING.basis}</p>
        <p>{CONTROL_COMPLIANCE_WORDING.dual_approval}</p>
      </div>
    </div>
  );
}
