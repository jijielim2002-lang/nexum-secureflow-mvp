"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id:              string;
  step_number:     number;
  step_category:   string;
  step_name:       string;
  expected_result: string | null;
  actual_result:   string | null;
  status:          string;
  required:        boolean;
  evidence_note:   string | null;
  evidence_url:    string | null;
  checked_at:      string | null;
}

interface DryRun {
  id:                string;
  dry_run_reference: string;
  job_reference:     string | null;
  dry_run_status:    string;
  environment:       string;
  dry_run_type:      string;
  amount:            number | null;
  currency:          string;
  reviewed_at:       string | null;
  review_note:       string | null;
  created_at:        string;
  steps:             Step[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "Not Started": "bg-slate-700/50 text-slate-500 border-slate-600/30",
  "In Progress": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Passed:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Failed:        "bg-red-500/15 text-red-400 border-red-500/30",
  Blocked:       "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Waived:        "bg-slate-600/30 text-slate-400 border-slate-600/20",
};

const STEP_STATUS_COLOR: Record<string, string> = {
  Pending:          "text-slate-500",
  Passed:           "text-emerald-400",
  Failed:           "text-red-400",
  Blocked:          "text-orange-400",
  Waived:           "text-sky-400",
  "Not Applicable": "text-slate-600",
};

const STEP_STATUS_BG: Record<string, string> = {
  Pending:          "",
  Passed:           "bg-emerald-500/5 border-l-2 border-emerald-500/20",
  Failed:           "bg-red-500/5 border-l-2 border-red-500/30",
  Blocked:          "bg-orange-500/5 border-l-2 border-orange-500/20",
  Waived:           "bg-sky-500/5 border-l-2 border-sky-500/20",
  "Not Applicable": "opacity-50",
};

function stepIcon(status: string): string {
  return status === "Passed"         ? "✓" :
         status === "Failed"         ? "✗" :
         status === "Blocked"        ? "⛔" :
         status === "Waived"         ? "~" :
         status === "Not Applicable" ? "—" : "○";
}

function progress(steps: Step[]) {
  const req    = steps.filter((s) => s.required);
  const passed = req.filter((s) => ["Passed","Waived","Not Applicable"].includes(s.status));
  const failed  = req.filter((s) => s.status === "Failed");
  const blocked = req.filter((s) => s.status === "Blocked");
  return { total: req.length, passed: passed.length, failed: failed.length, blocked: blocked.length };
}

// ─── Step action state ────────────────────────────────────────────────────────

interface StepAction {
  step:          Step;
  action:        "pass" | "fail" | "block" | "waive" | "reset" | "not_applicable";
  actual_result: string;
  evidence_note: string;
  evidence_url:  string;
}

interface DryRunAction {
  action:      string;
  review_note: string;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(dr: DryRun) {
  const rows = ["Step #,Category,Step Name,Required,Status,Expected Result,Actual Result,Evidence Note"];
  for (const s of dr.steps) {
    rows.push([
      s.step_number,
      s.step_category,
      `"${s.step_name.replace(/"/g, '""')}"`,
      s.required ? "Yes" : "No",
      s.status,
      `"${(s.expected_result ?? "").replace(/"/g, '""')}"`,
      `"${(s.actual_result  ?? "").replace(/"/g, '""')}"`,
      `"${(s.evidence_note  ?? "").replace(/"/g, '""')}"`,
    ].join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = `${dr.dry_run_reference}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DryRunDetailPage() {
  const { dry_run_reference } = useParams<{ dry_run_reference: string }>();
  const { profile }           = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [dryRun,    setDryRun]    = useState<DryRun | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({});
  const [stepAct,   setStepAct]   = useState<StepAction | null>(null);
  const [drAct,     setDrAct]     = useState<DryRunAction | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || !dry_run_reference) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch(`/api/live-pilot-dry-run?dry_run_reference=${encodeURIComponent(dry_run_reference)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }
    const dr: DryRun = (json.dry_runs ?? [])[0] ?? null;
    setDryRun(dr);
    if (dr) {
      // Auto-expand all categories
      const cats = [...new Set(dr.steps.map((s) => s.step_category))];
      const exp: Record<string, boolean> = {};
      for (const c of cats) exp[c] = true;
      setExpanded(exp);
    }
    setLoading(false);
  }, [profile, dry_run_reference]);

  useEffect(() => { load(); }, [load]);

  // ── Step action ─────────────────────────────────────────────────────────────

  async function submitStepAction() {
    if (!stepAct || !dryRun) return;
    setSaving(true); setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/live-pilot-dry-run/steps", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id:            stepAct.step.id,
        action:        stepAct.action,
        actual_result: stepAct.actual_result || undefined,
        evidence_note: stepAct.evidence_note || undefined,
        evidence_url:  stepAct.evidence_url  || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Failed"); setSaving(false); return; }
    setDryRun((dr) => dr ? { ...dr, steps: dr.steps.map((s) => s.id === json.step.id ? { ...s, ...json.step } : s) } : dr);
    setStepAct(null); setSaving(false);
  }

  // ── Dry run action ──────────────────────────────────────────────────────────

  async function submitDrAction() {
    if (!drAct || !dryRun) return;
    setSaving(true); setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/live-pilot-dry-run", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: dryRun.id, action: drAct.action, review_note: drAct.review_note || undefined }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveErr(
        json.code === "STEPS_PENDING"
          ? `${json.pending_count} required step(s) still pending. Pass/waive first or add a review note.`
          : json.error ?? "Failed"
      );
      setSaving(false); return;
    }
    setDryRun((dr) => dr ? { ...dr, ...json.dry_run } : dr);
    setDrAct(null); setSaving(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex items-center justify-center">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-red-400">{error}</div>
      </div>
    );
  }
  if (!dryRun) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex items-center justify-center">
        <p className="text-slate-600">Dry run not found: {dry_run_reference}</p>
      </div>
    );
  }

  const prog      = progress(dryRun.steps);
  const pct       = prog.total > 0 ? Math.round((prog.passed / prog.total) * 100) : 0;
  const categories = [...new Set(dryRun.steps.map((s) => s.step_category))];
  const canAct    = !["Passed","Waived"].includes(dryRun.dry_run_status);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs text-slate-500 flex-wrap">
            <Link href="/admin" className="hover:text-slate-300">Admin</Link>
            <span>/</span>
            <Link href="/admin/live-pilot-dry-run" className="hover:text-slate-300">Live Pilot Dry Run</Link>
            <span>/</span>
            <span className="text-slate-300 font-mono">{dry_run_reference}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{dryRun.dry_run_type}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_BADGE[dryRun.dry_run_status] ?? ""}`}>{dryRun.dry_run_status}</span>
                <span className={`text-xs px-2 py-0.5 rounded-md ${dryRun.environment === "Production" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>{dryRun.environment}</span>
                {dryRun.job_reference && (
                  <Link href={`/admin/jobs/${dryRun.job_reference}`} className="text-xs font-mono text-teal-400 hover:text-teal-300">{dryRun.job_reference}</Link>
                )}
                {dryRun.amount && <span className="text-xs text-white font-medium">MYR {dryRun.amount.toLocaleString()}</span>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => exportCSV(dryRun)}
                className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg">
                CSV
              </button>
              {dryRun.dry_run_status === "Not Started" && (
                <button onClick={() => { setDrAct({ action: "start", review_note: "" }); setSaveErr(null); }}
                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs rounded-lg">
                  Start
                </button>
              )}
              {canAct && dryRun.dry_run_status !== "Not Started" && (
                <button onClick={() => { setDrAct({ action: "mark_passed", review_note: "" }); setSaveErr(null); }}
                  className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
                  Mark Passed
                </button>
              )}
              {canAct && (
                <button onClick={() => { setDrAct({ action: "mark_failed", review_note: "" }); setSaveErr(null); }}
                  className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-lg">
                  Mark Failed
                </button>
              )}
              {["Passed","Failed","Blocked"].includes(dryRun.dry_run_status) && (
                <button onClick={() => { setDrAct({ action: "reset", review_note: "" }); setSaveErr(null); }}
                  className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-400 text-xs rounded-lg">
                  Reopen
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Overall progress */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Overall Progress</span>
            <span className="text-xs text-slate-500">{prog.passed}/{prog.total} required steps</span>
          </div>
          <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : prog.failed > 0 ? "bg-red-500" : "bg-teal-500"}`}
              style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-400">{prog.passed} passed</span>
            {prog.failed  > 0 && <span className="text-red-400">{prog.failed} failed</span>}
            {prog.blocked > 0 && <span className="text-orange-400">{prog.blocked} blocked</span>}
            <span className="text-slate-500">{prog.total - prog.passed - prog.failed - prog.blocked} remaining</span>
          </div>
          {dryRun.review_note && <p className="text-xs text-slate-500 italic border-t border-slate-700/40 pt-3">{dryRun.review_note}</p>}
        </div>

        {/* Pilot scope */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5 text-xs text-blue-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>MYR only</span>
          <span>Logistics fee only</span>
          <span>Manual DuitNow / bank transfer</span>
          <span className="text-red-400/60">✕ No real funds in dry-run</span>
          <span className="text-red-400/60">✕ No cargo / FX / financing</span>
        </div>

        {/* Steps grouped by category */}
        <div className="space-y-3">
          {categories.map((cat) => {
            const catSteps   = dryRun.steps.filter((s) => s.step_category === cat).sort((a, b) => a.step_number - b.step_number);
            const catProg    = { passed: catSteps.filter((s) => ["Passed","Waived","Not Applicable"].includes(s.status)).length, total: catSteps.filter((s) => s.required).length };
            const catFailed  = catSteps.some((s) => s.status === "Failed");
            const catBlocked = catSteps.some((s) => s.status === "Blocked");
            const isExp      = expanded[cat] ?? false;

            return (
              <div key={cat} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
                {/* Category header */}
                <div className="px-5 py-3 flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpanded((e) => ({ ...e, [cat]: !isExp }))}>
                  <button className="text-slate-500 text-sm shrink-0 select-none">{isExp ? "▼" : "▶"}</button>
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">{cat}</span>
                    {catFailed  && <span className="text-xs text-red-400">✗ has failures</span>}
                    {catBlocked && <span className="text-xs text-orange-400">⛔ blocked</span>}
                  </div>
                  <span className="text-xs text-slate-500">{catProg.passed}/{catProg.total}</span>
                </div>

                {/* Steps */}
                {isExp && (
                  <div className="border-t border-slate-700/40 divide-y divide-slate-700/20">
                    {catSteps.map((step) => (
                      <div key={step.id} className={`px-5 py-3 flex items-start gap-3 ${STEP_STATUS_BG[step.status] ?? ""}`}>
                        <span className="text-xs text-slate-600 shrink-0 w-6 text-right">{step.step_number}.</span>
                        <span className={`text-sm font-medium shrink-0 ${STEP_STATUS_COLOR[step.status] ?? ""}`}>{stepIcon(step.status)}</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm ${step.required ? "text-white" : "text-slate-400"}`}>{step.step_name}</span>
                            {!step.required && <span className="text-xs text-slate-600">optional</span>}
                          </div>
                          {step.expected_result && (
                            <p className="text-xs text-slate-500">Expected: {step.expected_result}</p>
                          )}
                          {step.actual_result && (
                            <p className="text-xs text-teal-400/80">Actual: {step.actual_result}</p>
                          )}
                          {step.evidence_note && (
                            <p className="text-xs text-sky-400/80 italic">Evidence: {step.evidence_note}</p>
                          )}
                          {step.evidence_url && (
                            <a href={step.evidence_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-teal-400 hover:text-teal-300">View evidence ↗</a>
                          )}
                          {step.checked_at && (
                            <p className="text-xs text-slate-700">{new Date(step.checked_at).toLocaleDateString()}</p>
                          )}
                        </div>
                        {/* Step action buttons */}
                        <div className="flex gap-1 shrink-0 flex-wrap">
                          {step.status !== "Passed" && (
                            <button onClick={() => { setStepAct({ step, action: "pass", actual_result: "", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                              className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-md">
                              Pass
                            </button>
                          )}
                          {step.status !== "Failed" && (
                            <button onClick={() => { setStepAct({ step, action: "fail", actual_result: "", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                              className="px-2 py-1 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-md">
                              Fail
                            </button>
                          )}
                          {step.status !== "Waived" && (
                            <button onClick={() => { setStepAct({ step, action: "waive", actual_result: "", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                              className="px-2 py-1 bg-sky-600/10 hover:bg-sky-600/20 border border-sky-500/20 text-sky-400 text-xs rounded-md">
                              Waive
                            </button>
                          )}
                          {step.status !== "Blocked" && (
                            <button onClick={() => { setStepAct({ step, action: "block", actual_result: "", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                              className="px-2 py-1 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/20 text-orange-400 text-xs rounded-md">
                              Block
                            </button>
                          )}
                          {step.status !== "Pending" && (
                            <button onClick={() => { setStepAct({ step, action: "reset", actual_result: "", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                              className="px-2 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-400 text-xs rounded-md">
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin/live-pilot-dry-run" className="text-sm text-teal-400 hover:text-teal-300">← All Dry Runs</Link>
          {dryRun.job_reference && (
            <Link href={`/admin/jobs/${dryRun.job_reference}/pilot-checklist`} className="text-sm text-slate-500 hover:text-slate-300">
              Job Pilot Checklist →
            </Link>
          )}
        </div>
      </div>

      {/* ── Step action modal ─────────────────────────────────────────────────── */}
      {stepAct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white capitalize">{stepAct.action.replace(/_/g," ")} Step</h3>
                <p className="text-xs text-slate-500 mt-0.5">Step {stepAct.step.step_number}: {stepAct.step.step_name}</p>
              </div>
              <button onClick={() => setStepAct(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {stepAct.action === "waive" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
                  Waiving a required step means accepting the risk. Document your reason.
                </div>
              )}
              {stepAct.action === "fail" && stepAct.step.expected_result && (
                <div className="bg-slate-800/60 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Expected: {stepAct.step.expected_result}</p>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Actual Result <span className="text-slate-600">(what you observed)</span></label>
                <textarea value={stepAct.actual_result}
                  onChange={(e) => setStepAct((s) => s ? { ...s, actual_result: e.target.value } : s)}
                  placeholder="What happened when you tested this step…" rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Evidence Note</label>
                <textarea value={stepAct.evidence_note}
                  onChange={(e) => setStepAct((s) => s ? { ...s, evidence_note: e.target.value } : s)}
                  placeholder="Screenshot description, test result, waiver reason…" rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Evidence URL <span className="text-slate-600">(optional)</span></label>
                <input type="text" value={stepAct.evidence_url}
                  onChange={(e) => setStepAct((s) => s ? { ...s, evidence_url: e.target.value } : s)}
                  placeholder="https://…"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setStepAct(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitStepAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${
                  stepAct.action === "fail"  ? "bg-red-600/80 hover:bg-red-600" :
                  stepAct.action === "waive" ? "bg-sky-600/80 hover:bg-sky-600" :
                  stepAct.action === "block" ? "bg-orange-600/80 hover:bg-orange-600" :
                  "bg-teal-600/80 hover:bg-teal-600"
                }`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dry run action modal ──────────────────────────────────────────────── */}
      {drAct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <h3 className="font-semibold text-white capitalize">{drAct.action.replace(/_/g," ")}</h3>
              <button onClick={() => setDrAct(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {drAct.action === "mark_passed" && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400">
                  All required steps should be Passed or Waived. Add a review note to override.
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Review Note</label>
                <textarea value={drAct.review_note}
                  onChange={(e) => setDrAct((s) => s ? { ...s, review_note: e.target.value } : s)}
                  placeholder="Findings, sign-off, or reason…" rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setDrAct(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitDrAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${drAct.action === "mark_failed" ? "bg-red-600/80 hover:bg-red-600" : "bg-teal-600/80 hover:bg-teal-600"}`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
