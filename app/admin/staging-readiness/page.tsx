"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  inviteLinkBase:       string | null;
  deploymentNote:       string | null;
  generatedAt:          string;
}

type ReadinessScore = "Ready for Staging" | "Almost Ready" | "Needs Fixes" | "Not Ready";

interface DeploymentNotes {
  deployedDate:   string;
  deployedBy:     string;
  gitCommit:      string;
  knownIssues:    string;
  rollbackNote:   string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENV_CHECKLIST: { id: string; label: string; critical: boolean; hint: string }[] = [
  {
    id: "supabase_project_ready",
    label: "Production / staging Supabase project prepared",
    critical: true,
    hint: "A dedicated Supabase project exists for staging — not the local dev project. Schema migrations have been run.",
  },
  {
    id: "env_vars_configured",
    label: "Environment variables set in hosting provider",
    critical: true,
    hint: "All required variables are set in Vercel / Railway / Fly.io dashboard — not just in local .env file.",
  },
  {
    id: "supabase_url_set",
    label: "NEXT_PUBLIC_SUPABASE_URL configured",
    critical: true,
    hint: "Points to the staging Supabase project, not localhost or a dev project.",
  },
  {
    id: "supabase_anon_key_set",
    label: "NEXT_PUBLIC_SUPABASE_ANON_KEY configured",
    critical: true,
    hint: "Staging anon key from the staging Supabase project. Never use the service role key here.",
  },
  {
    id: "service_role_server_only",
    label: "SUPABASE_SERVICE_ROLE_KEY is server-side only",
    critical: true,
    hint: "Confirmed that service role key is NOT prefixed with NEXT_PUBLIC_. It must never reach the browser.",
  },
  {
    id: "storage_bucket_configured",
    label: "Storage bucket configured (NEXT_PUBLIC_STORAGE_BUCKET)",
    critical: false,
    hint: "The storage bucket name is set and the bucket exists in the staging Supabase project with correct RLS.",
  },
  {
    id: "email_configured",
    label: "Email provider configured or simulated mode acknowledged",
    critical: false,
    hint: "RESEND_API_KEY or SENDGRID_API_KEY is set, or team has noted that email is simulated for this staging phase.",
  },
  {
    id: "ai_configured",
    label: "AI extraction key configured or fallback acknowledged",
    critical: false,
    hint: "OPENAI_API_KEY is set for live extraction, or the team has confirmed simulated extraction is acceptable.",
  },
  {
    id: "app_url_set",
    label: "NEXT_PUBLIC_APP_URL configured",
    critical: true,
    hint: "Set to the staging deployment URL (e.g. https://nexum-staging.vercel.app). Used in invite links and emails.",
  },
  {
    id: "invite_base_url_set",
    label: "Invite link base URL configured (NEXT_PUBLIC_INVITE_BASE_URL)",
    critical: false,
    hint: "Used when generating invite links for pilot users. Defaults to NEXT_PUBLIC_APP_URL if not set.",
  },
  {
    id: "rls_policies_enabled",
    label: "RLS policies enabled and reviewed for pilot scope",
    critical: true,
    hint: "Row-Level Security is ON for all tables. Admin, provider, customer, and capital_partner policies have been tested.",
  },
  {
    id: "data_separated",
    label: "Demo / test data separated from real pilot data",
    critical: true,
    hint: "Staging DB contains only seeded demo data. No real customer PII or financial data has been imported.",
  },
];

const DATA_SETUP_CHECKLIST: { id: string; label: string; critical: boolean; hint: string }[] = [
  {
    id: "admin_user_created",
    label: "Admin user created and can sign in",
    critical: true,
    hint: "At least one admin@nexum.io (or equivalent) account exists with role = admin in the profiles table.",
  },
  {
    id: "provider_company_created",
    label: "Pilot provider company created",
    critical: true,
    hint: "A company record exists with type = service_provider for the pilot logistics company.",
  },
  {
    id: "provider_user_created",
    label: "Pilot provider user created and linked",
    critical: true,
    hint: "Provider user account exists with role = service_provider, linked to the pilot provider company.",
  },
  {
    id: "customer_company_created",
    label: "Pilot customer company created",
    critical: true,
    hint: "A company record exists with type = customer for the pilot customer business.",
  },
  {
    id: "customer_user_created",
    label: "Pilot customer user created and linked",
    critical: true,
    hint: "Customer user account exists with role = customer, linked to the pilot customer company.",
  },
  {
    id: "sample_job_created",
    label: "Sample secured job created end-to-end",
    critical: true,
    hint: "At least one job exists that demonstrates the full lifecycle — from creation through to payment proof uploaded.",
  },
  {
    id: "test_document_uploaded",
    label: "Test document uploaded and visible",
    critical: false,
    hint: "A test receipt or POD is uploaded via the UI and appears in the documents panel of the sample job.",
  },
  {
    id: "payment_obligation_created",
    label: "Test payment obligation created",
    critical: false,
    hint: "At least one payment obligation record exists on the sample job to demonstrate the ledger view.",
  },
  {
    id: "qa_tests_passed",
    label: "QA system test suite passed",
    critical: true,
    hint: "All checks on /admin/system-tests return green against the staging environment.",
  },
];

const ENV_VARS: {
  name: string;
  statusKey: keyof PilotStatus | "node_env";
  scope: "public" | "server";
  required: boolean;
  description: string;
  simulatedOk?: boolean;
}[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    statusKey: "supabaseUrl",
    scope: "public",
    required: true,
    description: "Supabase project REST API URL. Safe to expose — it's public by design.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    statusKey: "supabaseAnonKey",
    scope: "public",
    required: true,
    description: "Supabase anon/public key. Safe to expose — RLS enforces access control.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    statusKey: "serviceRoleKey",
    scope: "server",
    required: true,
    description: "Bypasses RLS — must NEVER be prefixed with NEXT_PUBLIC_ or exposed to the browser.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    statusKey: "appUrl",
    scope: "public",
    required: true,
    description: "Full staging URL (https://…). Used in invite links and email templates.",
  },
  {
    name: "NEXT_PUBLIC_STORAGE_BUCKET",
    statusKey: "storageBucket",
    scope: "public",
    required: false,
    description: "Name of the Supabase Storage bucket for job documents. Defaults to 'job-documents'.",
    simulatedOk: true,
  },
  {
    name: "NEXT_PUBLIC_INVITE_BASE_URL",
    statusKey: "inviteLinkBase",
    scope: "public",
    required: false,
    description: "Base URL for pilot user invite links. Defaults to NEXT_PUBLIC_APP_URL if not set.",
    simulatedOk: true,
  },
  {
    name: "RESEND_API_KEY / SENDGRID_API_KEY",
    statusKey: "emailProvider",
    scope: "server",
    required: false,
    description: "Email delivery provider. If absent, all emails are simulated — show this clearly in the UI.",
    simulatedOk: true,
  },
  {
    name: "OPENAI_API_KEY",
    statusKey: "openAiConfigured",
    scope: "server",
    required: false,
    description: "Required for live AI document extraction. If absent, extraction is simulated with placeholder confidence scores.",
    simulatedOk: true,
  },
  {
    name: "NODE_ENV",
    statusKey: "node_env",
    scope: "server",
    required: true,
    description: "Must be 'production' in staging/prod deployments. 'development' enables verbose errors — not safe for external users.",
  },
];

const SAFETY_WARNINGS: { icon: string; title: string; detail: string; severity: "critical" | "high" | "medium" }[] = [
  {
    icon: "🔑",
    title: "Never expose SUPABASE_SERVICE_ROLE_KEY to the browser",
    detail: "The service role key bypasses all RLS. If prefixed with NEXT_PUBLIC_ it will be bundled into the client JS and visible to anyone. Server-only API routes are the only safe place to use it.",
    severity: "critical",
  },
  {
    icon: "🛡",
    title: "Do not use broad MVP RLS policies in staging",
    detail: "Development may use 'allow all' RLS for speed. Staging must enforce per-role policies: admin sees all, provider sees own company's jobs, customer sees own company's jobs, capital_partner sees only shared opportunities.",
    severity: "critical",
  },
  {
    icon: "🗃",
    title: "Do not import real customer PII into staging",
    detail: "Staging databases should contain only seeded fictional demo data. Real business names, contact details, and financial figures from actual customers must never be copied into the staging environment.",
    severity: "critical",
  },
  {
    icon: "💰",
    title: "Do not claim escrow / payment holding unless licensed",
    detail: "Nexum does not hold funds. Any UI language suggesting escrow, fund custody, or payment holding requires a Money Services Business licence. All payment UI must clearly say 'verification only'.",
    severity: "high",
  },
  {
    icon: "🏦",
    title: "Do not enable real financing offers without legal review",
    detail: "Simulated financing amounts and credit packs are internal assessment tools only. They must not be presented to any party as a binding credit offer, loan approval, or guarantee without formal legal and regulatory review.",
    severity: "high",
  },
  {
    icon: "📧",
    title: "Confirm email delivery mode before pilot user invites",
    detail: "If RESEND_API_KEY / SENDGRID_API_KEY is not set, no email will be sent regardless of what the UI shows. Verify email delivery works end-to-end with a test send before inviting real pilot users.",
    severity: "medium",
  },
];

const SEVERITY_STYLE: Record<"critical" | "high" | "medium", { border: string; bg: string; badge: string; badgeText: string }> = {
  critical: {
    border:    "border-red-500/30",
    bg:        "bg-red-950/15",
    badge:     "border-red-500/40 bg-red-500/15",
    badgeText: "text-red-400",
  },
  high: {
    border:    "border-amber-500/25",
    bg:        "bg-amber-950/10",
    badge:     "border-amber-500/40 bg-amber-500/15",
    badgeText: "text-amber-400",
  },
  medium: {
    border:    "border-blue-500/20",
    bg:        "bg-blue-950/10",
    badge:     "border-blue-500/40 bg-blue-500/15",
    badgeText: "text-blue-400",
  },
};

const SCORE_STYLE: Record<ReadinessScore, { border: string; bg: string; text: string }> = {
  "Ready for Staging": { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  "Almost Ready":      { border: "border-blue-500/40",    bg: "bg-blue-500/10",    text: "text-blue-400" },
  "Needs Fixes":       { border: "border-amber-500/40",   bg: "bg-amber-500/10",   text: "text-amber-400" },
  "Not Ready":         { border: "border-red-500/40",     bg: "bg-red-500/10",     text: "text-red-400" },
};

const NOTES_STORAGE_KEY  = "staging_deployment_notes";
const ENV_CHECK_KEY      = "staging_env_checklist";
const DATA_CHECK_KEY     = "staging_data_checklist";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StagingReadinessPage() {
  return (
    <AuthGuard requiredRole="admin">
      <StagingReadinessInner />
    </AuthGuard>
  );
}

function StagingReadinessInner() {
  const [pilotStatus,   setPilotStatus]   = useState<PilotStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [envChecklist,  setEnvChecklist]  = useState<Record<string, boolean>>({});
  const [dataChecklist, setDataChecklist] = useState<Record<string, boolean>>({});
  const [notes,         setNotes]         = useState<DeploymentNotes>({
    deployedDate: "",
    deployedBy:   "",
    gitCommit:    "",
    knownIssues:  "",
    rollbackNote: "",
  });
  const [exported, setExported] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/pilot-status");
      if (res.ok) setPilotStatus(await res.json() as PilotStatus);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    // Restore persisted state from localStorage
    try {
      const ec = localStorage.getItem(ENV_CHECK_KEY);
      if (ec) setEnvChecklist(JSON.parse(ec) as Record<string, boolean>);
      const dc = localStorage.getItem(DATA_CHECK_KEY);
      if (dc) setDataChecklist(JSON.parse(dc) as Record<string, boolean>);
      const ns = localStorage.getItem(NOTES_STORAGE_KEY);
      if (ns) setNotes(JSON.parse(ns) as DeploymentNotes);
    } catch { /* ignore */ }
  }, [loadStatus]);

  // ─── Checklist helpers ─────────────────────────────────────────────────────

  function toggleEnv(id: string) {
    setEnvChecklist((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(ENV_CHECK_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function toggleData(id: string) {
    setDataChecklist((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(DATA_CHECK_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function resetAll() {
    setEnvChecklist({});
    setDataChecklist({});
    setNotes({ deployedDate: "", deployedBy: "", gitCommit: "", knownIssues: "", rollbackNote: "" });
    try {
      localStorage.removeItem(ENV_CHECK_KEY);
      localStorage.removeItem(DATA_CHECK_KEY);
      localStorage.removeItem(NOTES_STORAGE_KEY);
    } catch { /* ignore */ }
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────

  function updateNote(key: keyof DeploymentNotes, value: string) {
    setNotes((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function saveNotes() {
    try { localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes)); } catch { /* ignore */ }
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2500);
  }

  // ─── Env var status resolver ───────────────────────────────────────────────

  function resolveEnvStatus(statusKey: keyof PilotStatus | "node_env"): "configured" | "missing" | "simulated" {
    if (!pilotStatus) return "missing";
    if (statusKey === "node_env") {
      return pilotStatus.appEnv === "production" ? "configured" : "simulated";
    }
    const val = pilotStatus[statusKey as keyof PilotStatus];
    if (val === null || val === false || val === undefined) return "missing";
    return "configured";
  }

  // ─── Score calculation ─────────────────────────────────────────────────────

  const envTotal     = ENV_CHECKLIST.length;
  const envChecked   = ENV_CHECKLIST.filter((c) => envChecklist[c.id]).length;
  const envPct       = envTotal === 0 ? 0 : (envChecked / envTotal) * 100;

  const dataTotal    = DATA_SETUP_CHECKLIST.length;
  const dataChecked  = DATA_SETUP_CHECKLIST.filter((c) => dataChecklist[c.id]).length;
  const dataPct      = dataTotal === 0 ? 0 : (dataChecked / dataTotal) * 100;

  const overallPct   = envPct * 0.6 + dataPct * 0.4;

  const envCriticalPassed  = ENV_CHECKLIST.filter((c) => c.critical).every((c) => envChecklist[c.id]);
  const dataCriticalPassed = DATA_SETUP_CHECKLIST.filter((c) => c.critical).every((c) => dataChecklist[c.id]);
  const allCriticalPassed  = envCriticalPassed && dataCriticalPassed;

  const readinessScore: ReadinessScore =
    !allCriticalPassed    ? "Needs Fixes"       :
    overallPct >= 90      ? "Ready for Staging" :
    overallPct >= 70      ? "Almost Ready"       :
    overallPct >= 50      ? "Needs Fixes"        :
                            "Not Ready";

  const badge = SCORE_STYLE[readinessScore];

  // ─── Export ────────────────────────────────────────────────────────────────

  function handleExport() {
    const report = {
      exportedAt:     new Date().toISOString(),
      readinessScore,
      overallPct:     Math.round(overallPct),
      envChecklistPct: Math.round(envPct),
      dataChecklistPct: Math.round(dataPct),
      allCriticalPassed,
      environment:    pilotStatus,
      deploymentNotes: notes,
      envChecklist:   ENV_CHECKLIST.map((c) => ({ ...c, checked: !!envChecklist[c.id] })),
      dataChecklist:  DATA_SETUP_CHECKLIST.map((c) => ({ ...c, checked: !!dataChecklist[c.id] })),
    };
    try {
      void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    } catch { /* ignore */ }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"                  className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/command-center"   className="hover:text-slate-100 transition-colors">Command Center</Link>
            <Link href="/admin/pilot-readiness"  className="hover:text-slate-100 transition-colors">Pilot Readiness</Link>
            <Link href="/admin/staging-readiness" className="text-slate-100 border-b border-slate-500 pb-0.5">Staging Readiness</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">

        {/* ── Page title ──────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">🚢 Staging Deployment Readiness</h1>
            <p className="mt-1 text-sm text-slate-400">
              Pre-deployment checklist for moving from localhost to a controlled staging environment for pilot users.
            </p>
          </div>
          <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${badge.border} ${badge.bg}`}>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Staging Score</p>
              <p className={`text-xl font-bold ${badge.text}`}>{readinessScore}</p>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${badge.text}`}>{Math.round(overallPct)}%</p>
          </div>
        </div>

        {/* ── SECTION 1 — Deployment Environment Checklist ────────────────── */}
        <StagingCard title="Deployment Environment Checklist" icon="☑" number={1}>
          <ChecklistProgress
            checked={envChecked}
            total={envTotal}
            pct={envPct}
            onReset={() => {
              setEnvChecklist({});
              try { localStorage.removeItem(ENV_CHECK_KEY); } catch { /* ignore */ }
            }}
          />
          <div className="space-y-2 mt-4">
            {ENV_CHECKLIST.map((item) => {
              const checked = !!envChecklist[item.id];
              return (
                <ChecklistRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  hint={item.hint}
                  critical={item.critical}
                  checked={checked}
                  onToggle={() => toggleEnv(item.id)}
                />
              );
            })}
          </div>
          {!envCriticalPassed && (
            <BlockerBanner count={ENV_CHECKLIST.filter((c) => c.critical && !envChecklist[c.id]).length} context="environment" />
          )}
        </StagingCard>

        {/* ── SECTION 2 — Environment Variables Panel ─────────────────────── */}
        <StagingCard title="Environment Variables Panel" icon="⚙" number={2}>
          <div className="mb-3 rounded-lg border border-blue-500/15 bg-blue-950/10 px-4 py-2.5">
            <p className="text-[10px] text-blue-300/70">
              Status is auto-detected from the running server. Variable names are shown — <strong className="text-blue-300">secret values are never exposed.</strong>
            </p>
          </div>

          {statusLoading ? (
            <p className="text-xs text-slate-600 animate-pulse py-4">Detecting environment…</p>
          ) : !pilotStatus ? (
            <p className="text-xs text-red-400 py-4">Could not load environment status. Is the server running?</p>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Variable</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scope</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Required</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ENV_VARS.map((v) => {
                    const status = resolveEnvStatus(v.statusKey);
                    const effectiveStatus =
                      status === "missing" && v.simulatedOk ? "simulated" : status;
                    return (
                      <tr key={v.name} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3">
                          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">
                            {v.name}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                            v.scope === "server"
                              ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
                              : "border-slate-700 bg-slate-800 text-slate-400"
                          }`}>
                            {v.scope}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold ${v.required ? "text-red-400" : "text-slate-600"}`}>
                            {v.required ? "Required" : "Optional"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <EnvStatusBadge status={effectiveStatus} />
                        </td>
                        <td className="px-4 py-3 text-[10px] text-slate-500 max-w-[220px] leading-relaxed">
                          {v.description}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* NODE_ENV hint */}
          {pilotStatus && pilotStatus.appEnv === "local" && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-2.5">
              <p className="text-[10px] text-amber-300/80">
                <span className="font-semibold text-amber-300">⚠ NODE_ENV is not production.</span>{" "}
                This check is running on a local/development build. In a real staging deployment, your hosting provider sets NODE_ENV=production automatically.
              </p>
            </div>
          )}

          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              ↺ Re-detect
            </button>
          </div>
        </StagingCard>

        {/* ── SECTION 3 — Staging Safety Warnings ─────────────────────────── */}
        <StagingCard title="Staging Safety Warnings" icon="🛡" number={3}>
          <div className="space-y-3">
            {SAFETY_WARNINGS.map((w) => {
              const s = SEVERITY_STYLE[w.severity];
              return (
                <div key={w.title} className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3.5`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{w.icon}</span>
                    <p className="text-xs font-semibold text-slate-200">{w.title}</p>
                    <span className={`ml-auto rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${s.badge} ${s.badgeText}`}>
                      {w.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed pl-6">{w.detail}</p>
                </div>
              );
            })}
          </div>
        </StagingCard>

        {/* ── SECTION 4 — Staging Data Setup ───────────────────────────────── */}
        <StagingCard title="Staging Data Setup" icon="🗄" number={4}>
          <p className="mb-3 text-xs text-slate-400">
            Complete these steps after deploying to the staging environment. Each item confirms that the end-to-end flow works with real accounts and seeded data.
          </p>
          <ChecklistProgress
            checked={dataChecked}
            total={dataTotal}
            pct={dataPct}
            onReset={() => {
              setDataChecklist({});
              try { localStorage.removeItem(DATA_CHECK_KEY); } catch { /* ignore */ }
            }}
          />
          <div className="space-y-2 mt-4">
            {DATA_SETUP_CHECKLIST.map((item) => {
              const checked = !!dataChecklist[item.id];
              return (
                <ChecklistRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  hint={item.hint}
                  critical={item.critical}
                  checked={checked}
                  onToggle={() => toggleData(item.id)}
                />
              );
            })}
          </div>

          {/* Quick links */}
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "Admin dashboard",    href: "/admin" },
              { label: "All companies",      href: "/admin/companies" },
              { label: "All jobs",           href: "/admin/jobs" },
              { label: "QA system tests",    href: "/admin/system-tests" },
              { label: "Demo checklist",     href: "/admin/demo-checklist" },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                {label} →
              </Link>
            ))}
          </div>

          {!dataCriticalPassed && (
            <BlockerBanner count={DATA_SETUP_CHECKLIST.filter((c) => c.critical && !dataChecklist[c.id]).length} context="data setup" />
          )}
        </StagingCard>

        {/* ── SECTION 5 — Deployment Notes ─────────────────────────────────── */}
        <StagingCard title="Deployment Notes" icon="📝" number={5}>
          <p className="mb-4 text-xs text-slate-400">
            Record key deployment details here. Saved to browser localStorage — copy to your deployment doc or internal wiki for persistence.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NotesField
              label="Deployment Date"
              placeholder="e.g. 2026-05-21"
              value={notes.deployedDate}
              onChange={(v) => updateNote("deployedDate", v)}
            />
            <NotesField
              label="Deployed By"
              placeholder="e.g. Lim Ji Jie"
              value={notes.deployedBy}
              onChange={(v) => updateNote("deployedBy", v)}
            />
            <NotesField
              label="Git Commit / Version"
              placeholder="e.g. a1b2c3d or v1.4.2"
              value={notes.gitCommit}
              onChange={(v) => updateNote("gitCommit", v)}
            />
          </div>
          <div className="mt-4 space-y-3">
            <NotesTextArea
              label="Known Issues"
              placeholder="List any known bugs, limitations, or workarounds active in this deployment…"
              value={notes.knownIssues}
              onChange={(v) => updateNote("knownIssues", v)}
            />
            <NotesTextArea
              label="Rollback Note"
              placeholder="Steps to roll back this deployment if needed (e.g. revert to commit X, re-run migration Y)…"
              value={notes.rollbackNote}
              onChange={(v) => updateNote("rollbackNote", v)}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={saveNotes}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                notesSaved
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-blue-600/40 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25"
              }`}
            >
              {notesSaved ? "✓ Saved to localStorage" : "💾 Save Notes"}
            </button>
            <span className="text-[10px] text-slate-600">Notes persist in browser localStorage until cleared</span>
          </div>
        </StagingCard>

        {/* ── SECTION 6 — Readiness Score ──────────────────────────────────── */}
        <StagingCard title="Readiness Score" icon="📊" number={6}>
          {/* Sub-scores */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <SubScore
              label="Environment Checklist"
              pct={envPct}
              checked={envChecked}
              total={envTotal}
              criticalPassed={envCriticalPassed}
              weight="60%"
            />
            <SubScore
              label="Data Setup Checklist"
              pct={dataPct}
              checked={dataChecked}
              total={dataTotal}
              criticalPassed={dataCriticalPassed}
              weight="40%"
            />
          </div>

          {/* Combined badge */}
          <div className={`rounded-xl border p-6 text-center ${badge.border} ${badge.bg}`}>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Overall Staging Readiness</p>
            <p className={`text-4xl font-bold mb-1 ${badge.text}`}>{readinessScore}</p>
            <p className={`text-2xl font-bold tabular-nums ${badge.text}`}>{Math.round(overallPct)}%</p>
            {!allCriticalPassed && (
              <p className="mt-2 text-xs text-amber-400">
                {[
                  ...ENV_CHECKLIST.filter((c) => c.critical && !envChecklist[c.id]),
                  ...DATA_SETUP_CHECKLIST.filter((c) => c.critical && !dataChecklist[c.id]),
                ].length} critical item(s) incomplete — do not deploy until resolved
              </p>
            )}
            <p className="mt-2 text-[10px] text-slate-600">Environment 60% · Data Setup 40%</p>
          </div>

          {/* Thresholds */}
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {(["Ready for Staging", "Almost Ready", "Needs Fixes", "Not Ready"] as ReadinessScore[]).map((s) => {
              const sc = SCORE_STYLE[s];
              const thresholds: Record<ReadinessScore, string> = {
                "Ready for Staging": "All critical items · ≥90%",
                "Almost Ready":      "All critical items · ≥70%",
                "Needs Fixes":       "Critical items missing or 50–69%",
                "Not Ready":         "< 50% overall",
              };
              return (
                <div key={s} className={`rounded-lg border px-3 py-2 ${readinessScore === s ? `${sc.border} ${sc.bg}` : "border-slate-800 bg-slate-900/40"}`}>
                  <p className={`text-[10px] font-bold mb-0.5 ${readinessScore === s ? sc.text : "text-slate-600"}`}>{s}</p>
                  <p className="text-[9px] text-slate-700">{thresholds[s]}</p>
                </div>
              );
            })}
          </div>
        </StagingCard>

        {/* ── SECTION 7 — Export Staging Checklist ─────────────────────────── */}
        <StagingCard title="Export Staging Checklist" icon="📤" number={7}>
          <p className="mb-4 text-xs text-slate-400">
            Copies a full JSON snapshot — environment flags, checklist state, deployment notes, and readiness score — to clipboard. Paste into your deployment doc, Notion, or Slack thread.
          </p>

          <div className="flex items-center gap-3 flex-wrap mb-4">
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
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset all checklists and deployment notes? This cannot be undone.")) {
                  resetAll();
                }
              }}
              className="ml-auto text-[10px] text-slate-700 hover:text-red-400 transition-colors"
            >
              ✕ Reset all
            </button>
          </div>

          {/* Summary table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/50 overflow-hidden">
            {[
              { label: "Environment",           value: pilotStatus?.appEnv?.toUpperCase() ?? "—" },
              { label: "Supabase URL",          value: pilotStatus?.supabaseUrl ? pilotStatus.supabaseUrlHost ?? "configured" : "⚠ Not configured" },
              { label: "Anon Key",              value: pilotStatus?.supabaseAnonKey ? "Configured" : "⚠ Missing" },
              { label: "Service Role Key",      value: pilotStatus?.serviceRoleKey ? "Configured (server-only)" : "⚠ Missing" },
              { label: "Storage Bucket",        value: pilotStatus?.storageBucket ?? "Simulated (default)" },
              { label: "Email",                 value: pilotStatus?.emailProvider ? `${pilotStatus.emailProvider} (live)` : "Simulated" },
              { label: "AI Extraction",         value: pilotStatus?.openAiConfigured ? "Live (OpenAI)" : "Simulated" },
              { label: "App URL",               value: pilotStatus?.appUrl ?? "⚠ Not set" },
              { label: "Invite Base URL",       value: pilotStatus?.inviteLinkBase ?? "Defaults to App URL" },
              { label: "Env Checklist",         value: `${envChecked} / ${envTotal} (${Math.round(envPct)}%)` },
              { label: "Data Setup",            value: `${dataChecked} / ${dataTotal} (${Math.round(dataPct)}%)` },
              { label: "Critical Items",        value: allCriticalPassed ? "All passed ✓" : "Incomplete ✗" },
              { label: "Deployment Date",       value: notes.deployedDate || "—" },
              { label: "Deployed By",           value: notes.deployedBy   || "—" },
              { label: "Git Commit / Version",  value: notes.gitCommit    || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-slate-500 flex-shrink-0 w-44">{label}</span>
                <span className="text-slate-300 font-semibold text-right">{value}</span>
              </div>
            ))}
          </div>
        </StagingCard>

      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StagingCard({ title, icon, number, children }: {
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
      <div className="p-5">{children}</div>
    </section>
  );
}

function ChecklistProgress({ checked, total, pct, onReset }: {
  checked: number; total: number; pct: number; onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-blue-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums text-slate-300 w-28 text-right flex-shrink-0">
        {checked} / {total} ({Math.round(pct)}%)
      </span>
      <button type="button" onClick={onReset} className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors flex-shrink-0">
        Reset
      </button>
    </div>
  );
}

function ChecklistRow({ id, label, hint, critical, checked, onToggle }: {
  id: string; label: string; hint: string; critical: boolean; checked: boolean; onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
        checked
          ? "border-emerald-500/25 bg-emerald-500/5"
          : critical
          ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/8"
          : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-emerald-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-xs font-semibold ${checked ? "text-emerald-300" : critical ? "text-red-300" : "text-slate-300"}`}>
            {label}
          </p>
          {critical && !checked && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0 text-[9px] font-semibold text-red-400 flex-shrink-0">
              Required
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[10px] text-slate-600 leading-relaxed">{hint}</p>
      </div>
    </label>
  );
}

function BlockerBanner({ count, context }: { count: number; context: string }) {
  return (
    <div className="mt-3 rounded-lg border border-red-500/25 bg-red-950/10 px-4 py-2.5">
      <p className="text-xs text-red-400">
        ⚠ <strong>{count} required {context} item{count !== 1 ? "s" : ""} incomplete.</strong>{" "}
        Do not proceed to staging deployment until all Required items are checked.
      </p>
    </div>
  );
}

type EnvStatusType = "configured" | "missing" | "simulated";

function EnvStatusBadge({ status }: { status: EnvStatusType }) {
  const map: Record<EnvStatusType, { cls: string; label: string }> = {
    configured: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", label: "Configured" },
    missing:    { cls: "border-red-500/30 bg-red-500/10 text-red-400",             label: "Missing" },
    simulated:  { cls: "border-amber-500/30 bg-amber-500/10 text-amber-400",       label: "Simulated" },
  };
  const { cls, label } = map[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function SubScore({ label, pct, checked, total, criticalPassed, weight }: {
  label: string; pct: number; checked: number; total: number; criticalPassed: boolean; weight: string;
}) {
  const color = pct >= 90 ? "emerald" : pct >= 70 ? "blue" : pct >= 50 ? "amber" : "red";
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    blue:    "bg-blue-500",
    amber:   "bg-amber-500",
    red:     "bg-red-500",
  };
  const textMap: Record<string, string> = {
    emerald: "text-emerald-400",
    blue:    "text-blue-400",
    amber:   "text-amber-400",
    red:     "text-red-400",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <span className="text-[9px] text-slate-700 font-semibold">weight {weight}</span>
      </div>
      <p className={`text-3xl font-bold tabular-nums mb-2 ${textMap[color] ?? "text-slate-400"}`}>
        {Math.round(pct)}%
      </p>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorMap[color] ?? "bg-slate-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-600">{checked} / {total} items</span>
        {criticalPassed ? (
          <span className="text-emerald-500 font-semibold">✓ Critical OK</span>
        ) : (
          <span className="text-red-400 font-semibold">✗ Critical missing</span>
        )}
      </div>
    </div>
  );
}

function NotesField({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
      />
    </div>
  );
}

function NotesTextArea({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none resize-y"
      />
    </div>
  );
}
