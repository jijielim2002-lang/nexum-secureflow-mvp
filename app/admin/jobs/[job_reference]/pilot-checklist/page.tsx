"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Item {
  id:             string;
  item_category:  string;
  item_name:      string;
  item_description: string | null;
  required:       boolean;
  status:         string;
  evidence_note:  string | null;
  evidence_url:   string | null;
  checked_by:     string | null;
  checked_at:     string | null;
}

interface Checklist {
  id:                  string;
  checklist_reference: string;
  checklist_type:      string;
  status:              string;
  risk_level:          string;
  review_note:         string | null;
  reviewed_at:         string | null;
  created_at:          string;
  items:               Item[];
}

interface Job {
  job_reference: string;
  pilot_status:  string;
  company_name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JOB_CHECKLIST_TYPES = [
  "Live Job Approval",
  "Payment Readiness",
  "Release Readiness",
  "Exception Review",
];

const STATUS_COLOR: Record<string, string> = {
  Pending:         "text-slate-400",
  Passed:          "text-emerald-400",
  Failed:          "text-red-400",
  Waived:          "text-sky-400",
  "Not Applicable": "text-slate-500",
};

const STATUS_BG: Record<string, string> = {
  Pending:         "bg-slate-700/40 border-slate-600/30",
  Passed:          "bg-emerald-500/10 border-emerald-500/20",
  Failed:          "bg-red-500/10 border-red-500/20",
  Waived:          "bg-sky-500/10 border-sky-500/20",
  "Not Applicable": "bg-slate-800/40 border-slate-700/20",
};

const CHECKLIST_STATUS_BADGE: Record<string, string> = {
  Pending:     "bg-slate-700/50 text-slate-400 border-slate-600/40",
  "In Review": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Approved:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Rejected:    "bg-red-500/15 text-red-400 border-red-500/30",
  "On Hold":   "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Waived:      "bg-slate-600/30 text-slate-400 border-slate-600/20",
};

const PILOT_STATUS_BADGE: Record<string, string> = {
  "Internal Test":       "bg-slate-700/50 text-slate-400",
  "Pilot Review":        "bg-amber-500/15 text-amber-400",
  "Live Pilot Approved": "bg-emerald-500/15 text-emerald-400",
  "Live Pilot Rejected": "bg-red-500/15 text-red-400",
  "Live Pilot Completed":"bg-teal-500/15 text-teal-400",
  "On Hold":             "bg-orange-500/15 text-orange-400",
};

// ─── Item action modal ────────────────────────────────────────────────────────

interface ItemAction {
  item:           Item;
  action:         "pass" | "fail" | "waive" | "reset" | "not_applicable";
  evidence_note:  string;
  evidence_url:   string;
}

// ─── Checklist action modal ───────────────────────────────────────────────────

interface ChecklistAction {
  checklist:   Checklist;
  action:      string;
  review_note: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobPilotChecklistPage() {
  const { job_reference } = useParams<{ job_reference: string }>();
  const { profile }       = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [checklists,   setChecklists]   = useState<Checklist[]>([]);
  const [job,          setJob]          = useState<Job | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});
  const [itemAction,   setItemAction]   = useState<ItemAction | null>(null);
  const [clAction,     setClAction]     = useState<ChecklistAction | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saveErr,      setSaveErr]      = useState<string | null>(null);
  const [creating,     setCreating]     = useState<string | null>(null); // checklist_type

  const load = useCallback(async () => {
    if (!profile || !job_reference) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch(`/api/pilot-onboarding?job_reference=${encodeURIComponent(job_reference)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }
    setChecklists(json.checklists ?? []);
    setJob(json.job ?? null);
    setLoading(false);
    // Auto-expand all by default
    const exp: Record<string, boolean> = {};
    for (const cl of json.checklists ?? []) exp[cl.id] = true;
    setExpanded(exp);
  }, [profile, job_reference]);

  useEffect(() => { load(); }, [load]);

  // ── Create checklist ────────────────────────────────────────────────────────

  async function submitCreate(type: string) {
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/pilot-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ checklist_type: type, job_reference }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Failed to create"); setSaving(false); return; }
    setCreating(null);
    await load();
    setSaving(false);
  }

  // ── Item action ─────────────────────────────────────────────────────────────

  async function submitItemAction() {
    if (!itemAction) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/pilot-onboarding/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id:            itemAction.item.id,
        action:        itemAction.action,
        evidence_note: itemAction.evidence_note || undefined,
        evidence_url:  itemAction.evidence_url  || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Action failed"); setSaving(false); return; }
    // Patch local state
    setChecklists((prev) => prev.map((cl) => ({
      ...cl,
      items: cl.items.map((it) => it.id === json.item.id ? json.item : it),
    })));
    setItemAction(null);
    setSaving(false);
  }

  // ── Checklist action ────────────────────────────────────────────────────────

  async function submitClAction() {
    if (!clAction) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/pilot-onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id:          clAction.checklist.id,
        action:      clAction.action,
        review_note: clAction.review_note || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveErr(
        json.code === "ITEMS_PENDING"
          ? `${json.pending_count} required item(s) still pending. Pass or waive them first, or add a review note to override.`
          : json.error ?? "Action failed"
      );
      setSaving(false);
      return;
    }
    setChecklists((prev) => prev.map((cl) => cl.id === json.checklist.id ? { ...cl, ...json.checklist } : cl));
    if (json.job) setJob((j) => j ? { ...j, ...json.job } : j);
    setClAction(null);
    setSaving(false);
  }

  // ── Progress helpers ─────────────────────────────────────────────────────────

  function progress(items: Item[]) {
    const req = items.filter((i) => i.required);
    const ok  = req.filter((i) => ["Passed","Waived","Not Applicable"].includes(i.status));
    return { total: req.length, done: ok.length };
  }

  // ── Missing types ────────────────────────────────────────────────────────────

  const existingTypes = checklists.map((c) => c.checklist_type);
  const missingTypes  = JOB_CHECKLIST_TYPES.filter((t) => !existingTypes.includes(t));

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap text-xs text-slate-500">
            <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
            <span>/</span>
            <Link href={`/admin/jobs/${job_reference}`} className="hover:text-slate-300 transition-colors font-mono">{job_reference}</Link>
            <span>/</span>
            <span className="text-slate-300">Pilot Checklist</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Pilot Checklist</h1>
              <p className="text-slate-400 text-sm mt-1">Job: <span className="font-mono text-teal-400">{job_reference}</span></p>
            </div>
            {job && (
              <div className="text-right">
                <p className="text-xs text-slate-500 mb-1">Pilot Status</p>
                <span className={`text-xs px-3 py-1.5 rounded-lg font-medium ${PILOT_STATUS_BADGE[job.pilot_status] ?? "bg-slate-700 text-slate-400"}`}>
                  {job.pilot_status}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Pilot scope warning */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 text-xs text-blue-400 space-y-1">
          <p className="font-semibold text-blue-300">Phase 1 Pilot Scope — this job must comply:</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>🇲🇾 Local Malaysia only</span>
            <span>RM MYR only</span>
            <span>📦 Logistics fee only</span>
            <span>🏦 Manual bank transfer / DuitNow</span>
            <span className="text-red-400/70">✕ No cargo payment</span>
            <span className="text-red-400/70">✕ No FX settlement</span>
            <span className="text-red-400/70">✕ No financing disbursement</span>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}

        {/* Create missing checklists */}
        {!loading && missingTypes.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4 space-y-2">
            <p className="text-xs font-semibold text-amber-400">Missing checklists for this job:</p>
            <div className="flex flex-wrap gap-2">
              {missingTypes.map((t) => (
                <button key={t}
                  onClick={() => { setCreating(t); setSaveErr(null); }}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs rounded-lg transition-colors">
                  + Create {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && <div className="space-y-3">{[1,2,3].map((k) => <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl h-28 animate-pulse" />)}</div>}

        {/* Checklists */}
        {!loading && checklists.length === 0 && !error && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-10 text-center text-slate-600">
            No checklists yet. Create one above.
          </div>
        )}

        {checklists.map((cl) => {
          const prog  = progress(cl.items);
          const pct   = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
          const isExp = expanded[cl.id] ?? false;
          const byCategory = cl.items.reduce<Record<string, Item[]>>((acc, it) => {
            const cat = it.item_category || "General";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(it);
            return acc;
          }, {});

          return (
            <div key={cl.id} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
              {/* Checklist header */}
              <div className="px-5 py-4 flex items-start gap-3 cursor-pointer"
                onClick={() => setExpanded((e) => ({ ...e, [cl.id]: !isExp }))}>
                <button className="text-slate-500 text-lg mt-0.5 shrink-0 select-none">{isExp ? "▼" : "▶"}</button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-semibold text-white">{cl.checklist_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-md border ${CHECKLIST_STATUS_BADGE[cl.status] ?? ""}`}>{cl.status}</span>
                    <span className="text-xs font-mono text-slate-600">{cl.checklist_reference}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-teal-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{prog.done}/{prog.total} required</span>
                  </div>
                  {cl.review_note && <p className="text-xs text-slate-500 mt-1 italic">{cl.review_note}</p>}
                </div>
                {/* Checklist actions */}
                <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {["Pending","In Review","On Hold"].includes(cl.status) && (
                    <>
                      <button onClick={() => { setClAction({ checklist: cl, action: "approve", review_note: "" }); setSaveErr(null); }}
                        className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
                        Approve
                      </button>
                      <button onClick={() => { setClAction({ checklist: cl, action: "reject", review_note: "" }); setSaveErr(null); }}
                        className="px-2.5 py-1 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-lg">
                        Reject
                      </button>
                    </>
                  )}
                  {cl.status === "Approved" && cl.checklist_type === "Live Job Approval" && (
                    <button onClick={() => { setClAction({ checklist: cl, action: "approve_job_for_pilot", review_note: "" }); setSaveErr(null); }}
                      disabled={job?.pilot_status === "Live Pilot Approved"}
                      className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 text-teal-400 text-xs rounded-lg disabled:opacity-40">
                      {job?.pilot_status === "Live Pilot Approved" ? "Pilot Active" : "Approve for Pilot"}
                    </button>
                  )}
                  {job?.pilot_status === "Live Pilot Approved" && cl.checklist_type === "Release Readiness" && cl.status === "Approved" && (
                    <button onClick={() => { setClAction({ checklist: cl, action: "complete_pilot_job", review_note: "" }); setSaveErr(null); }}
                      className="px-2.5 py-1 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-400 text-xs rounded-lg">
                      Mark Complete
                    </button>
                  )}
                </div>
              </div>

              {/* Items */}
              {isExp && (
                <div className="border-t border-slate-700/40 divide-y divide-slate-700/30">
                  {Object.entries(byCategory).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="px-5 py-2 bg-slate-900/30">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{cat}</span>
                      </div>
                      {items.map((item) => (
                        <div key={item.id} className={`px-5 py-3 flex items-start gap-3 border-b last:border-b-0 ${STATUS_BG[item.status] ?? ""}`}>
                          <span className={`text-xs font-medium shrink-0 mt-0.5 ${STATUS_COLOR[item.status] ?? "text-slate-400"}`}>
                            {item.status === "Passed"          ? "✓" :
                             item.status === "Failed"          ? "✗" :
                             item.status === "Waived"          ? "~" :
                             item.status === "Not Applicable"  ? "—" : "○"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm ${item.required ? "text-white" : "text-slate-400"}`}>{item.item_name}</span>
                              {!item.required && <span className="text-xs text-slate-600">optional</span>}
                            </div>
                            {item.item_description && <p className="text-xs text-slate-500 mt-0.5">{item.item_description}</p>}
                            {item.evidence_note && (
                              <p className="text-xs text-sky-400/80 mt-1 italic">Evidence: {item.evidence_note}</p>
                            )}
                            {item.evidence_url && (
                              <a href={item.evidence_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-teal-400 hover:text-teal-300 mt-0.5 block">
                                View evidence ↗
                              </a>
                            )}
                          </div>
                          {/* Item actions */}
                          <div className="flex gap-1 shrink-0">
                            {item.status !== "Passed" && (
                              <button onClick={() => { setItemAction({ item, action: "pass", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-md">
                                Pass
                              </button>
                            )}
                            {item.status !== "Failed" && (
                              <button onClick={() => { setItemAction({ item, action: "fail", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                className="px-2 py-1 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-md">
                                Fail
                              </button>
                            )}
                            {item.status !== "Waived" && (
                              <button onClick={() => { setItemAction({ item, action: "waive", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                className="px-2 py-1 bg-sky-600/10 hover:bg-sky-600/20 border border-sky-500/20 text-sky-400 text-xs rounded-md">
                                Waive
                              </button>
                            )}
                            {item.status !== "Pending" && (
                              <button onClick={() => { setItemAction({ item, action: "reset", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                className="px-2 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-400 text-xs rounded-md">
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href={`/admin/jobs/${job_reference}`} className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            ← Job Timeline
          </Link>
          <Link href="/admin/pilot-onboarding" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            All Checklists
          </Link>
        </div>
      </div>

      {/* ── Create checklist modal ────────────────────────────────────────────── */}
      {creating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <h3 className="font-semibold text-white">Create: {creating}</h3>
              <button onClick={() => setCreating(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-slate-400">
                This will create a <span className="text-white font-medium">{creating}</span> checklist for job{" "}
                <span className="font-mono text-teal-400">{job_reference}</span> and auto-populate all default items.
              </p>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={() => submitCreate(creating)} disabled={saving}
                className="px-5 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors disabled:opacity-40">
                {saving ? "Creating…" : "Create Checklist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item action modal ─────────────────────────────────────────────────── */}
      {itemAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white capitalize">{itemAction.action.replace(/_/g," ")} Item</h3>
                <p className="text-xs text-slate-500 mt-0.5">{itemAction.item.item_name}</p>
              </div>
              <button onClick={() => setItemAction(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {itemAction.action === "waive" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
                  Waiving a required item means you accept the risk. Document the reason below.
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Evidence Note</label>
                <textarea value={itemAction.evidence_note}
                  onChange={(e) => setItemAction((s) => s ? { ...s, evidence_note: e.target.value } : s)}
                  placeholder="Describe what was checked or why it was waived…" rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Evidence URL <span className="text-slate-600">(optional)</span></label>
                <input type="text" value={itemAction.evidence_url}
                  onChange={(e) => setItemAction((s) => s ? { ...s, evidence_url: e.target.value } : s)}
                  placeholder="https://…"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setItemAction(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitItemAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${
                  itemAction.action === "fail" ? "bg-red-600/80 hover:bg-red-600" :
                  itemAction.action === "waive" ? "bg-sky-600/80 hover:bg-sky-600" :
                  "bg-teal-600/80 hover:bg-teal-600"
                }`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checklist action modal ────────────────────────────────────────────── */}
      {clAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white capitalize">{clAction.action.replace(/_/g," ")}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{clAction.checklist.checklist_type}</p>
              </div>
              <button onClick={() => setClAction(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {clAction.action === "approve_job_for_pilot" && (
                <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 text-xs text-teal-400">
                  This will set the job&apos;s pilot_status to <strong>Live Pilot Approved</strong>. Confirm the job scope is within Phase 1 pilot boundaries before proceeding.
                </div>
              )}
              {clAction.action === "approve" && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400">
                  All required items must be Passed or Waived. If items are pending, this will be blocked. Provide a review note to manually override.
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Review Note</label>
                <textarea value={clAction.review_note}
                  onChange={(e) => setClAction((s) => s ? { ...s, review_note: e.target.value } : s)}
                  placeholder="Enter reason, approval note, or override justification…" rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setClAction(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitClAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${
                  clAction.action === "reject" ? "bg-red-600/80 hover:bg-red-600" :
                  ["approve_job_for_pilot","complete_pilot_job"].includes(clAction.action) ? "bg-teal-600/80 hover:bg-teal-600" :
                  "bg-emerald-600/80 hover:bg-emerald-600"
                }`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
