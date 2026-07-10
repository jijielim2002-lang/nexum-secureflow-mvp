"use client";

// ─── /admin/risk-register ────────────────────────────────────────────────────
// Admin-only: full operational risk register list.
// Filters: category, severity, status, owner_role, job_reference.
// Actions: Generate Risks Now, Create Risk (manual modal), view detail.

import { useEffect, useState, useCallback, Fragment } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  type OperationalRiskRow,
  type RiskMitigationActionRow,
  type RiskCategory,
  type RiskSeverity,
  type RiskStatus,
  type RiskLikelihood,
  type RiskImpact,
  RISK_SEVERITY_BADGE,
  RISK_STATUS_BADGE,
  RISK_SEVERITY_ICON,
  RISK_CATEGORY_ICON,
  RISK_COMPLIANCE_WORDING,
  ALL_RISK_CATEGORIES,
  ALL_RISK_STATUSES,
  ALL_RISK_SEVERITIES,
  isRiskOverdue,
} from "@/lib/operationalRisk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type RiskRowWithActions = OperationalRiskRow & {
  mitigation_actions: RiskMitigationActionRow[];
};

// ── Filters state ─────────────────────────────────────────────────────────────

interface Filters {
  category:  string;
  severity:  string;
  status:    string;
  ownerRole: string;
  jobRef:    string;
}

const DEFAULT_FILTERS: Filters = {
  category:  "",
  severity:  "",
  status:    "",
  ownerRole: "",
  jobRef:    "",
};

// ── Create Risk modal state ───────────────────────────────────────────────────

interface CreateForm {
  risk_title:        string;
  risk_description:  string;
  risk_category:     RiskCategory;
  likelihood:        RiskLikelihood;
  impact:            RiskImpact;
  root_cause:        string;
  mitigation_plan:   string;
  owner_role:        string;
  due_date:          string;
  job_reference:     string;
  procurement_reference: string;
}

const DEFAULT_CREATE: CreateForm = {
  risk_title:        "",
  risk_description:  "",
  risk_category:     "Other",
  likelihood:        "Medium",
  impact:            "Medium",
  root_cause:        "",
  mitigation_plan:   "",
  owner_role:        "admin",
  due_date:          "",
  job_reference:     "",
  procurement_reference: "",
};

// ── Action modal state ────────────────────────────────────────────────────────

type RiskAction = "update_status" | "accept" | "resolve" | "close" | null;

export default function RiskRegisterPage() {
  const [risks, setRisks]                   = useState<RiskRowWithActions[]>([]);
  const [loading, setLoading]               = useState(true);
  const [filters, setFilters]               = useState<Filters>(DEFAULT_FILTERS);
  const [expanded, setExpanded]             = useState<string | null>(null);
  const [generating, setGenerating]         = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [showCreate, setShowCreate]         = useState(false);
  const [createForm, setCreateForm]         = useState<CreateForm>(DEFAULT_CREATE);
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState<string | null>(null);
  const [actionModal, setActionModal]       = useState<{ risk: RiskRowWithActions; action: RiskAction } | null>(null);
  const [actionNote, setActionNote]         = useState("");
  const [actionStatus, setActionStatus]     = useState("");
  const [actioning, setActioning]           = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);
  const [token, setToken]                   = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
    });
  }, []);

  // ── Fetch risks ───────────────────────────────────────────────────────────

  const fetchRisks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "500" });
    if (filters.category)  params.set("risk_category", filters.category);
    if (filters.severity)  params.set("risk_severity", filters.severity);
    if (filters.status)    params.set("risk_status",   filters.status);
    if (filters.ownerRole) params.set("owner_role",    filters.ownerRole);
    if (filters.jobRef)    params.set("job_reference", filters.jobRef);

    const { data, error } = await supabase
      .from("operational_risk_register")
      .select(`*, mitigation_actions:risk_mitigation_actions(*)`)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!error && data) {
      let rows = data as unknown as RiskRowWithActions[];
      if (filters.category)  rows = rows.filter(r => r.risk_category === filters.category);
      if (filters.severity)  rows = rows.filter(r => r.risk_severity === filters.severity);
      if (filters.status)    rows = rows.filter(r => r.risk_status   === filters.status);
      if (filters.ownerRole) rows = rows.filter(r => r.owner_role    === filters.ownerRole);
      if (filters.jobRef)    rows = rows.filter(r => r.job_reference === filters.jobRef);
      setRisks(rows);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchRisks(); }, [fetchRisks]);

  // ── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!token) return;
    setGenerating(true);
    setGenerateResult(null);
    try {
      const res = await fetch("/api/operational-risk-register/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setGenerateResult(`✓ Generated ${json.count ?? 0} new risk(s).`);
        fetchRisks();
      } else {
        setGenerateResult(`Error: ${json.error ?? "Unknown"}`);
      }
    } catch {
      setGenerateResult("Network error.");
    }
    setGenerating(false);
  };

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!token || !createForm.risk_title.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/operational-risk-register", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          risk_title:            createForm.risk_title.trim(),
          risk_description:      createForm.risk_description || undefined,
          risk_category:         createForm.risk_category,
          likelihood:            createForm.likelihood,
          impact:                createForm.impact,
          root_cause:            createForm.root_cause || undefined,
          mitigation_plan:       createForm.mitigation_plan || undefined,
          owner_role:            createForm.owner_role || "admin",
          due_date:              createForm.due_date || undefined,
          job_reference:         createForm.job_reference || undefined,
          procurement_reference: createForm.procurement_reference || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowCreate(false);
        setCreateForm(DEFAULT_CREATE);
        fetchRisks();
      } else {
        setCreateError(json.error ?? "Unknown error");
      }
    } catch {
      setCreateError("Network error.");
    }
    setCreating(false);
  };

  // ── Risk actions ──────────────────────────────────────────────────────────

  const handleAction = async () => {
    if (!token || !actionModal) return;
    setActioning(true);
    setActionError(null);
    const { risk, action } = actionModal;
    const body: Record<string, unknown> = { action };
    if (action === "update_status") body.risk_status = actionStatus;
    if (action === "accept" || action === "resolve") body.resolution_note = actionNote;

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
        setActionModal(null);
        setActionNote("");
        setActionStatus("");
        fetchRisks();
      } else {
        setActionError(json.error ?? "Unknown error");
      }
    } catch {
      setActionError("Network error.");
    }
    setActioning(false);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────

  const totalCritical  = risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed"].includes(r.risk_status)).length;
  const totalOpen      = risks.filter(r => r.risk_status === "Open").length;
  const totalOverdue   = risks.filter(r => isRiskOverdue(r)).length;
  const totalMitActive = risks.filter(r => r.risk_status === "Mitigation Active").length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200 p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Operational Risk Register</h1>
          <p className="text-slate-500 text-sm mt-1">
            Internal risk tracking only · No legal opinions · No external database
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition text-sm font-medium disabled:opacity-50"
          >
            {generating ? "Generating…" : "⚡ Generate Risks Now"}
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); setCreateForm(DEFAULT_CREATE); }}
            className="px-4 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition text-sm font-medium"
          >
            + Create Risk
          </button>
        </div>
      </div>

      {/* Generate result */}
      {generateResult && (
        <div className={`rounded-lg border px-4 py-2 text-sm ${generateResult.startsWith("✓") ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          {generateResult}
        </div>
      )}

      {/* Compliance notice */}
      <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">
        {RISK_COMPLIANCE_WORDING.basis}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Critical Open", value: totalCritical, color: "text-red-400" },
          { label: "Open",          value: totalOpen,     color: "text-amber-400" },
          { label: "Overdue",       value: totalOverdue,  color: "text-orange-400" },
          { label: "Mitigating",    value: totalMitActive, color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-slate-500 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Category</label>
          <select
            value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">All Categories</option>
            {ALL_RISK_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Severity</label>
          <select
            value={filters.severity}
            onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">All Severities</option>
            {ALL_RISK_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Status</label>
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">All Statuses</option>
            {ALL_RISK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Owner</label>
          <select
            value={filters.ownerRole}
            onChange={e => setFilters(f => ({ ...f, ownerRole: e.target.value }))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">All Owners</option>
            <option value="admin">Admin</option>
            <option value="company">Company</option>
            <option value="supplier">Supplier</option>
            <option value="provider">Provider</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Job Reference</label>
          <input
            type="text"
            value={filters.jobRef}
            onChange={e => setFilters(f => ({ ...f, jobRef: e.target.value }))}
            placeholder="e.g. JOB-001"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 w-36"
          />
        </div>
        <button
          onClick={() => setFilters(DEFAULT_FILTERS)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition"
        >
          Clear
        </button>
      </div>

      {/* Risk list */}
      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading risks…</div>
      ) : risks.length === 0 ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-12 text-center text-slate-500">
          No risks found. Use &quot;Generate Risks Now&quot; to auto-detect from system data, or &quot;Create Risk&quot; to add manually.
        </div>
      ) : (
        <div className="space-y-2">
          {risks.map(risk => {
            const overdue      = isRiskOverdue(risk);
            const isExpanded   = expanded === risk.id;
            const openActions  = (risk.mitigation_actions ?? []).filter(a => ["Open","In Progress","Overdue"].includes(a.status)).length;
            const catIcon      = risk.risk_category ? (RISK_CATEGORY_ICON[risk.risk_category] ?? "📌") : "📌";

            return (
              <div
                key={risk.id}
                className={`rounded-xl border bg-slate-900/40 transition-all ${
                  risk.risk_severity === "Critical"
                    ? "border-red-500/40"
                    : overdue
                    ? "border-orange-500/30"
                    : "border-slate-700/40"
                }`}
              >
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : risk.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 flex-wrap"
                >
                  <span className="text-base">{catIcon}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${RISK_SEVERITY_BADGE[risk.risk_severity]}`}>
                    {RISK_SEVERITY_ICON[risk.risk_severity]} {risk.risk_severity}
                  </span>
                  <span className="font-medium text-slate-200 flex-1 text-sm">{risk.risk_title}</span>
                  <span className="text-xs text-slate-500">{risk.risk_reference}</span>
                  {overdue && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">Overdue</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${RISK_STATUS_BADGE[risk.risk_status]}`}>
                    {risk.risk_status}
                  </span>
                  {openActions > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400">
                      {openActions} action{openActions > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-slate-600 text-xs ml-auto">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-700/40 px-4 py-4 space-y-4">
                    {/* Meta row */}
                    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                      {risk.risk_category && <span>Category: <span className="text-slate-300">{risk.risk_category}</span></span>}
                      {risk.likelihood    && <span>Likelihood: <span className="text-slate-300">{risk.likelihood}</span></span>}
                      {risk.impact        && <span>Impact: <span className="text-slate-300">{risk.impact}</span></span>}
                      {risk.owner_role    && <span>Owner: <span className="text-slate-300">{risk.owner_role}</span></span>}
                      {risk.job_reference && (
                        <span>Job: <Link href={`/admin/jobs/${risk.job_reference}`} className="text-blue-400 hover:underline">{risk.job_reference}</Link></span>
                      )}
                      {risk.procurement_reference && <span>Procurement: <span className="text-slate-300">{risk.procurement_reference}</span></span>}
                      {risk.due_date && <span>Due: <span className={overdue ? "text-orange-400" : "text-slate-300"}>{risk.due_date}</span></span>}
                      {risk.source_type && <span>Source: <span className="text-slate-300">{risk.source_type}</span></span>}
                      <span>Created: <span className="text-slate-300">{new Date(risk.created_at).toLocaleDateString()}</span></span>
                    </div>

                    {/* Description */}
                    {risk.risk_description && (
                      <p className="text-sm text-slate-400">{risk.risk_description}</p>
                    )}

                    {/* Root cause / mitigation plan */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {risk.root_cause && (
                        <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-3">
                          <div className="text-xs text-slate-500 mb-1">Root Cause</div>
                          <div className="text-sm text-slate-300">{risk.root_cause}</div>
                        </div>
                      )}
                      {risk.mitigation_plan && (
                        <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-3">
                          <div className="text-xs text-slate-500 mb-1">Mitigation Plan</div>
                          <div className="text-sm text-slate-300">{risk.mitigation_plan}</div>
                        </div>
                      )}
                    </div>

                    {/* Resolution note */}
                    {risk.resolution_note && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="text-xs text-emerald-500 mb-1">Resolution Note</div>
                        <div className="text-sm text-emerald-300">{risk.resolution_note}</div>
                      </div>
                    )}

                    {/* Mitigation actions */}
                    {(risk.mitigation_actions ?? []).length > 0 && (
                      <div>
                        <div className="text-xs text-slate-500 mb-2">Mitigation Actions</div>
                        <div className="space-y-1.5">
                          {risk.mitigation_actions.map(a => (
                            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-700/30 bg-slate-800/30 px-3 py-2 text-sm">
                              <span className="text-slate-300 flex-1">{a.action_title}</span>
                              <span className="text-xs text-slate-500">{a.assigned_role}</span>
                              {a.due_at && <span className="text-xs text-slate-500">{new Date(a.due_at).toLocaleDateString()}</span>}
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                a.status === "Completed"   ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                                a.status === "In Progress" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                                a.status === "Overdue"     ? "bg-red-500/15 text-red-400 border-red-500/30" :
                                a.status === "Dismissed"   ? "bg-slate-700/40 text-slate-500 border-slate-600/40" :
                                "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              }`}>{a.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {!["Resolved","Closed","Accepted"].includes(risk.risk_status) && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/30">
                        <button
                          onClick={() => { setActionModal({ risk, action: "update_status" }); setActionStatus(risk.risk_status); setActionNote(""); setActionError(null); }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs transition"
                        >
                          Update Status
                        </button>
                        <button
                          onClick={() => { setActionModal({ risk, action: "accept" }); setActionNote(""); setActionError(null); }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs transition"
                        >
                          Accept Risk
                        </button>
                        <button
                          onClick={() => { setActionModal({ risk, action: "resolve" }); setActionNote(""); setActionError(null); }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-xs transition"
                        >
                          Mark Resolved
                        </button>
                        <button
                          onClick={() => { setActionModal({ risk, action: "close" }); setActionNote(""); setActionError(null); }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 hover:text-slate-300 text-xs transition"
                        >
                          Close
                        </button>
                      </div>
                    )}
                    {risk.risk_status === "Accepted" && (
                      <div className="flex gap-2 pt-2 border-t border-slate-700/30">
                        <button
                          onClick={() => { setActionModal({ risk, action: "close" }); setActionNote(""); setActionError(null); }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 hover:text-slate-300 text-xs transition"
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
        </div>
      )}

      {/* ── Create Risk Modal ─────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f1a] border border-slate-700/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Risk</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>

            <div className="text-xs text-slate-500 border border-slate-700/40 rounded-lg px-3 py-2">
              {RISK_COMPLIANCE_WORDING.basis}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs text-slate-500">Risk Title *</label>
                <input
                  type="text"
                  value={createForm.risk_title}
                  onChange={e => setCreateForm(f => ({ ...f, risk_title: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                  placeholder="Brief risk description…"
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  value={createForm.risk_description}
                  onChange={e => setCreateForm(f => ({ ...f, risk_description: e.target.value }))}
                  rows={2}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Category</label>
                <select
                  value={createForm.risk_category}
                  onChange={e => setCreateForm(f => ({ ...f, risk_category: e.target.value as RiskCategory }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                >
                  {ALL_RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Owner Role</label>
                <select
                  value={createForm.owner_role}
                  onChange={e => setCreateForm(f => ({ ...f, owner_role: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="admin">Admin</option>
                  <option value="company">Company</option>
                  <option value="supplier">Supplier</option>
                  <option value="provider">Provider</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Likelihood</label>
                <select
                  value={createForm.likelihood}
                  onChange={e => setCreateForm(f => ({ ...f, likelihood: e.target.value as RiskLikelihood }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Impact</label>
                <select
                  value={createForm.impact}
                  onChange={e => setCreateForm(f => ({ ...f, impact: e.target.value as RiskImpact }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Job Reference</label>
                <input
                  type="text"
                  value={createForm.job_reference}
                  onChange={e => setCreateForm(f => ({ ...f, job_reference: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                  placeholder="JOB-XXXX (optional)"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Due Date</label>
                <input
                  type="date"
                  value={createForm.due_date}
                  onChange={e => setCreateForm(f => ({ ...f, due_date: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs text-slate-500">Root Cause</label>
                <input
                  type="text"
                  value={createForm.root_cause}
                  onChange={e => setCreateForm(f => ({ ...f, root_cause: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                  placeholder="Known or suspected root cause…"
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs text-slate-500">Mitigation Plan</label>
                <textarea
                  value={createForm.mitigation_plan}
                  onChange={e => setCreateForm(f => ({ ...f, mitigation_plan: e.target.value }))}
                  rows={2}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Initial mitigation steps…"
                />
              </div>
            </div>

            {createError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-sm">{createError}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.risk_title.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition text-sm font-medium disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Risk"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Modal ──────────────────────────────────────────────────── */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f1a] border border-slate-700/50 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white capitalize">
                {actionModal.action === "update_status" ? "Update Status" :
                 actionModal.action === "accept"        ? "Accept Risk" :
                 actionModal.action === "resolve"       ? "Mark Resolved" :
                 "Close Risk"}
              </h2>
              <button onClick={() => setActionModal(null)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>

            <div className="text-sm text-slate-400">{actionModal.risk.risk_title}</div>

            {actionModal.action === "update_status" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">New Status</label>
                <select
                  value={actionStatus}
                  onChange={e => setActionStatus(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
                >
                  {ALL_RISK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {(actionModal.action === "accept" || actionModal.action === "resolve") && (
              <>
                <div className="text-xs text-slate-500 border border-slate-700/40 rounded-lg px-3 py-2">
                  {actionModal.action === "accept"
                    ? RISK_COMPLIANCE_WORDING.accepted
                    : "Resolving this risk creates a permanent audit record. Ensure mitigation actions are complete."}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Resolution Note * (min 5 characters)</label>
                  <textarea
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    rows={3}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none"
                    placeholder="Explain the decision…"
                  />
                </div>
              </>
            )}

            {actionModal.action === "close" && (
              <div className="text-xs text-slate-500">
                Closing this risk will archive it. It will remain in the audit record.
              </div>
            )}

            {actionError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-sm">{actionError}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAction}
                disabled={
                  actioning ||
                  (actionModal.action === "update_status" && !actionStatus) ||
                  ((actionModal.action === "accept" || actionModal.action === "resolve") && actionNote.trim().length < 5)
                }
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition disabled:opacity-50 ${
                  actionModal.action === "resolve"
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                    : actionModal.action === "close"
                    ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                    : "bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25"
                }`}
              >
                {actioning ? "Saving…" : "Confirm"}
              </button>
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
