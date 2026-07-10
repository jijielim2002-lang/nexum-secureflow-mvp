"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PilotStatus {
  appEnv:               "local" | "staging" | "production";
  appUrl:               string | null;
  supabaseUrl:          boolean;
  supabaseUrlHost:      string | null;
  supabaseAnonKey:      boolean;
  serviceRoleKey:       boolean;
  storageBucket:        string | null;
  emailProvider:        string | null;
  openAiConfigured:     boolean;
  trackingApiConfigured: boolean;
  deploymentNote:       string | null;
  generatedAt:          string;
}

interface HealthResult {
  label:  string;
  ok:     boolean | null; // null = loading
  detail: string;
}

type ReadinessScore = "Ready" | "Almost Ready" | "Needs Fixes" | "Not Ready";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECKLIST_ITEMS: { id: string; label: string; critical: boolean; hint: string }[] = [
  {
    id: "disclaimer_visible",
    label: "Pilot disclaimer visible in all key pages",
    critical: true,
    hint: "Amber banners must appear on financing offers, credit packs, capital readiness, and command center.",
  },
  {
    id: "no_real_payment",
    label: "Real payment gateway not enabled",
    critical: true,
    hint: "No Stripe, FPX, DuitNow, or bank API key is active. All payment proof is manual upload only.",
  },
  {
    id: "no_legal_escrow",
    label: "Escrow not represented as legal escrow",
    critical: true,
    hint: "All payment UI shows 'simulated' or 'verification only'. No Nexum escrow account exists.",
  },
  {
    id: "email_status_shown",
    label: "Email simulated / real status shown to admin",
    critical: false,
    hint: "Command center or environment status shows whether email is live (Resend/SendGrid) or simulated.",
  },
  {
    id: "ai_status_shown",
    label: "AI extraction simulated / real status shown",
    critical: false,
    hint: "Document intelligence shows confidence scores and 'extraction simulated' label when no OpenAI key.",
  },
  {
    id: "tracking_labelled",
    label: "Tracking data source clearly labelled (Mock / Live)",
    critical: false,
    hint: "Shipment tracking cards show the data_source field — 'mock', 'carrier_api', 'manual', etc.",
  },
  {
    id: "rls_reviewed",
    label: "RLS policies reviewed for pilot scope",
    critical: true,
    hint: "Row-Level Security rules restrict each role to only their own data. Run Supabase RLS test before go-live.",
  },
  {
    id: "test_users_created",
    label: "Test pilot users created (provider + customer + partner)",
    critical: true,
    hint: "At least one account for each role exists and can complete a full job lifecycle.",
  },
  {
    id: "demo_data_available",
    label: "Demo data seeded (jobs, companies, obligations)",
    critical: true,
    hint: "Enough sample jobs and companies exist to demonstrate all platform flows in a live session.",
  },
  {
    id: "demo_reset_available",
    label: "Demo reset tool tested and functional",
    critical: false,
    hint: "The clear actions below work correctly and can restore a clean demo state before each session.",
  },
  {
    id: "qa_tests_passed",
    label: "QA system tests passed",
    critical: true,
    hint: "All checks on /admin/system-tests return green before onboarding pilot users.",
  },
];

const HEALTH_TARGETS: { key: string; label: string; table: string }[] = [
  { key: "profiles",           label: "Profiles table",          table: "profiles" },
  { key: "companies",          label: "Companies table",         table: "companies" },
  { key: "secured_jobs",       label: "Secured jobs",            table: "secured_jobs" },
  { key: "job_documents",      label: "Job documents",           table: "job_documents" },
  { key: "notifications",      label: "Notifications",           table: "notifications" },
  { key: "workflow_tasks",     label: "Workflow tasks",          table: "workflow_tasks" },
  { key: "shipment_trackings", label: "Shipment trackings",      table: "shipment_trackings" },
  { key: "payment_obligations",label: "Payment obligations",     table: "payment_obligations" },
];

const CLEAR_ACTIONS: { key: string; label: string; color: string; icon: string }[] = [
  { key: "notifications",      label: "Notifications",       color: "amber",  icon: "🔔" },
  { key: "workflow_tasks",     label: "Workflow Tasks",       color: "blue",   icon: "📋" },
  { key: "communication_logs", label: "Communication Logs",   color: "purple", icon: "📨" },
  { key: "tracking_sync_logs", label: "Tracking Sync Logs",   color: "slate",  icon: "🔄" },
  { key: "audit_logs",         label: "Audit Logs",           color: "red",    icon: "📜" },
];

const COLOR_MAP: Record<string, string> = {
  amber:  "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  blue:   "border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20",
  slate:  "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700",
  red:    "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
};

const KNOWN_LIMITATIONS = [
  { icon: "💳", area: "No real fund holding",           detail: "Nexum does not hold customer funds. All payment proof is manual upload only. Actual transfers occur outside the platform via normal bank transfer." },
  { icon: "🏦", area: "No legal escrow service",        detail: "No licensed escrow account exists. Holding funds requires an MSB licence. This MVP provides a verification and audit trail layer only." },
  { icon: "💸", area: "No live payment gateway",        detail: "No FPX, DuitNow, Stripe, or SWIFT integration. Payment is confirmed by admin manually reviewing uploaded receipts." },
  { icon: "🚢", area: "No real carrier API (unless configured)", detail: "Shipment tracking is mock unless a TRACKING_API_KEY is configured. Always show the data_source label to users." },
  { icon: "🤖", area: "AI extraction requires human verification", detail: "Document extraction confidence scores do not replace human review. Admin must validate before using extracted data for credit decisions." },
  { icon: "📄", area: "Credit packs are decision-support only",  detail: "No credit pack constitutes a loan approval, credit offer, disbursement commitment, or guarantee. Lenders must conduct their own assessment." },
  { icon: "🏦", area: "Financing offers are simulated only",     detail: "All simulated financing amounts and terms are internal assessments. No offer has been made by any licensed lender." },
  { icon: "📝", area: "Audit logs are not legal records",        detail: "Operational records only. Not certified by a legal authority, not cryptographically signed, and have not been validated as legally admissible evidence." },
];

const USER_GUIDE_FLOWS: { role: string; color: string; steps: string[] }[] = [
  {
    role: "Service Provider",
    color: "blue",
    steps: [
      "Sign in → Provider dashboard",
      "Create job: enter customer name, service type, route, value, currency, and terms",
      "Job enters 'Awaiting Customer Acceptance' — share the job reference with the customer",
      "Once customer accepts, confirm deposit received → mark 'Ready for Execution'",
      "Mark Pickup Completed → mark Delivered → submit POD",
      "Once admin verifies balance payment, job closes automatically",
    ],
  },
  {
    role: "Customer",
    color: "emerald",
    steps: [
      "Sign in → Customer dashboard",
      "View jobs assigned to your company — accept the job formally",
      "Upload deposit payment proof after bank transfer",
      "Track shipment status and milestone updates",
      "Upload balance payment proof on delivery",
      "Job closes when admin verifies final payment",
    ],
  },
  {
    role: "Admin (Nexum)",
    color: "purple",
    steps: [
      "Sign in → Admin dashboard → Command Center for full platform view",
      "Monitor all jobs, payment status, exceptions, and pending verifications",
      "Verify payment proofs and advance milestones",
      "Run Capital Readiness assessments and generate simulated financing offers",
      "Generate credit packs for lender decision support",
      "Share opportunities with capital partners via the Partner Portal",
    ],
  },
  {
    role: "Capital Partner",
    color: "amber",
    steps: [
      "Sign in → Capital Portal → Opportunities dashboard",
      "View financing opportunities shared by Nexum Admin",
      "Review full credit pack: company intel, trade evidence, document evidence, risk summary",
      "Indicate interest, request more info, or decline each opportunity",
      "All decisions are for assessment purposes only — no binding commitment",
    ],
  },
];

const SIMULATED_ITEMS = [
  "Financing offers — internal simulations, not lender commitments",
  "Email notifications — shown as 'Simulated' unless a real provider is configured",
  "AI document extraction — confidence scores shown; human verification required",
  "Shipment tracking — mock data unless live carrier API is configured",
  "Capital readiness scores — internal scoring model, not credit bureau data",
  "Credit pack amounts — based on internal records only, not a loan offer",
];

const DO_NOT_ASSUME = [
  "That any payment proof on Nexum constitutes final settlement — it's an upload trigger for human review",
  "That Nexum holds funds in escrow — it does not",
  "That any credit pack or financing offer has been approved by a lender",
  "That shipment data is live unless the tracking panel shows a non-mock source",
  "That the audit log is legally admissible without separate legal validation",
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PilotReadinessPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PilotReadinessInner />
    </AuthGuard>
  );
}

function PilotReadinessInner() {
  const [pilotStatus,     setPilotStatus]     = useState<PilotStatus | null>(null);
  const [statusLoading,   setStatusLoading]   = useState(true);
  const [scanBusy,        setScanBusy]        = useState(false);
  const [scanToast,       setScanToast]       = useState<string | null>(null);

  async function runWordingScan() {
    setScanBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/compliance-wording-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ actorName: "Nexum Admin" }),
      });
      const json = await res.json();
      const text = res.ok ? `Scan complete — ${json.newFindings} new issue${json.newFindings !== 1 ? "s" : ""} found.` : `Error: ${json.error}`;
      setScanToast(text);
      setTimeout(() => setScanToast(null), 5000);
    } finally { setScanBusy(false); }
  }
  const [healthResults,   setHealthResults]   = useState<HealthResult[]>(
    HEALTH_TARGETS.map((t) => ({ label: t.label, ok: null, detail: "checking…" }))
  );
  const [storageOk,       setStorageOk]       = useState<boolean | null>(null);
  const [checklist,       setChecklist]       = useState<Record<string, boolean>>({});
  const [clearTarget,     setClearTarget]     = useState<string | null>(null);
  const [clearLoading,    setClearLoading]    = useState(false);
  const [clearResults,    setClearResults]    = useState<Record<string, number | null>>({});
  const [clearError,      setClearError]      = useState<string | null>(null);
  const [exported,        setExported]        = useState(false);

  // ─── Load env status ───────────────────────────────────────────────────────

  const loadPilotStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/pilot-status");
      if (res.ok) {
        const data = await res.json() as PilotStatus;
        setPilotStatus(data);
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // ─── Run health checks ─────────────────────────────────────────────────────

  const runHealthChecks = useCallback(async () => {
    setHealthResults(HEALTH_TARGETS.map((t) => ({ label: t.label, ok: null, detail: "checking…" })));
    setStorageOk(null);

    // Table checks in parallel
    await Promise.all(
      HEALTH_TARGETS.map(async (target, idx) => {
        const { error } = await supabase.from(target.table).select("id").limit(1);
        setHealthResults((prev) => {
          const next = [...prev];
          next[idx] = {
            label:  target.label,
            ok:     !error,
            detail: error ? error.message : "Readable",
          };
          return next;
        });
      })
    );

    // Storage check
    const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "job-documents";
    const { error: stErr } = await supabase.storage.from(bucket).list("", { limit: 1 });
    setStorageOk(!stErr);
  }, []);

  // ─── Checklist (localStorage) ──────────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pilot_checklist");
      if (saved) setChecklist(JSON.parse(saved) as Record<string, boolean>);
    } catch { /* ignore */ }
  }, []);

  function toggleCheck(id: string) {
    setChecklist((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("pilot_checklist", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function resetChecklist() {
    setChecklist({});
    try { localStorage.removeItem("pilot_checklist"); } catch { /* ignore */ }
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    void loadPilotStatus();
    void runHealthChecks();
  }, [loadPilotStatus, runHealthChecks]);

  // ─── Readiness score ───────────────────────────────────────────────────────

  const checklistPct = CHECKLIST_ITEMS.length === 0 ? 0 :
    (CHECKLIST_ITEMS.filter((c) => checklist[c.id]).length / CHECKLIST_ITEMS.length) * 100;

  const healthPct = healthResults.filter((h) => h.ok !== null).length === 0 ? 0 :
    (healthResults.filter((h) => h.ok === true).length / healthResults.length) * 100;

  const storageScore = storageOk === true ? 100 : storageOk === false ? 0 : 50;

  const criticalPassed = CHECKLIST_ITEMS
    .filter((c) => c.critical)
    .every((c) => checklist[c.id]);

  const overallPct = (checklistPct * 0.5) + (healthPct * 0.35) + (storageScore * 0.15);

  const readinessScore: ReadinessScore =
    !criticalPassed              ? "Needs Fixes" :
    overallPct >= 90             ? "Ready"        :
    overallPct >= 70             ? "Almost Ready" :
    overallPct >= 50             ? "Needs Fixes"  :
                                   "Not Ready";

  const scoreBadge: Record<ReadinessScore, { bg: string; text: string; border: string }> = {
    "Ready":        { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/40" },
    "Almost Ready": { bg: "bg-blue-500/15",    text: "text-blue-400",    border: "border-blue-500/40" },
    "Needs Fixes":  { bg: "bg-amber-500/15",   text: "text-amber-400",   border: "border-amber-500/40" },
    "Not Ready":    { bg: "bg-red-500/15",      text: "text-red-400",     border: "border-red-500/40" },
  };

  // ─── Clear action ──────────────────────────────────────────────────────────

  async function handleClear(tableKey: string) {
    setClearLoading(true);
    setClearError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/pilot-demo/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ table: tableKey, confirm: "CONFIRM_CLEAR" }),
      });
      const json = await res.json() as { cleared?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Clear failed");
      setClearResults((prev) => ({ ...prev, [tableKey]: json.cleared ?? 0 }));
    } catch (e) {
      setClearError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setClearLoading(false);
      setClearTarget(null);
    }
  }

  // ─── Export report ─────────────────────────────────────────────────────────

  function handleExport() {
    const report = {
      generatedAt:    new Date().toISOString(),
      readinessScore,
      overallPct:     Math.round(overallPct),
      checklistPct:   Math.round(checklistPct),
      healthPct:      Math.round(healthPct),
      criticalPassed,
      environment:    pilotStatus,
      healthChecks:   healthResults.map((h) => ({ label: h.label, ok: h.ok, detail: h.detail })),
      storageCheck:   storageOk,
      checklist:      CHECKLIST_ITEMS.map((c) => ({ ...c, checked: !!checklist[c.id] })),
    };
    try {
      void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    } catch { /* ignore */ }
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  const badge = scoreBadge[readinessScore];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {scanToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-amber-500/30 bg-amber-900/80 px-4 py-2.5 text-xs text-amber-300 shadow-lg">{scanToast}</div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"                   className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/command-center"    className="hover:text-slate-100 transition-colors">Command Center</Link>
            <Link href="/admin/credit-packs"      className="hover:text-slate-100 transition-colors">Credit Packs</Link>
            <Link href="/admin/pilot-readiness"   className="text-slate-100 border-b border-slate-500 pb-0.5">Pilot Readiness</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">

        {/* ── Page title ──────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">🚀 Pilot Deployment Readiness</h1>
            <p className="mt-1 text-sm text-slate-400">
              Live environment status, system health, and controlled pilot checklist.
            </p>
            <button onClick={runWordingScan} disabled={scanBusy}
              className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
              {scanBusy ? "Running Wording Scan…" : "Run Full Wording Scan"}
            </button>
          </div>
          <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${badge.border} ${badge.bg}`}>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Readiness Score</p>
              <p className={`text-xl font-bold ${badge.text}`}>{readinessScore}</p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-bold tabular-nums ${badge.text}`}>{Math.round(overallPct)}%</p>
            </div>
          </div>
        </div>

        {/* ── SECTION 1 — Environment Status ──────────────────────────────── */}
        <PilotCard title="Environment Status" icon="🌐" number={1}>
          {statusLoading ? (
            <p className="text-xs text-slate-600 animate-pulse">Detecting environment…</p>
          ) : !pilotStatus ? (
            <p className="text-xs text-red-400">Could not load environment status.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EnvRow
                label="App Environment"
                value={pilotStatus.appEnv.toUpperCase()}
                ok={true}
                cls={pilotStatus.appEnv === "production" ? "text-emerald-400" : pilotStatus.appEnv === "staging" ? "text-blue-400" : "text-amber-400"}
              />
              <EnvRow
                label="App URL"
                value={pilotStatus.appUrl ?? "Not set (NEXT_PUBLIC_APP_URL)"}
                ok={!!pilotStatus.appUrl}
              />
              <EnvRow
                label="Supabase URL"
                value={pilotStatus.supabaseUrl ? `${pilotStatus.supabaseUrlHost ?? "configured"}` : "Not set"}
                ok={pilotStatus.supabaseUrl}
              />
              <EnvRow
                label="Supabase Anon Key"
                value={pilotStatus.supabaseAnonKey ? "Configured" : "Missing"}
                ok={pilotStatus.supabaseAnonKey}
              />
              <EnvRow
                label="Service Role Key"
                value={pilotStatus.serviceRoleKey ? "Configured" : "Missing — admin writes may fail"}
                ok={pilotStatus.serviceRoleKey}
              />
              <EnvRow
                label="Storage Bucket"
                value={pilotStatus.storageBucket ?? "Not set (NEXT_PUBLIC_STORAGE_BUCKET)"}
                ok={!!pilotStatus.storageBucket}
              />
              <EnvRow
                label="Email Provider"
                value={pilotStatus.emailProvider ? `${pilotStatus.emailProvider} (live)` : "Simulated — no email will be sent"}
                ok={!!pilotStatus.emailProvider}
                simulated={!pilotStatus.emailProvider}
              />
              <EnvRow
                label="AI Extraction"
                value={pilotStatus.openAiConfigured ? "OpenAI configured (live)" : "Simulated — no real extraction"}
                ok={pilotStatus.openAiConfigured}
                simulated={!pilotStatus.openAiConfigured}
              />
              <EnvRow
                label="Tracking API"
                value={pilotStatus.trackingApiConfigured ? "Carrier API configured (live)" : "Mock mode — simulated tracking"}
                ok={pilotStatus.trackingApiConfigured}
                simulated={!pilotStatus.trackingApiConfigured}
              />
              {pilotStatus.deploymentNote && (
                <div className="col-span-2 rounded-lg border border-blue-500/20 bg-blue-950/10 px-3 py-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Deployment Note</p>
                  <p className="text-xs text-blue-300">{pilotStatus.deploymentNote}</p>
                </div>
              )}
              <div className="col-span-2 text-right">
                <button
                  type="button"
                  onClick={() => void loadPilotStatus()}
                  className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                >
                  ↺ Re-check
                </button>
              </div>
            </div>
          )}
        </PilotCard>

        {/* ── SECTION 2 — System Health ────────────────────────────────────── */}
        <PilotCard title="System Health" icon="🩺" number={2}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {healthResults.map((h) => (
              <div key={h.label} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                <span className="text-xs text-slate-300">{h.label}</span>
                <div className="flex items-center gap-2">
                  {h.ok === null ? (
                    <span className="text-[10px] text-slate-600 animate-pulse">checking</span>
                  ) : h.ok ? (
                    <span className="text-[10px] font-semibold text-emerald-400">✓ OK</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-red-400 max-w-[160px] truncate" title={h.detail}>✗ {h.detail}</span>
                  )}
                </div>
              </div>
            ))}

            {/* Storage bucket */}
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
              <span className="text-xs text-slate-300">Storage bucket accessible</span>
              <div className="flex items-center gap-2">
                {storageOk === null ? (
                  <span className="text-[10px] text-slate-600 animate-pulse">checking</span>
                ) : storageOk ? (
                  <span className="text-[10px] font-semibold text-emerald-400">✓ OK</span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-400">⚠ Not accessible</span>
                )}
              </div>
            </div>
          </div>

          {/* Health summary */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              {healthResults.filter((h) => h.ok === true).length} / {healthResults.length + 1} checks passing
            </p>
            <button
              type="button"
              onClick={() => void runHealthChecks()}
              className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              ↺ Re-run checks
            </button>
          </div>
        </PilotCard>

        {/* ── SECTION 3 — Pilot Mode Checklist ────────────────────────────── */}
        <PilotCard title="Pilot Mode Checklist" icon="☑" number={3}>
          {/* Score bar */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  checklistPct >= 90 ? "bg-emerald-500" : checklistPct >= 70 ? "bg-blue-500" : checklistPct >= 50 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${checklistPct}%` }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums text-slate-300 w-10 text-right">{Math.round(checklistPct)}%</span>
            <button type="button" onClick={resetChecklist} className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors">Reset</button>
          </div>

          <div className="space-y-2">
            {CHECKLIST_ITEMS.map((item) => {
              const checked = !!checklist[item.id];
              return (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    checked
                      ? "border-emerald-500/25 bg-emerald-500/5"
                      : item.critical
                      ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/8"
                      : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCheck(item.id)}
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-emerald-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-semibold ${checked ? "text-emerald-300" : item.critical ? "text-red-300" : "text-slate-300"}`}>
                        {item.label}
                      </p>
                      {item.critical && !checked && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0 text-[9px] font-semibold text-red-400">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-600 leading-relaxed">{item.hint}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {!criticalPassed && (
            <div className="mt-3 rounded-lg border border-red-500/25 bg-red-950/10 px-4 py-2.5">
              <p className="text-xs text-red-400">
                ⚠ <strong>Critical items incomplete.</strong> Do not onboard live pilot users until all Required items are checked.
              </p>
            </div>
          )}
        </PilotCard>

        {/* ── SECTION 4 — Demo Data Manager ───────────────────────────────── */}
        <PilotCard title="Demo Data Manager" icon="🗄" number={4}>
          <div className="mb-3 rounded-lg border border-amber-500/15 bg-amber-950/10 px-4 py-2.5">
            <p className="text-[10px] text-amber-300/70">
              <span className="font-semibold text-amber-300">⚠ Destructive actions.</span>{" "}
              Clear operations permanently delete all records from the selected table.
              Use confirmation prompts. Do not run in production with live pilot data.
            </p>
          </div>

          {/* Seed / Reset links */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Demo Reset",    href: "/admin/demo-reset",    cls: "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15" },
              { label: "Demo Checklist", href: "/admin/demo-checklist", cls: "border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/15" },
              { label: "QA System Tests", href: "/admin/system-tests",  cls: "border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/15" },
              { label: "Demo Script",   href: "/admin/pilot-demo-script", cls: "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700" },
            ].map(({ label, href, cls }) => (
              <Link key={label} href={href}
                className={`rounded-lg border px-3 py-2 text-center text-[11px] font-semibold transition-colors ${cls}`}
              >
                {label} →
              </Link>
            ))}
          </div>

          {/* Clear actions */}
          <p className="mb-2 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Clear test data</p>
          {clearError && (
            <div className="mb-3 rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-2 text-xs text-red-400">
              {clearError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CLEAR_ACTIONS.map((action) => {
              const cleared = clearResults[action.key];
              return (
                <div key={action.key} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span>{action.icon}</span>
                    <span className="text-xs text-slate-300">{action.label}</span>
                    {cleared != null && (
                      <span className="text-[9px] text-emerald-400 font-semibold">✓ {cleared} cleared</span>
                    )}
                  </div>
                  {clearTarget === action.key ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={clearLoading}
                        onClick={() => void handleClear(action.key)}
                        className="rounded border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                      >
                        {clearLoading ? "…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setClearTarget(null)}
                        className="text-[9px] text-slate-600 hover:text-slate-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setClearError(null); setClearTarget(action.key); }}
                      className={`rounded border px-2 py-0.5 text-[9px] font-semibold transition-colors ${COLOR_MAP[action.color] ?? COLOR_MAP.slate}`}
                    >
                      Clear
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </PilotCard>

        {/* ── SECTION 5 — Pilot User Guide ─────────────────────────────────── */}
        <PilotCard title="Pilot User Guide" icon="📖" number={5}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {USER_GUIDE_FLOWS.map((flow) => {
              const colorMap: Record<string, { border: string; title: string; dot: string }> = {
                blue:    { border: "border-blue-500/20 bg-blue-500/5",    title: "text-blue-400",    dot: "bg-blue-500" },
                emerald: { border: "border-emerald-500/20 bg-emerald-500/5", title: "text-emerald-400", dot: "bg-emerald-500" },
                purple:  { border: "border-purple-500/20 bg-purple-500/5",  title: "text-purple-400",  dot: "bg-purple-500" },
                amber:   { border: "border-amber-500/20 bg-amber-500/5",    title: "text-amber-400",   dot: "bg-amber-500" },
              };
              const c = colorMap[flow.color];
              return (
                <div key={flow.role} className={`rounded-xl border ${c.border} p-4`}>
                  <p className={`mb-3 text-[10px] font-bold uppercase tracking-wider ${c.title}`}>{flow.role}</p>
                  <ol className="space-y-2">
                    {flow.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={`mt-1 flex-shrink-0 h-3.5 w-3.5 rounded-full ${c.dot} flex items-center justify-center text-[8px] font-bold text-white`}>
                          {i + 1}
                        </span>
                        <span className="text-[11px] text-slate-400 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>

          {/* What is simulated */}
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-400">What is simulated in this MVP</p>
            <ul className="space-y-1">
              {SIMULATED_ITEMS.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
                  <span className="text-amber-400 flex-shrink-0">⚠</span>{s}
                </li>
              ))}
            </ul>
          </div>

          {/* What users should not assume */}
          <div className="mt-3 rounded-xl border border-red-500/15 bg-red-950/10 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-red-400">What users should not assume</p>
            <ul className="space-y-1">
              {DO_NOT_ASSUME.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
                  <span className="text-red-400 flex-shrink-0">✗</span>{s}
                </li>
              ))}
            </ul>
          </div>
        </PilotCard>

        {/* ── SECTION 6 — Known Limitations ───────────────────────────────── */}
        <PilotCard title="Known Limitations" icon="⚠" number={6}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {KNOWN_LIMITATIONS.map((lim) => (
              <div key={lim.area} className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span>{lim.icon}</span>
                  <p className="text-xs font-semibold text-slate-300">{lim.area}</p>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{lim.detail}</p>
              </div>
            ))}
          </div>
        </PilotCard>

        {/* ── SECTION 7 — Pilot Readiness Score ───────────────────────────── */}
        <PilotCard title="Pilot Readiness Score" icon="📊" number={7}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
            <ScoreComponent label="Checklist"     pct={checklistPct} color={checklistPct >= 90 ? "emerald" : checklistPct >= 70 ? "blue" : "amber"} />
            <ScoreComponent label="System Health" pct={healthPct}    color={healthPct >= 90 ? "emerald" : healthPct >= 70 ? "blue" : "red"} />
            <ScoreComponent label="Storage"       pct={storageScore} color={storageOk === true ? "emerald" : storageOk === null ? "slate" : "red"} />
          </div>

          {/* Final badge */}
          <div className={`rounded-xl border p-6 text-center ${badge.border} ${badge.bg}`}>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Overall Readiness</p>
            <p className={`text-4xl font-bold mb-1 ${badge.text}`}>{readinessScore}</p>
            <p className={`text-2xl font-bold tabular-nums ${badge.text}`}>{Math.round(overallPct)}%</p>
            {!criticalPassed && (
              <p className="mt-2 text-xs text-red-400">
                {CHECKLIST_ITEMS.filter((c) => c.critical && !checklist[c.id]).length} critical checklist item(s) incomplete
              </p>
            )}
            <p className="mt-2 text-[10px] text-slate-600">
              Checklist 50% · System Health 35% · Storage 15%
            </p>
          </div>

          <div className="mt-3 text-[10px] text-slate-600 space-y-0.5">
            <p>• <span className="text-emerald-500">Ready</span> — all critical items checked, all health checks passing, ≥90% overall</p>
            <p>• <span className="text-blue-500">Almost Ready</span> — critical items checked, ≥70% overall</p>
            <p>• <span className="text-amber-500">Needs Fixes</span> — critical items missing or 50–69% overall</p>
            <p>• <span className="text-red-500">Not Ready</span> — &lt;50% overall or major health failures</p>
          </div>
        </PilotCard>

        {/* ── SECTION 8 — Export Report ────────────────────────────────────── */}
        <PilotCard title="Export Pilot Readiness Report" icon="📤" number={8}>
          <p className="mb-4 text-xs text-slate-400">
            Copies a full JSON summary of environment status, health checks, checklist state, and readiness score to clipboard. Share with the Nexum team or attach to a pilot go/no-go decision doc.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleExport}
              className={`rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${
                exported
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                  : "border-blue-600/40 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25"
              }`}
            >
              {exported ? "✓ Copied to Clipboard!" : "⎘ Copy JSON Report"}
            </button>
            <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.border} ${badge.bg} ${badge.text}`}>
              {readinessScore} · {Math.round(overallPct)}%
            </div>
            <span className="text-[10px] text-slate-600">
              {new Date().toLocaleString("en-MY")}
            </span>
          </div>

          {/* Quick summary table */}
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/50 overflow-hidden">
            {[
              { label: "Environment",     value: pilotStatus?.appEnv?.toUpperCase() ?? "—" },
              { label: "Supabase",        value: pilotStatus?.supabaseUrl ? `${pilotStatus.supabaseUrlHost ?? "configured"}` : "Not configured" },
              { label: "Email",           value: pilotStatus?.emailProvider ? `${pilotStatus.emailProvider} (live)` : "Simulated" },
              { label: "AI Extraction",   value: pilotStatus?.openAiConfigured ? "Live (OpenAI)" : "Simulated" },
              { label: "Carrier Tracking",value: pilotStatus?.trackingApiConfigured ? "Live API" : "Mock" },
              { label: "Health Checks",   value: `${healthResults.filter((h) => h.ok === true).length} / ${healthResults.length + 1} passing` },
              { label: "Checklist",       value: `${CHECKLIST_ITEMS.filter((c) => checklist[c.id]).length} / ${CHECKLIST_ITEMS.length} items (${Math.round(checklistPct)}%)` },
              { label: "Critical Items",  value: criticalPassed ? "All passed ✓" : `${CHECKLIST_ITEMS.filter((c) => c.critical && !checklist[c.id]).length} incomplete ✗` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-slate-500">{label}</span>
                <span className="text-slate-300 font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </PilotCard>

      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PilotCard({ title, icon, number, children }: {
  title: string; icon: string; number: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-5 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-[10px] font-bold text-slate-400">
          {number}
        </span>
        <span className="mr-1">{icon}</span>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      </div>
      <div className="p-5">
        {children}
      </div>
    </section>
  );
}

function EnvRow({ label, value, ok, cls, simulated }: {
  label: string; value: string; ok: boolean; cls?: string; simulated?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider flex-shrink-0 w-28">{label}</p>
      <div className="flex items-center gap-2 text-right flex-1 justify-end min-w-0">
        {simulated && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold text-amber-400 flex-shrink-0">
            Simulated
          </span>
        )}
        <p className={`text-xs font-semibold truncate ${cls ?? (ok ? "text-emerald-400" : "text-red-400")}`}>{value}</p>
      </div>
    </div>
  );
}

function ScoreComponent({ label, pct, color }: { label: string; pct: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    blue:    "bg-blue-500",
    amber:   "bg-amber-500",
    red:     "bg-red-500",
    slate:   "bg-slate-600",
  };
  const textMap: Record<string, string> = {
    emerald: "text-emerald-400",
    blue:    "text-blue-400",
    amber:   "text-amber-400",
    red:     "text-red-400",
    slate:   "text-slate-500",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-center">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{label}</p>
      <p className={`text-3xl font-bold tabular-nums mb-2 ${textMap[color] ?? "text-slate-400"}`}>
        {Math.round(pct)}%
      </p>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorMap[color] ?? "bg-slate-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
