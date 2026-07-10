"use client";

// ─── InternalControlCard ──────────────────────────────────────────────────────
// Self-fetching card for SOP / Internal Control Matrix checks.
// Shows control check results for a job or procurement order.
//
// Props:
//   jobReference         — filter checks by job
//   procurementReference — filter checks by procurement order
//   workflowArea         — optional: filter to a specific workflow area
//   role                 — "admin" | "customer" | "service_provider"
//
// Admin view: full detail, Run Check button, override/acknowledge actions.
// Non-admin view: overall gate status only (no override detail).
//
// Constraints:
//   - Does NOT change core workflow.
//   - Does NOT auto-release money.
//   - This is internal control and SOP visibility only.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  CHECK_STATUS_BADGE,
  CHECK_STATUS_ICON,
  WORKFLOW_AREA_ICON,
  CONTROL_COMPLIANCE_WORDING,
  getOverallControlStatus,
  isActionAllowed,
  type InternalControlCheckRow,
  type CheckStatus,
  type WorkflowArea,
} from "@/lib/internalControl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface Props {
  jobReference?:          string;
  procurementReference?:  string;
  workflowArea?:          string;
  role:                   "admin" | "customer" | "service_provider";
}

export function InternalControlCard({
  jobReference,
  procurementReference,
  workflowArea,
  role,
}: Props) {
  const [checks, setChecks]         = useState<InternalControlCheckRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [running, setRunning]       = useState(false);
  const [runResult, setRunResult]   = useState<{ checked: number; passed: number; failed: number; warning: number } | null>(null);

  // Override modal state
  const [overrideId, setOverrideId]     = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const params = new URLSearchParams();
    if (jobReference)         params.set("job_reference", jobReference);
    if (procurementReference) params.set("procurement_reference", procurementReference);
    if (workflowArea)         params.set("workflow_area", workflowArea);

    const res = await fetch(`/api/internal-control-checks?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json() as { data?: InternalControlCheckRow[]; error?: string };
    if (json.error) { setError(json.error); setLoading(false); return; }
    setChecks(json.data ?? []);
    setLoading(false);
  }, [jobReference, procurementReference, workflowArea]);

  useEffect(() => { void fetchChecks(); }, [fetchChecks]);

  const runChecks = async () => {
    if (!jobReference && !procurementReference) return;
    setRunning(true);
    setRunResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setRunning(false); return; }

    const res = await fetch("/api/internal-control-checks/run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_reference:          jobReference ?? null,
        procurement_reference:  procurementReference ?? null,
        workflow_area:          workflowArea ?? null,
      }),
    });
    const json = await res.json() as {
      checked?: number; passed?: number; failed?: number; warning?: number; error?: string;
    };
    if (!json.error) {
      setRunResult({
        checked: json.checked ?? 0,
        passed:  json.passed ?? 0,
        failed:  json.failed ?? 0,
        warning: json.warning ?? 0,
      });
      void fetchChecks();
    }
    setRunning(false);
  };

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

  const overall = getOverallControlStatus(checks);
  const { allowed, reason: blockReason } = isActionAllowed(checks);

  const statusBadge = (s: CheckStatus) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${CHECK_STATUS_BADGE[s]}`}>
      {CHECK_STATUS_ICON[s]} {s}
    </span>
  );

  const isAdmin = role === "admin";

  // ── Non-admin simplified view ────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔒</span>
            <span className="font-semibold text-slate-200 text-sm">Internal Control Gate</span>
          </div>
          {statusBadge(overall)}
        </div>
        {!allowed && blockReason && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
            ⚠ {blockReason}
          </div>
        )}
        {checks.length === 0 && !loading && (
          <div className="mt-2 text-xs text-slate-500">No control checks recorded for this {jobReference ? "job" : "order"} yet.</div>
        )}
      </div>
    );
  }

  // ── Admin full view ──────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔒</span>
          <div>
            <div className="font-semibold text-slate-100">Internal Control Checks</div>
            <div className="text-xs text-slate-500">SOP gate — {workflowArea ?? "all workflow areas"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {overall !== "Not Checked" && statusBadge(overall)}
          <button
            onClick={() => void runChecks()}
            disabled={running}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
          >
            {running ? "Running…" : "Run Control Check"}
          </button>
        </div>
      </div>

      {/* Run result */}
      {runResult && (
        <div className="px-5 py-2 bg-slate-800/40 border-b border-slate-800 text-xs flex flex-wrap gap-4 text-slate-400">
          <span>Checked: <strong className="text-white">{runResult.checked}</strong></span>
          <span className="text-emerald-400">Passed: <strong>{runResult.passed}</strong></span>
          {runResult.warning > 0 && <span className="text-amber-400">Warning: <strong>{runResult.warning}</strong></span>}
          {runResult.failed  > 0 && <span className="text-red-400">Failed: <strong>{runResult.failed}</strong></span>}
        </div>
      )}

      {/* Gate blocker banner */}
      {!allowed && blockReason && (
        <div className="px-5 py-3 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          ⚠ <strong>Gate Blocked:</strong> {blockReason}
        </div>
      )}

      {/* Compliance note */}
      <div className="px-5 py-2 bg-slate-950/40 border-b border-slate-800 text-xs text-slate-600">
        {CONTROL_COMPLIANCE_WORDING.basis}
      </div>

      {/* Content */}
      <div className="divide-y divide-slate-800/60">
        {loading ? (
          <div className="p-5 text-sm text-slate-400">Loading control checks…</div>
        ) : error ? (
          <div className="p-5 text-sm text-red-400">{error}</div>
        ) : checks.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">
            No control checks recorded. Click <strong>Run Control Check</strong> to evaluate current SOP gates.
          </div>
        ) : (
          checks.map(check => (
            <div key={check.id} className="p-4">
              {/* Check row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">
                    {WORKFLOW_AREA_ICON[check.workflow_area as WorkflowArea] ?? "📌"}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200 text-sm truncate">
                      {check.control_rule?.control_name ?? check.workflow_area ?? "Control Check"}
                    </div>
                    {check.checked_at && (
                      <div className="text-xs text-slate-600">
                        {new Date(check.checked_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(check.check_status)}
                  <button
                    onClick={() => setExpandedId(expandedId === check.id ? null : check.id)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {expandedId === check.id ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {/* Quick failure reason */}
              {check.failure_reason && !["Passed", "Overridden"].includes(check.check_status) && (
                <div className="mt-1 ml-9 text-xs text-red-400/80">
                  {check.failure_reason}
                </div>
              )}

              {/* Expanded */}
              {expandedId === check.id && (
                <div className="mt-3 ml-9 space-y-2 text-xs">
                  {check.evidence_summary && (
                    <div className="text-slate-400 leading-relaxed">{check.evidence_summary}</div>
                  )}
                  {check.override_reason && (
                    <div className="text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-lg p-2">
                      <span className="font-medium">Override/Acknowledgment:</span> {check.override_reason}
                    </div>
                  )}
                  {check.control_rule && (
                    <div className="text-slate-500">
                      Maker: {check.control_rule.maker_role ?? "—"} |
                      Checker: {check.control_rule.checker_role ?? "—"} |
                      Dual: {check.control_rule.requires_dual_approval ? "Yes" : "No"} |
                      Same User Blocked: {check.control_rule.same_user_restricted ? "Yes" : "No"}
                    </div>
                  )}

                  {/* Action buttons */}
                  {check.check_status === "Failed" && (
                    <div className="pt-1">
                      <button
                        onClick={() => { setOverrideId(check.id); setOverrideReason(""); }}
                        className="px-3 py-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-medium transition-colors"
                      >
                        Override with Reason
                      </button>
                    </div>
                  )}
                  {check.check_status === "Warning" && (
                    <div className="pt-1">
                      <button
                        onClick={() => void doAction(check.id, "acknowledge")}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        Acknowledge Warning
                      </button>
                    </div>
                  )}

                  {/* Override reason input */}
                  {overrideId === check.id && (
                    <div className="bg-slate-800/80 border border-purple-500/30 rounded-lg p-3 space-y-2">
                      <div className="text-purple-300 font-medium">Override — Written Justification Required</div>
                      <p className="text-slate-500 leading-relaxed">{CONTROL_COMPLIANCE_WORDING.override}</p>
                      <textarea
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                        placeholder="Written justification for override — permanent audit record will be created…"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void doAction(check.id, "override")}
                          disabled={actionLoading || overrideReason.trim().length < 5}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
                        >
                          {actionLoading ? "Saving…" : "Confirm Override"}
                        </button>
                        <button
                          onClick={() => { setOverrideId(null); setOverrideReason(""); }}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
        <a
          href="/admin/internal-controls"
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          View All Control Rules →
        </a>
        <a
          href="/admin/internal-controls/checks"
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          Full Check Log →
        </a>
      </div>
    </div>
  );
}
