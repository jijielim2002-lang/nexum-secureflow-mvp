"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  CHECK_STATUS_BADGE,
  CHECK_STATUS_ICON,
  WORKFLOW_AREA_ICON,
  CONTROL_COMPLIANCE_WORDING,
  ALL_WORKFLOW_AREAS,
  type InternalControlRuleRow,
  type WorkflowArea,
} from "@/lib/internalControl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function InternalControlsPage() {
  const [rules, setRules]           = useState<InternalControlRuleRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editNote, setEditNote]     = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not authenticated"); setLoading(false); return; }

    const params = new URLSearchParams();
    if (!showInactive) params.set("active", "true");
    if (areaFilter !== "all") params.set("workflow_area", areaFilter);

    const res = await fetch(`/api/internal-controls?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json() as { data?: InternalControlRuleRow[]; error?: string };
    if (json.error) { setError(json.error); setLoading(false); return; }
    setRules(json.data ?? []);
    setLoading(false);
  }, [areaFilter, showInactive]);

  useEffect(() => { void fetchRules(); }, [fetchRules]);

  const startEdit = (rule: InternalControlRuleRow) => {
    setEditingId(rule.id);
    setEditNote(rule.control_note ?? "");
    setEditActive(rule.is_active);
  };

  const saveEdit = async (rule: InternalControlRuleRow) => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    const res = await fetch("/api/internal-controls", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: rule.id, control_note: editNote, is_active: editActive }),
    });
    const json = await res.json() as { error?: string };
    if (!json.error) {
      setEditingId(null);
      void fetchRules();
    }
    setSaving(false);
  };

  const filteredRules = rules;
  const byArea = filteredRules.reduce<Record<string, InternalControlRuleRow[]>>((acc, r) => {
    const area = r.workflow_area ?? "Other";
    if (!acc[area]) acc[area] = [];
    acc[area].push(r);
    return acc;
  }, {});

  const areaGroups = Object.entries(byArea).sort(([a], [b]) => a.localeCompare(b));

  const yesNo = (v: boolean) => v
    ? <span className="text-emerald-400 font-medium">Yes</span>
    : <span className="text-slate-500">No</span>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Internal Control Matrix</h1>
          <p className="text-slate-400 text-sm mt-1">
            Operating SOP control rules — maker-checker, evidence requirements, approval roles.
          </p>
        </div>
        <a
          href="/admin/internal-controls/checks"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
        >
          View Control Checks →
        </a>
      </div>

      {/* Compliance wording */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4 text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300 mb-2">⚠ Important — Control Scope</div>
        <p>{CONTROL_COMPLIANCE_WORDING.basis}</p>
        <p className="mt-1">{CONTROL_COMPLIANCE_WORDING.no_external}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={areaFilter}
          onChange={e => setAreaFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Workflow Areas</option>
          {ALL_WORKFLOW_AREAS.map(a => (
            <option key={a} value={a}>{WORKFLOW_AREA_ICON[a]} {a}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="accent-indigo-500"
          />
          Show inactive rules
        </label>
        <div className="ml-auto text-xs text-slate-500">
          {rules.length} rule{rules.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-slate-400 text-sm">Loading control rules…</div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : areaGroups.length === 0 ? (
        <div className="text-slate-500 text-sm">No control rules found.</div>
      ) : (
        <div className="space-y-6">
          {areaGroups.map(([area, areaRules]) => (
            <div key={area} className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden">
              {/* Area header */}
              <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center gap-2">
                <span className="text-lg">{WORKFLOW_AREA_ICON[area as WorkflowArea] ?? "📌"}</span>
                <span className="font-semibold text-slate-100">{area}</span>
                <span className="ml-2 text-xs text-slate-500">{areaRules.length} rule{areaRules.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Rules */}
              <div className="divide-y divide-slate-800/60">
                {areaRules.map(rule => (
                  <div key={rule.id} className="p-5">
                    {/* Rule header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-100">{rule.control_name}</span>
                          {!rule.is_active && (
                            <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400">Inactive</span>
                          )}
                        </div>
                        {rule.trigger_event && (
                          <div className="text-xs text-slate-500 mt-0.5">Trigger: {rule.trigger_event}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          {expandedId === rule.id ? "Collapse" : "Details"}
                        </button>
                        {editingId !== rule.id && (
                          <button
                            onClick={() => startEdit(rule)}
                            className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pill badges */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rule.requires_dual_approval && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          Dual Approval
                        </span>
                      )}
                      {rule.same_user_restricted && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Same User Restricted
                        </span>
                      )}
                      {rule.requires_reconciliation && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          Reconciliation Required
                        </span>
                      )}
                      {rule.requires_compliance_check && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Compliance Check
                        </span>
                      )}
                      {rule.requires_dispute_check && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-300 border border-red-500/30">
                          Dispute Check
                        </span>
                      )}
                      {rule.requires_audit_log && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-slate-600/50 text-slate-400 border border-slate-600/40">
                          Audit Log
                        </span>
                      )}
                    </div>

                    {/* Expanded details */}
                    {expandedId === rule.id && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1">
                          <div className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Roles</div>
                          <div className="text-slate-300">Maker: <span className="text-white">{rule.maker_role ?? "—"}</span></div>
                          <div className="text-slate-300">Checker: <span className="text-white">{rule.checker_role ?? "—"}</span></div>
                          <div className="text-slate-300">Approver: <span className="text-white">{rule.approver_role ?? "—"}</span></div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Requirements</div>
                          <div className="text-slate-300">Dual Approval: {yesNo(rule.requires_dual_approval)}</div>
                          <div className="text-slate-300">Same User Block: {yesNo(rule.same_user_restricted)}</div>
                          <div className="text-slate-300">Reconciliation: {yesNo(rule.requires_reconciliation)}</div>
                          <div className="text-slate-300">Compliance Check: {yesNo(rule.requires_compliance_check)}</div>
                          <div className="text-slate-300">Dispute Check: {yesNo(rule.requires_dispute_check)}</div>
                          <div className="text-slate-300">Terms Acceptance: {yesNo(rule.requires_terms_acceptance)}</div>
                        </div>
                        {rule.required_evidence && (
                          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                            <div className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Required Evidence</div>
                            <p className="text-slate-300 leading-relaxed">{rule.required_evidence}</p>
                          </div>
                        )}
                        {rule.control_note && (
                          <div className="sm:col-span-2 lg:col-span-3 bg-slate-800/50 rounded-lg p-3 border border-slate-700/40">
                            <div className="text-slate-500 font-medium uppercase tracking-wider text-[10px] mb-1">Control Note</div>
                            <p className="text-slate-300">{rule.control_note}</p>
                          </div>
                        )}
                        <div className="text-slate-600 text-[10px]">
                          Updated {new Date(rule.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    )}

                    {/* Edit form */}
                    {editingId === rule.id && (
                      <div className="mt-4 p-4 bg-slate-800/60 border border-slate-700/50 rounded-lg space-y-3">
                        <div className="text-xs font-medium text-slate-300">Edit Rule</div>
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={e => setEditActive(e.target.checked)}
                            className="accent-indigo-500"
                          />
                          Rule is active
                        </label>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Control Note</label>
                          <textarea
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            placeholder="Add or edit control note…"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void saveEdit(rule)}
                            disabled={saving}
                            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                          >
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 border-t border-slate-800 text-xs text-slate-600">
        {CONTROL_COMPLIANCE_WORDING.override}
      </div>
    </div>
  );
}
