"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id:       string;
  status:   string;
  required: boolean;
}

interface DryRun {
  id:                  string;
  dry_run_reference:   string;
  job_reference:       string | null;
  dry_run_status:      string;
  environment:         string;
  dry_run_type:        string;
  amount:              number | null;
  currency:            string;
  reviewed_at:         string | null;
  review_note:         string | null;
  created_at:          string;
  steps:               Step[];
}

type Settings = Record<string, string>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "Not Started": "bg-slate-700/50 text-slate-500 border-slate-600/30",
  "In Progress": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Passed:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Failed:        "bg-red-500/15 text-red-400 border-red-500/30",
  Blocked:       "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Waived:        "bg-slate-600/30 text-slate-400 border-slate-600/20",
};

const ENV_BADGE: Record<string, string> = {
  Staging:    "bg-amber-500/15 text-amber-400",
  Production: "bg-red-500/15 text-red-400 font-bold",
};

const TYPE_ICON: Record<string, string> = {
  "Internal Simulation":      "🔬",
  "Production No-Money Test": "🧪",
  "Live Pilot Rehearsal":     "🚀",
};

function stepProgress(steps: Step[]) {
  const req     = steps.filter((s) => s.required);
  const passed  = req.filter((s) => ["Passed","Waived","Not Applicable"].includes(s.status));
  const failed  = req.filter((s) => s.status === "Failed");
  const blocked = req.filter((s) => s.status === "Blocked");
  const waivers = steps.filter((s) => s.status === "Waived");
  return { total: req.length, passed: passed.length, failed: failed.length, blocked: blocked.length, waivers: waivers.length };
}

function recommendation(dr: DryRun): { label: string; color: string } {
  if (dr.dry_run_status === "Passed") return { label: "Ready for first live transaction", color: "text-emerald-400" };
  if (dr.dry_run_status === "Failed") return { label: "Block — fix failed steps first", color: "text-red-400" };
  if (dr.dry_run_status === "Blocked") return { label: "Blocked — review before proceeding", color: "text-orange-400" };
  if (dr.dry_run_status === "Waived") return { label: "Waived — proceed with documented risk", color: "text-slate-400" };
  const p = stepProgress(dr.steps);
  if (p.failed > 0) return { label: "Fix failed steps before proceeding", color: "text-red-400" };
  if (p.blocked > 0) return { label: "Resolve blocked steps", color: "text-orange-400" };
  const pct = p.total > 0 ? Math.round((p.passed / p.total) * 100) : 0;
  if (pct === 100) return { label: "All required steps done — ready to pass", color: "text-teal-400" };
  return { label: `${p.total - p.passed} required steps remaining`, color: "text-slate-400" };
}

// ─── Modals ───────────────────────────────────────────────────────────────────

interface CreateState {
  job_reference:       string;
  environment:         string;
  dry_run_type:        string;
  amount:              string;
}

interface ActionState {
  dry_run:     DryRun;
  action:      string;
  review_note: string;
}

interface ApproveState {
  action:        "approve" | "block";
  approval_note: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LivePilotDryRunListPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [dryRuns,     setDryRuns]     = useState<DryRun[]>([]);
  const [settings,    setSettings]    = useState<Settings>({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [creating,    setCreating]    = useState<CreateState | null>(null);
  const [action,      setAction]      = useState<ActionState | null>(null);
  const [approveState,setApproveState]= useState<ApproveState | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveErr,     setSaveErr]     = useState<string | null>(null);

  const firstLiveApproved = settings.first_live_transaction_approved === "true";

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch("/api/live-pilot-dry-run", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }
    setDryRuns(json.dry_runs ?? []);
    setSettings(json.settings ?? {});
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // ── Create dry run ──────────────────────────────────────────────────────────

  async function submitCreate() {
    if (!creating) return;
    setSaving(true); setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/live-pilot-dry-run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        job_reference: creating.job_reference || undefined,
        environment:   creating.environment,
        dry_run_type:  creating.dry_run_type,
        amount:        creating.amount ? Number(creating.amount) : undefined,
        currency:      "MYR",
      }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Failed"); setSaving(false); return; }
    await load();
    setCreating(null); setSaving(false);
  }

  // ── Dry run action ──────────────────────────────────────────────────────────

  async function submitAction() {
    if (!action) return;
    setSaving(true); setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/live-pilot-dry-run", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: action.dry_run.id, action: action.action, review_note: action.review_note || undefined }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveErr(
        json.code === "STEPS_PENDING"
          ? `${json.pending_count} required step(s) still pending. Complete them or add a review note to override.`
          : json.error ?? "Failed"
      );
      setSaving(false); return;
    }
    setDryRuns((prev) => prev.map((d) => d.id === json.dry_run.id ? { ...d, ...json.dry_run } : d));
    setAction(null); setSaving(false);
  }

  // ── Approve first live transaction ──────────────────────────────────────────

  async function submitApprove() {
    if (!approveState) return;
    setSaving(true); setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/live-pilot-dry-run", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action:        approveState.action === "approve" ? "approve_first_live_transaction" : "block_first_live_transaction",
        approval_note: approveState.approval_note,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveErr(
        json.code === "DRY_RUN_NOT_PASSED"     ? "No dry run with status Passed found." :
        json.code === "LIVE_GATES_NOT_ENABLED"  ? "Enable all three live mode gates in Deployment Settings first." :
        json.error ?? "Failed"
      );
      setSaving(false); return;
    }
    await load();
    setApproveState(null); setSaving(false);
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalPassed  = dryRuns.filter((d) => d.dry_run_status === "Passed").length;
  const totalFailed  = dryRuns.filter((d) => ["Failed","Blocked"].includes(d.dry_run_status)).length;
  const totalRunning = dryRuns.filter((d) => d.dry_run_status === "In Progress").length;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Live Pilot Dry Run</span>
            </div>
            <h1 className="text-2xl font-bold text-white">First Live Pilot Transaction Dry Run</h1>
            <p className="text-slate-400 text-sm mt-1">Phase 7 — Operational rehearsal before accepting actual customer payment</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setCreating({ job_reference: "", environment: "Staging", dry_run_type: "Production No-Money Test", amount: "" }); setSaveErr(null); }}
              className="px-4 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors">
              + New Dry Run
            </button>
            <button onClick={load} disabled={loading}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* First live transaction gate banner */}
        <div className={`rounded-2xl border p-5 space-y-3 ${firstLiveApproved ? "bg-emerald-950/30 border-emerald-500/30" : "bg-red-950/30 border-red-500/30"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">First Live Transaction Gate</p>
              {firstLiveApproved ? (
                <p className="text-xs text-emerald-400 mt-1">
                  Approved — first live customer transaction may proceed under pilot scope.
                  {settings.first_live_transaction_approved_at && (
                    <span className="text-slate-500 ml-2">Approved: {new Date(settings.first_live_transaction_approved_at).toLocaleDateString()}</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-red-300 mt-1">
                  First live transaction is not approved. Complete the dry run and pass all critical steps before accepting actual customer payment.
                </p>
              )}
              {settings.first_live_transaction_note && (
                <p className="text-xs text-slate-500 mt-1 italic">{settings.first_live_transaction_note}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {!firstLiveApproved ? (
                <button onClick={() => { setApproveState({ action: "approve", approval_note: "" }); setSaveErr(null); }}
                  className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
                  Approve First Live Tx
                </button>
              ) : (
                <button onClick={() => { setApproveState({ action: "block", approval_note: "" }); setSaveErr(null); }}
                  className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-lg">
                  Revoke Approval
                </button>
              )}
            </div>
          </div>
          {!firstLiveApproved && (
            <div className="text-xs text-amber-500/70 border-t border-amber-500/10 pt-3">
              ⚠ Actual customer funds may be involved. Before accepting real payment: confirm payment instructions, pilot terms, manual reconciliation SOP, and that the dry run has passed.
            </div>
          )}
        </div>

        {/* Pilot scope */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 text-xs text-blue-400 flex flex-wrap gap-x-6 gap-y-1">
          <span>Dry Run Scope:</span>
          <span>🇲🇾 Local Malaysia only</span>
          <span>RM MYR only</span>
          <span>📦 Logistics fee only</span>
          <span>🏦 Manual DuitNow / bank transfer</span>
          <span className="text-red-400/60">✕ No real funds movement in dry run</span>
          <span className="text-red-400/60">✕ No cargo/FX/financing</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total Dry Runs</p>
            <p className="text-2xl font-bold text-white">{dryRuns.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-emerald-500/20 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Passed</p>
            <p className="text-2xl font-bold text-emerald-400">{totalPassed}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${totalRunning > 0 ? "border-blue-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">In Progress</p>
            <p className={`text-2xl font-bold ${totalRunning > 0 ? "text-blue-400" : "text-slate-400"}`}>{totalRunning}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${totalFailed > 0 ? "border-red-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Failed / Blocked</p>
            <p className={`text-2xl font-bold ${totalFailed > 0 ? "text-red-400" : "text-slate-400"}`}>{totalFailed}</p>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}
        {loading && <div className="space-y-2">{[1,2].map((k) => <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl h-28 animate-pulse" />)}</div>}

        {!loading && dryRuns.length === 0 && !error && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-12 text-center space-y-3">
            <p className="text-slate-600">No dry runs yet.</p>
            <p className="text-xs text-slate-700">Create a dry run to rehearse the full transaction flow before accepting real customer payment.</p>
            <button onClick={() => { setCreating({ job_reference: "", environment: "Staging", dry_run_type: "Production No-Money Test", amount: "" }); setSaveErr(null); }}
              className="px-4 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors">
              + Create First Dry Run
            </button>
          </div>
        )}

        {/* Dry run cards */}
        <div className="space-y-3">
          {dryRuns.map((dr) => {
            const prog   = stepProgress(dr.steps);
            const pct    = prog.total > 0 ? Math.round((prog.passed / prog.total) * 100) : 0;
            const rec    = recommendation(dr);
            const canAct = !["Passed","Waived"].includes(dr.dry_run_status);

            return (
              <div key={dr.id} className={`bg-slate-800/60 border rounded-2xl p-5 ${dr.dry_run_status === "Passed" ? "border-emerald-500/20" : dr.dry_run_status === "Failed" ? "border-red-500/20" : "border-slate-700/60"}`}>
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0">{TYPE_ICON[dr.dry_run_type] ?? "🧪"}</span>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-semibold text-white">{dr.dry_run_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${STATUS_BADGE[dr.dry_run_status] ?? ""}`}>{dr.dry_run_status}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md ${ENV_BADGE[dr.environment] ?? "text-slate-400"}`}>{dr.environment}</span>
                      <span className="text-xs font-mono text-slate-600">{dr.dry_run_reference}</span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                      {dr.job_reference && (
                        <span>Job: <Link href={`/admin/jobs/${dr.job_reference}`} className="text-teal-400 hover:text-teal-300 font-mono">{dr.job_reference}</Link></span>
                      )}
                      {dr.amount && <span>Amount: <span className="text-white">MYR {dr.amount.toLocaleString()}</span></span>}
                      <span>{new Date(dr.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Step progress */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : prog.failed > 0 ? "bg-red-500" : "bg-teal-500"}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 shrink-0">{prog.passed}/{prog.total} steps</span>
                        {prog.failed  > 0 && <span className="text-xs text-red-400">{prog.failed}✗</span>}
                        {prog.blocked > 0 && <span className="text-xs text-orange-400">{prog.blocked}⛔</span>}
                        {prog.waivers > 0 && <span className="text-xs text-slate-500">{prog.waivers}~</span>}
                      </div>
                      <p className={`text-xs ${rec.color}`}>{rec.label}</p>
                    </div>

                    {dr.review_note && <p className="text-xs text-slate-500 italic">{dr.review_note}</p>}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Link href={`/admin/live-pilot-dry-run/${dr.dry_run_reference}`}
                      className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg text-center">
                      Open
                    </Link>
                    {dr.dry_run_status === "Not Started" && (
                      <button onClick={() => { setAction({ dry_run: dr, action: "start", review_note: "" }); setSaveErr(null); }}
                        className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs rounded-lg">
                        Start
                      </button>
                    )}
                    {canAct && dr.dry_run_status !== "Not Started" && (
                      <button onClick={() => { setAction({ dry_run: dr, action: "mark_passed", review_note: "" }); setSaveErr(null); }}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
                        Mark Passed
                      </button>
                    )}
                    {canAct && (
                      <button onClick={() => { setAction({ dry_run: dr, action: "mark_failed", review_note: "" }); setSaveErr(null); }}
                        className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-lg">
                        Mark Failed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">← Admin</Link>
          <div className="flex gap-4">
            <Link href="/admin/go-live-readiness"   className="text-sm text-slate-500 hover:text-slate-300">Go-Live Readiness</Link>
            <Link href="/admin/deployment-cutover"  className="text-sm text-slate-500 hover:text-slate-300">Deployment</Link>
          </div>
        </div>
      </div>

      {/* ── Create modal ──────────────────────────────────────────────────────── */}
      {creating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <h3 className="font-semibold text-white">New Dry Run</h3>
              <button onClick={() => setCreating(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Dry Run Type</label>
                <select value={creating.dry_run_type} onChange={(e) => setCreating((s) => s ? { ...s, dry_run_type: e.target.value } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                  <option value="Internal Simulation">Internal Simulation — no real accounts involved</option>
                  <option value="Production No-Money Test">Production No-Money Test — real accounts, dummy payment</option>
                  <option value="Live Pilot Rehearsal">Live Pilot Rehearsal — real accounts, real verified flow, no funds</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Environment</label>
                <select value={creating.environment} onChange={(e) => setCreating((s) => s ? { ...s, environment: e.target.value } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                  <option value="Staging">Staging</option>
                  <option value="Production">Production</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Job Reference <span className="text-slate-600">(optional)</span></label>
                <input type="text" value={creating.job_reference}
                  onChange={(e) => setCreating((s) => s ? { ...s, job_reference: e.target.value } : s)}
                  placeholder="NSF-000001"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Logistics Fee Amount MYR <span className="text-slate-600">(optional)</span></label>
                <input type="number" value={creating.amount}
                  onChange={(e) => setCreating((s) => s ? { ...s, amount: e.target.value } : s)}
                  placeholder="0.00"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              <p className="text-xs text-slate-600">{(77).toString()} standard steps will be auto-seeded across 11 categories (A–K).</p>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitCreate} disabled={saving}
                className="px-5 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors disabled:opacity-40">
                {saving ? "Creating…" : "Create Dry Run"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action modal ──────────────────────────────────────────────────────── */}
      {action && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white capitalize">{action.action.replace(/_/g," ")}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{action.dry_run.dry_run_reference}</p>
              </div>
              <button onClick={() => setAction(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {action.action === "mark_passed" && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400">
                  All required steps must be Passed or Waived. Add a review note to override pending steps.
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Review Note</label>
                <textarea value={action.review_note}
                  onChange={(e) => setAction((s) => s ? { ...s, review_note: e.target.value } : s)}
                  placeholder="Enter reason, findings, or override note…" rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setAction(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${action.action === "mark_failed" ? "bg-red-600/80 hover:bg-red-600" : "bg-teal-600/80 hover:bg-teal-600"}`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve first live transaction modal ──────────────────────────────── */}
      {approveState && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className={`border rounded-2xl w-full max-w-md shadow-2xl ${approveState.action === "approve" ? "bg-emerald-950 border-emerald-500/40" : "bg-red-950 border-red-500/40"}`}>
            <div className={`px-6 py-4 border-b ${approveState.action === "approve" ? "border-emerald-500/20" : "border-red-500/20"}`}>
              <h3 className={`font-bold ${approveState.action === "approve" ? "text-emerald-300" : "text-red-300"}`}>
                {approveState.action === "approve" ? "✓ Approve First Live Transaction" : "⛔ Revoke First Live Transaction Approval"}
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className={`text-sm ${approveState.action === "approve" ? "text-emerald-200/80" : "text-red-200/80"}`}>
                {approveState.action === "approve"
                  ? "This formally approves the first live customer transaction. Requires: dry run Passed + all live gates enabled. Record management sign-off name and date in the note."
                  : "This revokes the first live transaction approval. All live payment/release/customer gates will still be enforced per their individual settings."}
              </p>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">
                  {approveState.action === "approve" ? "Management Approval Note (name, date, sign-off) *" : "Reason for revocation"}
                </label>
                <textarea value={approveState.approval_note}
                  onChange={(e) => setApproveState((s) => s ? { ...s, approval_note: e.target.value } : s)}
                  placeholder={approveState.action === "approve" ? "e.g. Approved by [Name], [Date]. Dry run passed. First pilot job: NSF-000001." : "Reason…"} rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${approveState.action === "approve" ? "border-emerald-500/20" : "border-red-500/20"}`}>
              <button onClick={() => setApproveState(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitApprove} disabled={saving || (approveState.action === "approve" && !approveState.approval_note.trim())}
                className={`px-5 py-2 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-40 ${approveState.action === "approve" ? "bg-emerald-700/80 hover:bg-emerald-700" : "bg-red-700/80 hover:bg-red-700"}`}>
                {saving ? "Saving…" : approveState.action === "approve" ? "I Confirm — Approve" : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
