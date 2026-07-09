"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemSummary { id: string; status: string; required: boolean }

interface Checklist {
  id:                  string;
  checklist_reference: string;
  checklist_type:      string;
  company_id:          string | null;
  company_name:        string | null;
  job_reference:       string | null;
  status:              string;
  risk_level:          string;
  review_note:         string | null;
  reviewed_at:         string | null;
  created_at:          string;
  item_counts:         ItemSummary[];
}

type ChecklistType =
  | "Provider Onboarding"
  | "Customer Onboarding"
  | "Live Job Approval"
  | "Payment Readiness"
  | "Release Readiness"
  | "Exception Review";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Pending:     "bg-slate-700/50 text-slate-400 border-slate-600/40",
  "In Review": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Approved:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Rejected:    "bg-red-500/15 text-red-400 border-red-500/30",
  "On Hold":   "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Waived:      "bg-slate-600/30 text-slate-400 border-slate-600/20",
};

const RISK_BADGE: Record<string, string> = {
  Low:      "text-emerald-400 text-xs",
  Medium:   "text-amber-400 text-xs",
  High:     "text-orange-400 text-xs font-medium",
  Critical: "text-red-400 text-xs font-bold",
};

const TYPE_ICON: Record<string, string> = {
  "Provider Onboarding": "🏭",
  "Customer Onboarding": "🏢",
  "Live Job Approval":   "✅",
  "Payment Readiness":   "💳",
  "Release Readiness":   "🔓",
  "Exception Review":    "⚠️",
};

function itemProgress(items: ItemSummary[]) {
  const required = items.filter((i) => i.required);
  const done     = required.filter((i) => ["Passed","Waived","Not Applicable"].includes(i.status));
  const failed   = required.filter((i) => i.status === "Failed");
  const pending  = required.filter((i) => i.status === "Pending");
  return { total: required.length, done: done.length, failed: failed.length, pending: pending.length };
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const CHECKLIST_TYPES: ChecklistType[] = [
  "Provider Onboarding","Customer Onboarding","Live Job Approval",
  "Payment Readiness","Release Readiness","Exception Review",
];

// ─── Create checklist modal ───────────────────────────────────────────────────

interface CreateState {
  checklist_type: ChecklistType;
  company_name:   string;
  job_reference:  string;
  risk_level:     string;
}

// ─── Checklist action modal ───────────────────────────────────────────────────

interface ActionState {
  checklist:   Checklist;
  action:      string;
  review_note: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PilotOnboardingPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [checklists,   setChecklists]   = useState<Checklist[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [creating,     setCreating]     = useState<CreateState | null>(null);
  const [actionState,  setActionState]  = useState<ActionState | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saveErr,      setSaveErr]      = useState<string | null>(null);

  // Filters
  const [filterType,   setFilterType]   = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [search,       setSearch]       = useState("");

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch("/api/pilot-onboarding", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }
    setChecklists(json.checklists ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // ── Create checklist ────────────────────────────────────────────────────────

  async function submitCreate() {
    if (!creating) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/pilot-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        checklist_type: creating.checklist_type,
        company_name:   creating.company_name || undefined,
        job_reference:  creating.job_reference || undefined,
        risk_level:     creating.risk_level,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Failed to create"); setSaving(false); return; }
    await load();
    setCreating(null);
    setSaving(false);
  }

  // ── Checklist action ────────────────────────────────────────────────────────

  async function submitAction() {
    if (!actionState) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/pilot-onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id:          actionState.checklist.id,
        action:      actionState.action,
        review_note: actionState.review_note || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Action failed"); setSaving(false); return; }
    setChecklists((prev) => prev.map((c) => c.id === json.checklist.id ? { ...c, ...json.checklist } : c));
    setActionState(null);
    setSaving(false);
  }

  // ── Filtered ────────────────────────────────────────────────────────────────

  const filtered = checklists.filter((c) => {
    if (filterType   !== "All" && c.checklist_type !== filterType)   return false;
    if (filterStatus !== "All" && c.status         !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(c.company_name ?? "").toLowerCase().includes(q) &&
          !(c.job_reference ?? "").toLowerCase().includes(q) &&
          !c.checklist_reference.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalApproved = checklists.filter((c) => c.status === "Approved").length;
  const totalPending  = checklists.filter((c) => ["Pending","In Review"].includes(c.status)).length;
  const totalFailed   = checklists.filter((c) => c.status === "Rejected").length;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Pilot Onboarding</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Pilot Onboarding & Live Job Approval</h1>
            <p className="text-slate-400 text-sm mt-1">
              MYR · Logistics fee only · Local Malaysia · No bank API · Manual payment verification
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCreating({ checklist_type: "Provider Onboarding", company_name: "", job_reference: "", risk_level: "Medium" })}
              className="px-4 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors"
            >
              + New Checklist
            </button>
            <button onClick={load} disabled={loading}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total Checklists</p>
            <p className="text-2xl font-bold text-white">{checklists.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-emerald-500/20 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Approved</p>
            <p className="text-2xl font-bold text-emerald-400">{totalApproved}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${totalPending > 0 ? "border-amber-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Pending / In Review</p>
            <p className={`text-2xl font-bold ${totalPending > 0 ? "text-amber-400" : "text-slate-400"}`}>{totalPending}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${totalFailed > 0 ? "border-red-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Rejected</p>
            <p className={`text-2xl font-bold ${totalFailed > 0 ? "text-red-400" : "text-slate-400"}`}>{totalFailed}</p>
          </div>
        </div>

        {/* Pilot scope reminder */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 text-xs text-blue-400 flex flex-wrap gap-x-6 gap-y-1">
          <span>Phase 1 Pilot Scope:</span>
          <span>🇲🇾 Local Malaysia</span>
          <span>RM MYR only</span>
          <span>📦 Logistics fee only</span>
          <span>🏦 Manual bank transfer / DuitNow</span>
          <span className="text-red-400/70">✕ No cargo/supplier payment</span>
          <span className="text-red-400/70">✕ No FX settlement</span>
          <span className="text-red-400/70">✕ No financing disbursement</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="Search reference, company, job…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 w-64 focus:outline-none focus:border-teal-500/40" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
            <option value="All">All Types</option>
            {CHECKLIST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
            <option value="All">All Statuses</option>
            {["Pending","In Review","Approved","Rejected","On Hold","Waived"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}
        {loading && <div className="space-y-2">{[1,2,3].map((k) => <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-xl h-20 animate-pulse" />)}</div>}

        {/* Checklist cards */}
        {!loading && !error && (
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-10 text-center text-slate-600">
                No checklists found. Create the first one with "+ New Checklist".
              </div>
            )}
            {filtered.map((cl) => {
              const prog  = itemProgress(cl.item_counts ?? []);
              const pct   = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
              const canAct = ["Pending","In Review","On Hold"].includes(cl.status);

              return (
                <div key={cl.id} className={`bg-slate-800/60 border rounded-2xl p-5 ${cl.status === "Rejected" ? "border-red-500/20" : "border-slate-700/60"}`}>
                  <div className="flex items-start gap-4">
                    <span className="text-2xl shrink-0 mt-0.5">{TYPE_ICON[cl.checklist_type] ?? "📋"}</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-sm font-semibold text-white">{cl.checklist_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${STATUS_BADGE[cl.status] ?? ""}`}>{cl.status}</span>
                        <span className={RISK_BADGE[cl.risk_level] ?? "text-xs text-slate-400"}>{cl.risk_level} Risk</span>
                        <span className="text-xs font-mono text-slate-600">{cl.checklist_reference}</span>
                      </div>

                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        {cl.company_name && <span>Company: <span className="text-slate-300">{cl.company_name}</span></span>}
                        {cl.job_reference && (
                          <span>Job: <Link href={`/admin/jobs/${cl.job_reference}`} className="text-teal-400 hover:text-teal-300 font-mono">{cl.job_reference}</Link></span>
                        )}
                        <span>Created {timeAgo(cl.created_at)}</span>
                        {cl.reviewed_at && <span>Reviewed {timeAgo(cl.reviewed_at)}</span>}
                      </div>

                      {/* Progress bar */}
                      {prog.total > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="text-emerald-400">{prog.done}/{prog.total} required items</span>
                            {prog.failed > 0 && <span className="text-red-400">{prog.failed} failed</span>}
                            {prog.pending > 0 && <span className="text-amber-400">{prog.pending} pending</span>}
                          </div>
                          <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : prog.failed > 0 ? "bg-red-500" : "bg-teal-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {cl.review_note && (
                        <p className="text-xs text-slate-500 italic">Note: {cl.review_note}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {cl.job_reference ? (
                        <Link href={`/admin/jobs/${cl.job_reference}/pilot-checklist`}
                          className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg text-center">
                          Details
                        </Link>
                      ) : (
                        <Link href={`/admin/pilot-onboarding/${cl.id}`}
                          className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg text-center">
                          Details
                        </Link>
                      )}
                      {canAct && (
                        <>
                          <button onClick={() => { setActionState({ checklist: cl, action: "approve", review_note: "" }); setSaveErr(null); }}
                            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
                            Approve
                          </button>
                          <button onClick={() => { setActionState({ checklist: cl, action: "reject", review_note: "" }); setSaveErr(null); }}
                            className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-lg">
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">← Admin</Link>
          <Link href="/admin/go-live-readiness" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Go-Live Readiness</Link>
        </div>

      </div>

      {/* ── Create modal ──────────────────────────────────────────────────────── */}
      {creating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <h3 className="font-semibold text-white">Create Checklist</h3>
              <button onClick={() => setCreating(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Checklist Type <span className="text-red-400">*</span></label>
                <select value={creating.checklist_type}
                  onChange={(e) => setCreating((s) => s ? { ...s, checklist_type: e.target.value as ChecklistType } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                  {CHECKLIST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Company Name</label>
                <input type="text" value={creating.company_name}
                  onChange={(e) => setCreating((s) => s ? { ...s, company_name: e.target.value } : s)}
                  placeholder="e.g. ABC Logistics Sdn Bhd"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Job Reference <span className="text-slate-600">(for job-level checklists)</span></label>
                <input type="text" value={creating.job_reference}
                  onChange={(e) => setCreating((s) => s ? { ...s, job_reference: e.target.value } : s)}
                  placeholder="e.g. NSF-000001"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Risk Level</label>
                <select value={creating.risk_level}
                  onChange={(e) => setCreating((s) => s ? { ...s, risk_level: e.target.value } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                  {["Low","Medium","High","Critical"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitCreate} disabled={saving}
                className="px-5 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors disabled:opacity-40">
                {saving ? "Creating…" : "Create Checklist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action modal ──────────────────────────────────────────────────────── */}
      {actionState && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white capitalize">{actionState.action.replace(/_/g," ")} Checklist</h3>
                <p className="text-xs text-slate-500 mt-0.5">{actionState.checklist.checklist_reference}</p>
              </div>
              <button onClick={() => setActionState(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {actionState.action === "approve" && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400">
                  Approving requires all required items to be Passed or Waived. If items are still pending, this will be rejected.
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Review Note</label>
                <textarea value={actionState.review_note}
                  onChange={(e) => setActionState((s) => s ? { ...s, review_note: e.target.value } : s)}
                  placeholder="Enter reason or note…" rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setActionState(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${actionState.action === "reject" ? "bg-red-600/80 hover:bg-red-600" : "bg-teal-600/80 hover:bg-teal-600"}`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
