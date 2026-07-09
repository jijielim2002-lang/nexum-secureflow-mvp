"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { AuthGuard } from "@/components/AuthGuard";

// ─── Types ────────────────────────────────────────────────────────────────────

type TestResult = "untested" | "pass" | "fail" | "skip";

interface TestItem {
  id:    string;
  label: string;
  hint?: string;  // brief "how to test" tooltip shown on hover
}

interface TestState {
  result:      TestResult;
  notes:       string;
  updatedAt:   string | null;
}

interface Category {
  id:      string;
  name:    string;
  icon:    string;
  accent:  string;   // Tailwind colour prefix used for badges
  tests:   TestItem[];
}

type ResultsMap = Record<string, TestState>;

// ─── QA Definition ────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id:     "auth",
    name:   "Auth & Role Access",
    icon:   "🔐",
    accent: "blue",
    tests:  [
      { id: "auth_admin_access",     label: "Admin can access /admin pages",                             hint: "Log in as admin, navigate to /admin — should load." },
      { id: "auth_provider_blocked", label: "Provider cannot access /admin pages",                       hint: "Log in as provider, try /admin — should redirect to /provider." },
      { id: "auth_customer_blocked", label: "Customer cannot access /admin or /provider pages",           hint: "Log in as customer, try /admin and /provider — should redirect." },
      { id: "auth_provider_jobs",    label: "Provider sees only their own company's jobs",                hint: "Log in as provider — job list should not contain jobs from other providers." },
      { id: "auth_customer_jobs",    label: "Customer sees only their own company's jobs",                hint: "Log in as customer — job list should not include jobs for other customers." },
    ],
  },
  {
    id:     "workflow",
    name:   "Job Workflow",
    icon:   "⚙",
    accent: "purple",
    tests:  [
      { id: "wf_job_create",         label: "Provider can create a secured job",                         hint: "Log in as provider → /provider/jobs/new — fill form, submit." },
      { id: "wf_invite_token",       label: "Invite token generated on job creation",                    hint: "Check secured_jobs row — invite_token should be non-null." },
      { id: "wf_customer_accept",    label: "Customer can view and accept invite",                       hint: "Open /invite/[job_ref]?token=... as customer — accept button works." },
      { id: "wf_deposit_upload",     label: "Customer can upload deposit / full payment proof",          hint: "On customer job page — upload a PDF; status changes to Proof Uploaded." },
      { id: "wf_deposit_verify",     label: "Admin can verify deposit proof",                            hint: "On admin job page — verify button updates status to Deposit Confirmed." },
      { id: "wf_milestone_update",   label: "Provider can update shipment / job milestones",             hint: "On provider job page — mark milestone complete; timeline updates." },
      { id: "wf_balance_upload",     label: "Customer can upload balance proof (split-payment job)",     hint: "Upload balance proof after deposit confirmed; status changes correctly." },
      { id: "wf_balance_verify",     label: "Admin can verify balance and close job",                    hint: "Verify balance proof → job status moves to Completed / Fully Paid." },
    ],
  },
  {
    id:     "documents",
    name:   "Document Intelligence",
    icon:   "📄",
    accent: "amber",
    tests:  [
      { id: "doc_upload",            label: "Document upload succeeds (Storage + DB row)",               hint: "Upload any PDF on a job — no error; file appears in document list." },
      { id: "doc_extraction_row",    label: "Extraction record created (status: Pending)",               hint: "After upload — check document_extractions table for matching row." },
      { id: "doc_ai_extraction",     label: "AI extraction runs or falls back gracefully",               hint: "Check extraction status changes from Pending; if no AI key, fallback used." },
      { id: "doc_verification",      label: "Admin can verify extracted fields",                         hint: "On admin job page extraction panel — approve/reject extracted data." },
      { id: "doc_ontology",          label: "Ontology update suggestion created on extraction",          hint: "Check ontology_update_suggestions table after extraction completes." },
    ],
  },
  {
    id:     "tracking",
    name:   "Shipment Tracking",
    icon:   "🚢",
    accent: "emerald",
    tests:  [
      { id: "track_bl_create",       label: "Shipment tracking record created (BL/AWB)",                hint: "On provider job page — create tracking with BL/AWB; row appears." },
      { id: "track_manual_update",   label: "Manual tracking update works",                              hint: "Update tracking status manually — timeline reflects change." },
      { id: "track_mock_sync",       label: "Mock connector sync works",                                 hint: "Trigger connector sync — events appear in shipment_events table." },
      { id: "track_delay_detect",    label: "Delay detection flags shipment as delayed",                 hint: "Set delay_days > 0 on tracking row — delay badge appears." },
      { id: "track_delay_exception", label: "Delay exception can be created from tracking panel",        hint: "From tracking view — create exception from delay flag; shows in exceptions list." },
    ],
  },
  {
    id:     "intelligence",
    name:   "Business Intelligence",
    icon:   "🧠",
    accent: "cyan",
    tests:  [
      { id: "intel_trade_profile",   label: "Trade intelligence profile exists or missing-state handled", hint: "Admin job page — trade intel card shows data or graceful empty state." },
      { id: "intel_biz_context",     label: "Business context exists or missing-state handled",          hint: "Job page — business context panel shows data or prompt to add." },
      { id: "intel_decision_brief",  label: "Decision brief renders without errors",                     hint: "Admin job page — Nexum Brain decision brief card loads." },
      { id: "intel_nexum_brain",     label: "Nexum Brain responds to questions",                        hint: "Ask a question in Brain panel — answer renders, confidence shown." },
      { id: "intel_company_recalc",  label: "Company intelligence recalculates on demand",               hint: "Admin companies page — recalculate button works; score updates." },
      { id: "intel_command_center",  label: "Command Center loads all 14+ sections",                    hint: "Navigate to /admin/command-center — all sections render, no console errors." },
    ],
  },
  {
    id:     "notif",
    name:   "Notifications & Tasks",
    icon:   "🔔",
    accent: "indigo",
    tests:  [
      { id: "notif_created",         label: "Notification created on workflow event",                    hint: "Verify deposit — check notifications table for new entry." },
      { id: "notif_tasks_created",   label: "Workflow task created on trigger",                         hint: "Upload payment proof — check workflow_tasks for auto-generated task." },
      { id: "notif_mark_read",       label: "Mark notification read / task completed works",            hint: "Click mark-read on notification bell; status changes to Read." },
      { id: "notif_comm_log",        label: "Communication log entry created after send",               hint: "Send email or WhatsApp via CommunicationLogCard — log row appears." },
    ],
  },
  {
    id:     "security",
    name:   "Security / RLS",
    icon:   "🛡",
    accent: "red",
    tests:  [
      { id: "sec_provider_isolation", label: "Provider cannot fetch another provider's jobs",            hint: "Query secured_jobs as provider — only own company_id rows returned." },
      { id: "sec_customer_isolation", label: "Customer cannot fetch another customer's jobs",            hint: "Query secured_jobs as customer — only own company_id rows returned." },
      { id: "sec_doc_isolation",      label: "Documents only visible to the job's company",              hint: "Provider A cannot see Provider B's documents. Test via Supabase or app." },
      { id: "sec_audit_isolation",    label: "Audit logs filtered to allowed company / admin",           hint: "Provider sees only audit logs for their own jobs; admin sees all." },
    ],
  },
];

const STORAGE_KEY = "nexum_qa_v1";

const RESULT_STYLE: Record<TestResult, string> = {
  untested: "border-slate-700 bg-slate-800/60 text-slate-500",
  pass:     "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  fail:     "border-red-500/40 bg-red-500/15 text-red-300",
  skip:     "border-slate-600 bg-slate-800/40 text-slate-600",
};

const RESULT_LABEL: Record<TestResult, string> = {
  untested: "—",
  pass:     "Pass",
  fail:     "Fail",
  skip:     "Skip",
};

const ACCENT_BADGE: Record<string, string> = {
  blue:    "border-blue-500/30 bg-blue-500/10 text-blue-400",
  purple:  "border-purple-500/30 bg-purple-500/10 text-purple-400",
  amber:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  cyan:    "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  indigo:  "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  red:     "border-red-500/30 bg-red-500/10 text-red-400",
};

// ─── Default state ─────────────────────────────────────────────────────────────

function makeDefaultResults(): ResultsMap {
  const map: ResultsMap = {};
  for (const cat of CATEGORIES) {
    for (const test of cat.tests) {
      map[test.id] = { result: "untested", notes: "", updatedAt: null };
    }
  }
  return map;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreFor(results: ResultsMap) {
  let total = 0, passed = 0, failed = 0, skipped = 0, untested = 0;
  for (const cat of CATEGORIES) {
    for (const test of cat.tests) {
      total++;
      const r = results[test.id]?.result ?? "untested";
      if (r === "pass")     passed++;
      else if (r === "fail") failed++;
      else if (r === "skip") skipped++;
      else untested++;
    }
  }
  const effective = total - skipped;
  const pct = effective > 0 ? Math.round((passed / effective) * 100) : 0;
  return { total, passed, failed, skipped, untested, pct };
}

function categoryScore(cat: Category, results: ResultsMap) {
  let passed = 0, failed = 0, skipped = 0;
  for (const t of cat.tests) {
    const r = results[t.id]?.result ?? "untested";
    if (r === "pass")     passed++;
    else if (r === "fail") failed++;
    else if (r === "skip") skipped++;
  }
  const total    = cat.tests.length;
  const effective = total - skipped;
  const pct = effective > 0 ? Math.round((passed / effective) * 100) : 0;
  return { total, passed, failed, skipped, pct };
}

function readinessColor(pct: number): string {
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 70) return "text-amber-400";
  return "text-red-400";
}

function readinessBg(pct: number): string {
  if (pct >= 90) return "border-emerald-500/20 bg-emerald-950/10";
  if (pct >= 70) return "border-amber-500/20 bg-amber-950/10";
  return "border-red-500/20 bg-red-950/10";
}

function readinessLabel(pct: number): string {
  if (pct >= 90) return "Pilot Ready ✓";
  if (pct >= 70) return "Nearly Ready";
  if (pct > 0)   return "Needs Work";
  return "Not Started";
}

function nowIso() { return new Date().toISOString(); }

// ─── Page ─────────────────────────────────────────────────────────────────────

function SystemTestsPage() {
  const [results,  setResults]  = useState<ResultsMap>(makeDefaultResults);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [runNote,  setRunNote]  = useState("");
  const [exported, setExported] = useState(false);

  // ── Persist to localStorage ──────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { results?: ResultsMap; runNote?: string };
        if (parsed.results) setResults(parsed.results);
        if (parsed.runNote) setRunNote(parsed.runNote);
      }
    } catch { /* ignore corrupt data */ }
    // Default: first category open
    setExpanded({ auth: true });
  }, []);

  const persist = useCallback((r: ResultsMap, note: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ results: r, runNote: note }));
    } catch { /* storage full — ignore */ }
  }, []);

  // ── Setters ───────────────────────────────────────────────────────────────

  function setResult(testId: string, result: TestResult) {
    setResults((prev) => {
      const next = {
        ...prev,
        [testId]: { ...prev[testId], result, updatedAt: nowIso() },
      };
      persist(next, runNote);
      return next;
    });
  }

  function setNotes(testId: string, notes: string) {
    setResults((prev) => {
      const next = {
        ...prev,
        [testId]: { ...prev[testId], notes, updatedAt: nowIso() },
      };
      persist(next, runNote);
      return next;
    });
  }

  function handleRunNote(v: string) {
    setRunNote(v);
    persist(results, v);
  }

  function resetAll() {
    if (!confirm("Reset all test results to untested? This cannot be undone.")) return;
    const fresh = makeDefaultResults();
    setResults(fresh);
    setRunNote("");
    localStorage.removeItem(STORAGE_KEY);
  }

  function toggleCategory(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ── Export ────────────────────────────────────────────────────────────────

  function exportJson() {
    const sc = scoreFor(results);
    const payload = {
      exported_at:             nowIso(),
      run_notes:               runNote,
      pilot_readiness_score:   sc.pct,
      pilot_readiness_label:   readinessLabel(sc.pct),
      summary: {
        total: sc.total, passed: sc.passed, failed: sc.failed,
        skipped: sc.skipped, untested: sc.untested,
      },
      categories: CATEGORIES.map((cat) => ({
        id:    cat.id,
        name:  cat.name,
        score: categoryScore(cat, results),
        tests: cat.tests.map((t) => ({
          id:         t.id,
          label:      t.label,
          result:     results[t.id]?.result ?? "untested",
          notes:      results[t.id]?.notes ?? "",
          updated_at: results[t.id]?.updatedAt ?? null,
        })),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `nexum_qa_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }

  // ── Score ─────────────────────────────────────────────────────────────────

  const sc = scoreFor(results);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"             className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/pilot-readiness" className="hover:text-slate-100 transition-colors">Readiness</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">

        {/* Title */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">🧪 System QA Test Suite</h1>
            <p className="mt-1 text-xs text-slate-500">
              Manual pilot readiness checklist — mark each test Pass, Fail, or Skip.
              Results are saved in your browser.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors"
            >
              ↺ Reset All
            </button>
            <button
              onClick={exportJson}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                exported
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25"
              }`}
            >
              {exported ? "✓ Exported" : "↓ Export JSON"}
            </button>
          </div>
        </div>

        {/* Pilot Readiness Score card */}
        <div className={`mb-6 rounded-2xl border px-6 py-5 ${readinessBg(sc.pct)}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Pilot Readiness Score
              </p>
              <p className={`text-4xl font-bold tabular-nums ${readinessColor(sc.pct)}`}>
                {sc.pct}%
              </p>
              <p className={`mt-1 text-sm font-semibold ${readinessColor(sc.pct)}`}>
                {readinessLabel(sc.pct)}
              </p>
            </div>

            {/* Score bar */}
            <div className="flex-1 mx-10">
              <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    sc.pct >= 90 ? "bg-emerald-500" :
                    sc.pct >= 70 ? "bg-amber-500"   : "bg-red-500"
                  }`}
                  style={{ width: `${sc.pct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-600">
                <span>0%</span>
                <span>70% — Nearly Ready</span>
                <span>90% — Pilot Ready</span>
              </div>
            </div>

            {/* Counts */}
            <div className="flex gap-4 text-center shrink-0">
              {[
                { label: "Pass",     count: sc.passed,   color: "text-emerald-400" },
                { label: "Fail",     count: sc.failed,   color: "text-red-400"     },
                { label: "Skip",     count: sc.skipped,  color: "text-slate-500"   },
                { label: "Untested", count: sc.untested, color: "text-slate-600"   },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <p className={`text-xl font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[10px] text-slate-600">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Run notes */}
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <label className="block text-xs font-semibold text-slate-500 mb-2">
            Run Notes <span className="font-normal text-slate-700">(tester name, date, environment, build version…)</span>
          </label>
          <textarea
            value={runNote}
            onChange={(e) => handleRunNote(e.target.value)}
            rows={2}
            placeholder="e.g. Tester: JJ · Date: 2026-05-19 · Env: staging · Build: v1.4.2"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 resize-none"
          />
        </div>

        {/* Category mini-nav */}
        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const cs = categoryScore(cat, results);
            return (
              <button
                key={cat.id}
                onClick={() => {
                  toggleCategory(cat.id);
                  document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-medium transition-colors ${
                  ACCENT_BADGE[cat.accent]
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="opacity-60">{cs.passed}/{cs.total - cs.skipped}</span>
              </button>
            );
          })}
        </div>

        {/* Category sections */}
        <div className="space-y-3">
          {CATEGORIES.map((cat) => {
            const cs   = categoryScore(cat, results);
            const open = expanded[cat.id] ?? false;

            return (
              <div
                key={cat.id}
                id={`cat-${cat.id}`}
                className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
              >
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="text-sm font-semibold text-slate-200">{cat.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ACCENT_BADGE[cat.accent]}`}>
                      {cs.passed}/{cat.tests.length - cs.skipped} passing
                    </span>
                    {cs.failed > 0 && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                        {cs.failed} failed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Mini progress */}
                    <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          cs.pct >= 90 ? "bg-emerald-500" :
                          cs.pct >= 70 ? "bg-amber-500"   : "bg-red-500/70"
                        }`}
                        style={{ width: `${cs.pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-600">{cs.pct}%</span>
                    <span className={`text-slate-600 text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </div>
                </button>

                {/* Test rows */}
                {open && (
                  <div className="divide-y divide-slate-800/60 border-t border-slate-800">
                    {cat.tests.map((test, i) => {
                      const state  = results[test.id] ?? { result: "untested", notes: "", updatedAt: null };
                      const result = state.result;

                      return (
                        <div
                          key={test.id}
                          className={`px-5 py-3.5 transition-colors ${
                            result === "fail" ? "bg-red-950/10" :
                            result === "pass" ? "bg-emerald-950/5" : ""
                          }`}
                        >
                          {/* Top row: index + label + buttons */}
                          <div className="flex items-start gap-3">
                            {/* Index */}
                            <span className="shrink-0 mt-0.5 w-5 text-center text-[10px] text-slate-700 font-mono">
                              {i + 1}
                            </span>

                            {/* Label + hint */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-300 leading-relaxed">
                                {test.label}
                              </p>
                              {test.hint && (
                                <p className="mt-0.5 text-[10px] text-slate-600 italic">
                                  → {test.hint}
                                </p>
                              )}
                            </div>

                            {/* Result badge + buttons */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Current result badge */}
                              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold min-w-[44px] text-center ${RESULT_STYLE[result]}`}>
                                {RESULT_LABEL[result]}
                              </span>

                              {/* Action buttons */}
                              {(["pass", "fail", "skip"] as TestResult[]).map((r) => (
                                <button
                                  key={r}
                                  onClick={() => setResult(test.id, result === r ? "untested" : r)}
                                  className={`rounded border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                                    result === r
                                      ? r === "pass" ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                                        : r === "fail" ? "border-red-500/50 bg-red-500/20 text-red-300"
                                        : "border-slate-600 bg-slate-700 text-slate-400"
                                      : "border-slate-700 bg-slate-800/60 text-slate-600 hover:text-slate-300"
                                  }`}
                                >
                                  {r === "pass" ? "✓" : r === "fail" ? "✕" : "⊘"}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Notes row (only show if result is set or notes exist) */}
                          {(result !== "untested" || state.notes) && (
                            <div className="mt-2 ml-8">
                              <input
                                type="text"
                                value={state.notes}
                                onChange={(e) => setNotes(test.id, e.target.value)}
                                placeholder="Add notes… (error message, screenshot reference, ticket #)"
                                className="w-full rounded border border-slate-700/60 bg-slate-800/40 px-2.5 py-1.5 text-[10px] text-slate-400 placeholder-slate-700 focus:outline-none focus:border-blue-500/40"
                              />
                            </div>
                          )}

                          {/* Timestamp */}
                          {state.updatedAt && (
                            <p className="mt-1 ml-8 text-[9px] text-slate-700">
                              Updated {new Date(state.updatedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {/* Category bulk actions */}
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-900/40">
                      <span className="text-[10px] text-slate-700">Mark all in section:</span>
                      {(["pass", "fail", "skip"] as TestResult[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setResults((prev) => {
                              const next = { ...prev };
                              for (const t of cat.tests) {
                                next[t.id] = { ...next[t.id], result: r, updatedAt: nowIso() };
                              }
                              persist(next, runNote);
                              return next;
                            });
                          }}
                          className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          {r === "pass" ? "✓ All Pass" : r === "fail" ? "✕ All Fail" : "⊘ All Skip"}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setResults((prev) => {
                            const next = { ...prev };
                            for (const t of cat.tests) {
                              next[t.id] = { result: "untested", notes: "", updatedAt: null };
                            }
                            persist(next, runNote);
                            return next;
                          });
                        }}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
                      >
                        ↺ Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer summary */}
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400">
                {sc.passed} of {sc.total - sc.skipped} effective tests passing
                {sc.skipped > 0 && ` · ${sc.skipped} skipped`}
                {sc.untested > 0 && ` · ${sc.untested} untested`}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                Results stored in browser localStorage · export JSON to share with team
              </p>
            </div>
            <button
              onClick={exportJson}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                exported
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25"
              }`}
            >
              {exported ? "✓ Exported!" : "↓ Export QA Report"}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}

export default function SystemTestsPageWrapper() {
  return (
    <AuthGuard requiredRole="admin">
      <SystemTestsPage />
    </AuthGuard>
  );
}
