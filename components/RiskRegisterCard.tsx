"use client";

// ─── RiskRegisterCard ─────────────────────────────────────────────────────────
// Self-fetching risk register card for:
//   - Admin job detail (jobReference prop)
//   - Admin procurement order detail (procurementReference prop)
//   - Supplier profile (supplierId prop)
//   - Company profile (companyId prop)
//
// Shows: risks, mitigation actions, create risk / generate buttons.
// Actions: accept, resolve, close, create mitigation action.
//
// Constraints:
//   - No legal risk opinions
//   - No external risk database
//   - No auto-blocking workflow actions

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  type OperationalRiskRow,
  type RiskMitigationActionRow,
  type RiskCategory,
  type RiskLikelihood,
  type RiskImpact,
  RISK_SEVERITY_BADGE,
  RISK_STATUS_BADGE,
  RISK_SEVERITY_ICON,
  RISK_CATEGORY_ICON,
  RISK_COMPLIANCE_WORDING,
  ALL_RISK_CATEGORIES,
  isRiskOverdue,
} from "@/lib/operationalRisk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type RiskRowWithActions = OperationalRiskRow & {
  mitigation_actions: RiskMitigationActionRow[];
};

interface Props {
  jobReference?:           string;
  procurementReference?:   string;
  supplierId?:             string;
  companyId?:              string;
  role:                    "admin" | string;
}

interface CreateRiskForm {
  risk_title:       string;
  risk_description: string;
  risk_category:    RiskCategory;
  likelihood:       RiskLikelihood;
  impact:           RiskImpact;
  root_cause:       string;
  mitigation_plan:  string;
}

interface CreateActionForm {
  action_title:        string;
  action_description:  string;
  assigned_role:       string;
  due_at:              string;
}

const DEFAULT_CREATE_RISK: CreateRiskForm = {
  risk_title:       "",
  risk_description: "",
  risk_category:    "Other",
  likelihood:       "Medium",
  impact:           "Medium",
  root_cause:       "",
  mitigation_plan:  "",
};

const DEFAULT_CREATE_ACTION: CreateActionForm = {
  action_title:       "",
  action_description: "",
  assigned_role:      "admin",
  due_at:             "",
};

export function RiskRegisterCard({
  jobReference,
  procurementReference,
  supplierId,
  companyId,
  role,
}: Props) {
  const isAdmin = role === "admin";

  const [risks, setRisks]             = useState<RiskRowWithActions[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [token, setToken]             = useState<string | null>(null);

  // Generate
  const [generating, setGenerating]           = useState(false);
  const [generateResult, setGenerateResult]   = useState<string | null>(null);

  // Create risk modal
  const [showCreateRisk, setShowCreateRisk]     = useState(false);
  const [createRiskForm, setCreateRiskForm]     = useState<CreateRiskForm>(DEFAULT_CREATE_RISK);
  const [creatingRisk, setCreatingRisk]         = useState(false);
  const [createRiskError, setCreateRiskError]   = useState<string | null>(null);

  // Create mitigation action modal
  const [actionTargetRisk, setActionTargetRisk]       = useState<RiskRowWithActions | null>(null);
  const [createActionForm, setCreateActionForm]         = useState<CreateActionForm>(DEFAULT_CREATE_ACTION);
  const [creatingAction, setCreatingAction]             = useState(false);
  const [createActionError, setCreateActionError]       = useState<string | null>(null);

  // Risk status actions
  const [resolveRisk, setResolveRisk]         = useState<RiskRowWithActions | null>(null);
  const [acceptRisk, setAcceptRisk]           = useState<RiskRowWithActions | null>(null);
  const [resolveNote, setResolveNote]         = useState("");
  const [acceptNote, setAcceptNote]           = useState("");
  const [savingAction, setSavingAction]       = useState(false);
  const [saveActionError, setSaveActionError] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
    });
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchRisks = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("operational_risk_register")
      .select(`*, mitigation_actions:risk_mitigation_actions(*)`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (jobReference)           query = query.eq("job_reference", jobReference);
    if (procurementReference)   query = query.eq("procurement_reference", procurementReference);
    if (supplierId)             query = query.eq("supplier_id", supplierId);
    if (companyId)              query = query.eq("company_id", companyId);

    if (!isAdmin) {
      query = query.in("risk_status", ["Open", "In Review", "Mitigation Active"]);
    }

    const { data, error } = await query;
    if (!error && data) {
      setRisks(data as unknown as RiskRowWithActions[]);
    }
    setLoading(false);
  }, [jobReference, procurementReference, supplierId, companyId, isAdmin]);

  useEffect(() => { fetchRisks(); }, [fetchRisks]);

  // ── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!token) return;
    setGenerating(true);
    setGenerateResult(null);
    try {
      const body: Record<string, string> = {};
      if (jobReference)         body.job_reference           = jobReference;
      if (procurementReference) body.procurement_reference   = procurementReference;
      if (supplierId)           body.supplier_id             = supplierId;

      const res = await fetch("/api/operational-risk-register/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        setGenerateResult(`✓ ${json.count ?? 0} new risk(s) generated.`);
        fetchRisks();
      } else {
        setGenerateResult(`Error: ${json.error ?? "Unknown"}`);
      }
    } catch {
      setGenerateResult("Network error.");
    }
    setGenerating(false);
  };

  // ── Create risk ───────────────────────────────────────────────────────────

  const handleCreateRisk = async () => {
    if (!token || !createRiskForm.risk_title.trim()) return;
    setCreatingRisk(true);
    setCreateRiskError(null);
    try {
      const res = await fetch("/api/operational-risk-register", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          risk_title:            createRiskForm.risk_title.trim(),
          risk_description:      createRiskForm.risk_description || undefined,
          risk_category:         createRiskForm.risk_category,
          likelihood:            createRiskForm.likelihood,
          impact:                createRiskForm.impact,
          root_cause:            createRiskForm.root_cause || undefined,
          mitigation_plan:       createRiskForm.mitigation_plan || undefined,
          job_reference:         jobReference,
          procurement_reference: procurementReference,
          supplier_id:           supplierId,
          company_id:            companyId,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowCreateRisk(false);
        setCreateRiskForm(DEFAULT_CREATE_RISK);
        fetchRisks();
      } else {
        setCreateRiskError(json.error ?? "Unknown error");
      }
    } catch {
      setCreateRiskError("Network error.");
    }
    setCreatingRisk(false);
  };

  // ── Create mitigation action ──────────────────────────────────────────────

  const handleCreateAction = async () => {
    if (!token || !actionTargetRisk || !createActionForm.action_title.trim()) return;
    setCreatingAction(true);
    setCreateActionError(null);
    try {
      const res = await fetch("/api/risk-mitigation-actions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          risk_id:             actionTargetRisk.id,
          action_title:        createActionForm.action_title.trim(),
          action_description:  createActionForm.action_description || undefined,
          assigned_role:       createActionForm.assigned_role || "admin",
          due_at:              createActionForm.due_at || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setActionTargetRisk(null);
        setCreateActionForm(DEFAULT_CREATE_ACTION);
        fetchRisks();
      } else {
        setCreateActionError(json.error ?? "Unknown error");
      }
    } catch {
      setCreateActionError("Network error.");
    }
    setCreatingAction(false);
  };

  // ── Risk status actions ───────────────────────────────────────────────────

  const handleRiskStatusAction = async (
    risk: RiskRowWithActions,
    action: "accept" | "resolve" | "close",
    note: string,
  ) => {
    if (!token) return;
    setSavingAction(true);
    setSaveActionError(null);
    const body: Record<string, unknown> = { action };
    if (action === "accept" || action === "resolve") body.resolution_note = note;

    try {
      const res = await fetch(`/api/operational-risk-register/${risk.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        setResolveRisk(null);
        setAcceptRisk(null);
        setResolveNote("");
        setAcceptNote("");
        fetchRisks();
      } else {
        setSaveActionError(json.error ?? "Unknown error");
      }
    } catch {
      setSaveActionError("Network error.");
    }
    setSavingAction(false);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────

  const openRisks     = risks.filter(r => ["Open","In Review","Mitigation Active"].includes(r.risk_status));
  const criticalCount = risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed","Accepted"].includes(r.risk_status)).length;
  const overdueCount  = risks.filter(r => isRiskOverdue(r)).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-900/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-base">⚠</span>
          <div>
            <h3 className="text-sm font-semibold text-white">Operational Risk Register</h3>
            <p className="text-xs text-slate-500">Internal tracking only · No legal opinions</p>
          </div>
          {criticalCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400">
              {criticalCount} Critical
            </span>
          )}
          {overdueCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">
              {overdueCount} Overdue
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition text-xs font-medium disabled:opacity-50"
            >
              {generating ? "Generating…" : "⚡ Generate"}
            </button>
            <button
              onClick={() => { setShowCreateRisk(true); setCreateRiskError(null); setCreateRiskForm(DEFAULT_CREATE_RISK); }}
              className="px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition text-xs font-medium"
            >
              + Risk
            </button>
            <Link
              href="/admin/risk-register"
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition text-xs"
            >
              View All →
            </Link>
          </div>
        )}
      </div>

      {/* Generate result */}
      {generateResult && (
        <div className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs ${generateResult.startsWith("✓") ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          {generateResult}
        </div>
      )}

      {/* Compliance notice */}
      <div className="mx-4 mt-3 rounded-lg border border-slate-700/30 bg-slate-800/20 px-3 py-2 text-xs text-slate-600">
        {RISK_COMPLIANCE_WORDING.no_auto_block}
      </div>

      {/* Body */}
      <div className="p-4">
        {loading ? (
          <div className="text-slate-500 text-sm text-center py-6">Loading risks…</div>
        ) : risks.length === 0 ? (
          <div className="text-slate-600 text-sm text-center py-6">
            No risks recorded.{isAdmin ? " Generate or create to start tracking." : ""}
          </div>
        ) : (
          <div className="space-y-2">
            {risks.map(risk => {
              const overdue    = isRiskOverdue(risk);
              const isExp      = expanded === risk.id;
              const catIcon    = risk.risk_category ? (RISK_CATEGORY_ICON[risk.risk_category] ?? "📌") : "📌";
              const openActions = (risk.mitigation_actions ?? []).filter(a =>
                ["Open","In Progress","Overdue"].includes(a.status)
              ).length;

              return (
                <div
                  key={risk.id}
                  className={`rounded-xl border bg-slate-900/40 transition-all ${
                    risk.risk_severity === "Critical"
                      ? "border-red-500/30"
                      : overdue
                      ? "border-orange-500/25"
                      : "border-slate-700/30"
                  }`}
                >
                  <button
                    onClick={() => setExpanded(isExp ? null : risk.id)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 flex-wrap"
                  >
                    <span className="text-sm">{catIcon}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${RISK_SEVERITY_BADGE[risk.risk_severity]}`}>
                      {RISK_SEVERITY_ICON[risk.risk_severity]} {risk.risk_severity}
                    </span>
                    <span className="font-medium text-slate-200 flex-1 text-sm leading-snug">{risk.risk_title}</span>
                    {overdue && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-400">Overdue</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${RISK_STATUS_BADGE[risk.risk_status]}`}>
                      {risk.risk_status}
                    </span>
                    {openActions > 0 && (
                      <span className="text-xs text-blue-400">{openActions}▸</span>
                    )}
                    <span className="text-slate-700 text-xs">{isExp ? "▲" : "▼"}</span>
                  </button>

                  {isExp && (
                    <div className="border-t border-slate-700/30 px-3 py-3 space-y-3">
                      {/* Meta */}
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        {risk.risk_category && <span>Category: <span className="text-slate-400">{risk.risk_category}</span></span>}
                        {risk.likelihood    && <span>Likelihood: <span className="text-slate-400">{risk.likelihood}</span></span>}
                        {risk.impact        && <span>Impact: <span className="text-slate-400">{risk.impact}</span></span>}
                        {risk.owner_role    && <span>Owner: <span className="text-slate-400">{risk.owner_role}</span></span>}
                        {risk.due_date      && <span>Due: <span className={overdue ? "text-orange-400" : "text-slate-400"}>{risk.due_date}</span></span>}
                        <span>Ref: <span className="text-slate-500 font-mono">{risk.risk_reference}</span></span>
                      </div>

                      {risk.risk_description && (
                        <p className="text-xs text-slate-400">{risk.risk_description}</p>
                      )}

                      {risk.resolution_note && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                          <span className="text-emerald-500 font-medium">Resolution: </span>{risk.resolution_note}
                        </div>
                      )}

                      {/* Mitigation actions */}
                      {(risk.mitigation_actions ?? []).length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs text-slate-600 font-medium">Mitigation Actions</div>
                          {risk.mitigation_actions.map(a => (
                            <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg border border-slate-700/25 bg-slate-800/30 px-2 py-1.5">
                              <span className="text-slate-300 flex-1">{a.action_title}</span>
                              <span className="text-slate-600">{a.assigned_role}</span>
                              <span className={`px-1.5 py-0.5 rounded-full border ${
                                a.status === "Completed"   ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                                a.status === "In Progress" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                                a.status === "Overdue"     ? "bg-red-500/15 text-red-400 border-red-500/30" :
                                "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              }`}>{a.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Admin actions */}
                      {isAdmin && !["Resolved","Closed"].includes(risk.risk_status) && (
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-700/25">
                          {risk.risk_status !== "Accepted" && (
                            <>
                              <button
                                onClick={() => { setAcceptRisk(risk); setAcceptNote(""); setSaveActionError(null); }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs transition"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => { setResolveRisk(risk); setResolveNote(""); setSaveActionError(null); }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-xs transition"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => { setActionTargetRisk(risk); setCreateActionForm(DEFAULT_CREATE_ACTION); setCreateActionError(null); }}
                                className="px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 text-xs transition"
                              >
                                + Action
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleRiskStatusAction(risk, "close", "")}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-600 hover:text-slate-400 text-xs transition"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show Resolved / Closed count if any hidden */}
            {!isAdmin && risks.filter(r => ["Resolved","Closed","Accepted"].includes(r.risk_status)).length > 0 && (
              <div className="text-xs text-slate-600 text-center pt-1">
                Some resolved/closed risks are visible to admins only.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Risk Modal ─────────────────────────────────────────────── */}
      {showCreateRisk && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f1a] border border-slate-700/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Create Risk</h2>
              <button onClick={() => setShowCreateRisk(false)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>
            <div className="text-xs text-slate-600 border border-slate-700/40 rounded-lg px-3 py-2">
              {RISK_COMPLIANCE_WORDING.basis}
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Risk Title *</label>
                <input
                  type="text"
                  value={createRiskForm.risk_title}
                  onChange={e => setCreateRiskForm(f => ({ ...f, risk_title: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                  placeholder="Brief risk description…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  value={createRiskForm.risk_description}
                  onChange={e => setCreateRiskForm(f => ({ ...f, risk_description: e.target.value }))}
                  rows={2}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Category</label>
                  <select
                    value={createRiskForm.risk_category}
                    onChange={e => setCreateRiskForm(f => ({ ...f, risk_category: e.target.value as RiskCategory }))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
                  >
                    {ALL_RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Likelihood</label>
                  <select
                    value={createRiskForm.likelihood}
                    onChange={e => setCreateRiskForm(f => ({ ...f, likelihood: e.target.value as RiskLikelihood }))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Impact</label>
                  <select
                    value={createRiskForm.impact}
                    onChange={e => setCreateRiskForm(f => ({ ...f, impact: e.target.value as RiskImpact }))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Root Cause</label>
                <input
                  type="text"
                  value={createRiskForm.root_cause}
                  onChange={e => setCreateRiskForm(f => ({ ...f, root_cause: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                  placeholder="Known or suspected root cause…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Mitigation Plan</label>
                <textarea
                  value={createRiskForm.mitigation_plan}
                  onChange={e => setCreateRiskForm(f => ({ ...f, mitigation_plan: e.target.value }))}
                  rows={2}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Initial mitigation steps…"
                />
              </div>
            </div>
            {createRiskError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-xs">{createRiskError}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleCreateRisk}
                disabled={creatingRisk || !createRiskForm.risk_title.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition text-sm font-medium disabled:opacity-50"
              >
                {creatingRisk ? "Creating…" : "Create Risk"}
              </button>
              <button onClick={() => setShowCreateRisk(false)} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Mitigation Action Modal ────────────────────────────────── */}
      {actionTargetRisk && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f1a] border border-slate-700/50 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Add Mitigation Action</h2>
              <button onClick={() => setActionTargetRisk(null)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>
            <div className="text-xs text-slate-500">{actionTargetRisk.risk_title}</div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Action Title *</label>
                <input
                  type="text"
                  value={createActionForm.action_title}
                  onChange={e => setCreateActionForm(f => ({ ...f, action_title: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                  placeholder="What needs to be done…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  value={createActionForm.action_description}
                  onChange={e => setCreateActionForm(f => ({ ...f, action_description: e.target.value }))}
                  rows={2}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Assigned Role</label>
                  <select
                    value={createActionForm.assigned_role}
                    onChange={e => setCreateActionForm(f => ({ ...f, assigned_role: e.target.value }))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="admin">Admin</option>
                    <option value="company">Company</option>
                    <option value="supplier">Supplier</option>
                    <option value="provider">Provider</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Due Date</label>
                  <input
                    type="date"
                    value={createActionForm.due_at}
                    onChange={e => setCreateActionForm(f => ({ ...f, due_at: e.target.value }))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
            </div>
            {createActionError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-xs">{createActionError}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleCreateAction}
                disabled={creatingAction || !createActionForm.action_title.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition text-sm font-medium disabled:opacity-50"
              >
                {creatingAction ? "Saving…" : "Add Action"}
              </button>
              <button onClick={() => setActionTargetRisk(null)} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Accept Risk Modal ─────────────────────────────────────────────── */}
      {acceptRisk && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f1a] border border-slate-700/50 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Accept Risk</h2>
              <button onClick={() => setAcceptRisk(null)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>
            <div className="text-xs text-slate-500 border border-slate-700/40 rounded-lg px-3 py-2">
              {RISK_COMPLIANCE_WORDING.accepted}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Acceptance Note * (min 5 chars)</label>
              <textarea
                value={acceptNote}
                onChange={e => setAcceptNote(e.target.value)}
                rows={3}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                placeholder="Reason for accepting this risk…"
              />
            </div>
            {saveActionError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-xs">{saveActionError}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => handleRiskStatusAction(acceptRisk, "accept", acceptNote)}
                disabled={savingAction || acceptNote.trim().length < 5}
                className="flex-1 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition text-sm disabled:opacity-50"
              >
                {savingAction ? "Saving…" : "Accept Risk"}
              </button>
              <button onClick={() => setAcceptRisk(null)} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolve Risk Modal ────────────────────────────────────────────── */}
      {resolveRisk && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f1a] border border-slate-700/50 rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Mark Resolved</h2>
              <button onClick={() => setResolveRisk(null)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Resolution Note * (min 5 chars)</label>
              <textarea
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                rows={3}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                placeholder="How was this risk resolved…"
              />
            </div>
            {saveActionError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-xs">{saveActionError}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => handleRiskStatusAction(resolveRisk, "resolve", resolveNote)}
                disabled={savingAction || resolveNote.trim().length < 5}
                className="flex-1 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition text-sm disabled:opacity-50"
              >
                {savingAction ? "Saving…" : "Mark Resolved"}
              </button>
              <button onClick={() => setResolveRisk(null)} className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
