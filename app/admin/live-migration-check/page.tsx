"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "fail" | "warn" | "skip" | "loading";

interface Check {
  key:        string;
  label:      string;
  status:     CheckStatus;
  detail?:    string;
  blocker:    boolean;
}

interface CheckGroup {
  title:   string;
  icon:    string;
  checks:  Check[];
}

// ─── API response ─────────────────────────────────────────────────────────────

interface MigrationCheckResult {
  schema:         SchemaCheck;
  rls:            RlsCheck;
  storage:        StorageCheck;
  env:            EnvCheck;
  bypass:         BypassCheck;
  secrets:        SecretCheck;
  coreWorkflow:   CoreWorkflowCheck;
  optionalModules: OptionalModulesCheck;
  pilotTerms:     PilotTermsCheck;
  paymentSop:     PaymentSopCheck;
  dryRun:         DryRunCheck;
  liveModeGates:  LiveModeGatesCheck;
}

interface SchemaCheck {
  requiredTablesOk:   boolean;
  missingTables:      string[];
  requiredColumnsOk:  boolean;
  missingColumns:     { table: string; column: string }[];
  indexesOk:          boolean;
  triggersOk:         boolean;
}

interface RlsCheck {
  allEnabled:         boolean;
  tablesWithRlsOff:   string[];
  policiesOk:         boolean;
}

interface StorageCheck {
  paymentProofsBucket:    boolean;
  podDocumentsBucket:     boolean;
  evidencePacksBucket:    boolean;
  companyDocumentsBucket: boolean;
}

interface EnvCheck {
  supabaseUrlSet:       boolean;
  supabaseAnonKeySet:   boolean;
  serviceRoleKeySet:    boolean;
  appEnvSet:            boolean;
  appEnvValue:          string;
}

interface BypassCheck {
  bypassDisabledInProd: boolean;
  appEnv:               string;
}

interface SecretCheck {
  serviceRoleKeyInClient:  boolean;
  serviceRoleNextPublic:   boolean;
  serviceRoleSetServer:    boolean;
}

interface CoreWorkflowCheck {
  jobsPageOk:           boolean;
  companiesPageOk:      boolean;
  paymentOpsPageOk:     boolean;
  goLiveReadinessOk:    boolean;
}

interface OptionalModulesCheck {
  advancedScoringDisabled:    boolean;
  optionalModulesDisabled:    boolean;
  enableAdvancedScoring:      string;
  disableOptionalModules:     string;
}

interface PilotTermsCheck {
  pilotTermsTemplatesExist:   boolean;
  pilotTermsTemplateCount:    number;
}

interface PaymentSopCheck {
  sopPageAccessible:  boolean;
  sopItemsExist:      boolean;
}

interface DryRunCheck {
  firstDryRunCompleted:   boolean;
  latestDryRunStatus:     string | null;
  latestDryRunRef:        string | null;
}

interface LiveModeGatesCheck {
  deploymentEnvironment:  string;
  liveCustomerEnabled:    boolean;
  livePaymentEnabled:     boolean;
  liveReleaseEnabled:     boolean;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { label: string; cls: string }> = {
    pass:    { label: "PASS",    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    fail:    { label: "FAIL",    cls: "bg-red-500/15 text-red-300 border-red-500/30" },
    warn:    { label: "WARN",    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    skip:    { label: "SKIP",    cls: "bg-slate-700/50 text-slate-400 border-slate-600/30" },
    loading: { label: "...",     cls: "bg-slate-700/50 text-slate-400 border-slate-600/30" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
      <div className="flex items-start gap-2 min-w-0">
        {check.blocker && check.status === "fail" && (
          <span className="mt-0.5 shrink-0 text-[10px] font-bold text-red-400">BLOCKER</span>
        )}
        <div className="min-w-0">
          <p className="text-sm text-slate-200">{check.label}</p>
          {check.detail && (
            <p className="mt-0.5 text-xs text-slate-500 break-words">{check.detail}</p>
          )}
        </div>
      </div>
      <StatusBadge status={check.status} />
    </div>
  );
}

// ─── Transform API result into CheckGroups ────────────────────────────────────

function buildCheckGroups(data: MigrationCheckResult): CheckGroup[] {
  const s = data.schema;
  const r = data.rls;
  const st = data.storage;
  const e = data.env;
  const b = data.bypass;
  const sec = data.secrets;
  const cw = data.coreWorkflow;
  const om = data.optionalModules;
  const pt = data.pilotTerms;
  const ps = data.paymentSop;
  const dr = data.dryRun;
  const lm = data.liveModeGates;

  return [
    {
      title: "Schema",
      icon: "◻",
      checks: [
        {
          key: "tables",
          label: "All required tables exist",
          status: s.requiredTablesOk ? "pass" : "fail",
          detail: s.missingTables.length
            ? `Missing: ${s.missingTables.join(", ")}`
            : undefined,
          blocker: true,
        },
        {
          key: "columns",
          label: "All required columns exist",
          status: s.requiredColumnsOk ? "pass" : "fail",
          detail: s.missingColumns.length
            ? s.missingColumns.map(c => `${c.table}.${c.column}`).join(", ")
            : undefined,
          blocker: true,
        },
        {
          key: "indexes",
          label: "Core indexes exist",
          status: s.indexesOk ? "pass" : "warn",
          blocker: false,
        },
        {
          key: "triggers",
          label: "updated_at triggers in place",
          status: s.triggersOk ? "pass" : "warn",
          blocker: false,
        },
      ],
    },
    {
      title: "Row Level Security",
      icon: "◻",
      checks: [
        {
          key: "rls_enabled",
          label: "RLS enabled on all core tables",
          status: r.allEnabled ? "pass" : "fail",
          detail: r.tablesWithRlsOff.length
            ? `RLS off on: ${r.tablesWithRlsOff.join(", ")}`
            : undefined,
          blocker: true,
        },
        {
          key: "rls_policies",
          label: "RLS policies exist (admin, provider, customer)",
          status: r.policiesOk ? "pass" : "warn",
          blocker: false,
        },
      ],
    },
    {
      title: "Storage Buckets",
      icon: "◻",
      checks: [
        { key: "payment_proofs",    label: "payment-proofs bucket exists",    status: st.paymentProofsBucket    ? "pass" : "warn", blocker: false },
        { key: "pod_documents",     label: "pod-documents bucket exists",     status: st.podDocumentsBucket     ? "pass" : "warn", blocker: false },
        { key: "evidence_packs",    label: "evidence-packs bucket exists",    status: st.evidencePacksBucket    ? "pass" : "warn", blocker: false },
        { key: "company_documents", label: "company-documents bucket exists", status: st.companyDocumentsBucket ? "pass" : "warn", blocker: false },
      ],
    },
    {
      title: "Environment",
      icon: "◻",
      checks: [
        {
          key: "supabase_url",
          label: "NEXT_PUBLIC_SUPABASE_URL set",
          status: e.supabaseUrlSet ? "pass" : "fail",
          blocker: true,
        },
        {
          key: "supabase_anon",
          label: "NEXT_PUBLIC_SUPABASE_ANON_KEY set",
          status: e.supabaseAnonKeySet ? "pass" : "fail",
          blocker: true,
        },
        {
          key: "service_role",
          label: "SUPABASE_SERVICE_ROLE_KEY set (server-side)",
          status: e.serviceRoleKeySet ? "pass" : "fail",
          detail: "Verified via server-only check — key value is never shown",
          blocker: true,
        },
        {
          key: "app_env",
          label: "NEXT_PUBLIC_APP_ENV configured",
          status: e.appEnvSet ? "pass" : "warn",
          detail: `Current value: ${e.appEnvValue || "(not set)"}`,
          blocker: false,
        },
      ],
    },
    {
      title: "Dev Bypass Guard",
      icon: "◻",
      checks: [
        {
          key: "bypass_disabled",
          label: "Dev bypass hidden in production",
          status: b.bypassDisabledInProd ? "pass" : "fail",
          detail: b.appEnv === "production"
            ? "NEXT_PUBLIC_APP_ENV=production — bypass correctly disabled"
            : `NEXT_PUBLIC_APP_ENV=${b.appEnv || "(not set)"} — bypass may be visible`,
          blocker: b.appEnv === "production",
        },
      ],
    },
    {
      title: "Secret Safety",
      icon: "◻",
      checks: [
        {
          key: "not_in_client",
          label: "Service role key NOT exposed to browser",
          status: !sec.serviceRoleKeyInClient ? "pass" : "fail",
          detail: sec.serviceRoleKeyInClient ? "CRITICAL: key detected in client bundle" : "Safe — server-side only",
          blocker: true,
        },
        {
          key: "not_next_public",
          label: "Service role key has no NEXT_PUBLIC_ prefix",
          status: !sec.serviceRoleNextPublic ? "pass" : "fail",
          blocker: true,
        },
        {
          key: "set_server",
          label: "Service role key set on server (YES/NO only)",
          status: sec.serviceRoleSetServer ? "pass" : "warn",
          detail: sec.serviceRoleSetServer ? "YES — key is set" : "NO — key not found on server",
          blocker: true,
        },
      ],
    },
    {
      title: "Optional Modules",
      icon: "◻",
      checks: [
        {
          key: "advanced_scoring",
          label: "Advanced scoring disabled (BASIC MODE)",
          status: om.advancedScoringDisabled ? "pass" : "warn",
          detail: `ENABLE_ADVANCED_COMPANY_SCORING=${om.enableAdvancedScoring}`,
          blocker: false,
        },
        {
          key: "optional_modules",
          label: "Optional modules disabled for stability",
          status: om.optionalModulesDisabled ? "pass" : "warn",
          detail: `DISABLE_OPTIONAL_MODULES=${om.disableOptionalModules}`,
          blocker: false,
        },
      ],
    },
    {
      title: "Pilot Terms",
      icon: "◻",
      checks: [
        {
          key: "terms_templates",
          label: "Pilot terms templates exist in database",
          status: pt.pilotTermsTemplatesExist ? "pass" : "warn",
          detail: `Found ${pt.pilotTermsTemplateCount} active template(s)`,
          blocker: false,
        },
      ],
    },
    {
      title: "Payment SOP",
      icon: "◻",
      checks: [
        {
          key: "sop_page",
          label: "Payment SOP page accessible",
          status: ps.sopPageAccessible ? "pass" : "warn",
          detail: "/admin/payment-sop",
          blocker: false,
        },
        {
          key: "sop_items",
          label: "SOP checklist items seeded",
          status: ps.sopItemsExist ? "pass" : "warn",
          blocker: false,
        },
      ],
    },
    {
      title: "Dry Run",
      icon: "◻",
      checks: [
        {
          key: "dry_run",
          label: "First dry run completed",
          status: dr.firstDryRunCompleted ? "pass" : "warn",
          detail: dr.latestDryRunRef
            ? `Latest: ${dr.latestDryRunRef} — ${dr.latestDryRunStatus ?? "Unknown"}`
            : "No dry runs recorded yet",
          blocker: false,
        },
      ],
    },
    {
      title: "Live Mode Gates",
      icon: "◻",
      checks: [
        {
          key: "env_type",
          label: "Deployment environment",
          status: "pass",
          detail: lm.deploymentEnvironment,
          blocker: false,
        },
        {
          key: "gate_customer",
          label: "live_customer_enabled = false (default off)",
          status: !lm.liveCustomerEnabled ? "pass" : "warn",
          detail: lm.liveCustomerEnabled
            ? "Gate is ON — enable intentionally after dry run"
            : "Off — safe default",
          blocker: false,
        },
        {
          key: "gate_payment",
          label: "live_payment_enabled = false (default off)",
          status: !lm.livePaymentEnabled ? "pass" : "warn",
          blocker: false,
        },
        {
          key: "gate_release",
          label: "live_release_enabled = false (default off)",
          status: !lm.liveReleaseEnabled ? "pass" : "warn",
          blocker: false,
        },
      ],
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LiveMigrationCheckPage() {
  const [groups,   setGroups]   = useState<CheckGroup[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [lastRun,  setLastRun]  = useState<string | null>(null);

  async function runChecks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/live-migration-check");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MigrationCheckResult = await res.json();
      setGroups(buildCheckGroups(data));
      setLastRun(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run checks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runChecks(); }, []);

  const allChecks   = groups.flatMap(g => g.checks);
  const blockers    = allChecks.filter(c => c.blocker && c.status === "fail");
  const failures    = allChecks.filter(c => c.status === "fail");
  const warnings    = allChecks.filter(c => c.status === "warn");
  const passes      = allChecks.filter(c => c.status === "pass");
  const overallOk   = failures.length === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-1">
              Admin / Deployment
            </p>
            <h1 className="text-2xl font-bold text-slate-50">Live Migration Check</h1>
            <p className="mt-1 text-sm text-slate-400">
              Verifies the production baseline is ready for live pilot deployment.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastRun && (
              <span className="text-xs text-slate-600">Last run: {lastRun}</span>
            )}
            <button
              onClick={runChecks}
              disabled={loading}
              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            >
              {loading ? "Running…" : "Re-run checks"}
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs font-semibold text-red-400">Check failed: {error}</p>
            <p className="mt-1 text-xs text-red-400/70">
              Ensure you are logged in as admin and the API route
              <code className="mx-1 text-red-300">/api/admin/live-migration-check</code>
              is deployed.
            </p>
          </div>
        )}

        {/* ── Summary bar ── */}
        {!loading && !error && (
          <div className={`mb-6 rounded-xl border px-5 py-4 ${
            overallOk
              ? "border-emerald-500/30 bg-emerald-500/5"
              : blockers.length
              ? "border-red-500/30 bg-red-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={`text-sm font-semibold ${overallOk ? "text-emerald-300" : blockers.length ? "text-red-300" : "text-amber-300"}`}>
                  {overallOk
                    ? "All checks passed — ready for live deployment"
                    : blockers.length
                    ? `${blockers.length} blocker(s) must be resolved before deployment`
                    : "Checks complete — review warnings before deployment"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {passes.length} pass · {warnings.length} warn · {failures.length} fail
                  {" · "}
                  {allChecks.length} total
                </p>
              </div>
              <Link
                href="/admin/db-health"
                className="shrink-0 rounded border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                DB Health →
              </Link>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center gap-3 py-12 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            Running all migration checks…
          </div>
        )}

        {/* ── Check groups ── */}
        {!loading && groups.map(group => (
          <div key={group.title} className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-3">
              <span className="text-slate-600">{group.icon}</span>
              <h2 className="text-sm font-semibold text-slate-300">{group.title}</h2>
              <div className="ml-auto flex gap-1">
                {group.checks.some(c => c.status === "fail") && (
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                    {group.checks.filter(c => c.status === "fail").length} FAIL
                  </span>
                )}
                {group.checks.every(c => c.status === "pass") && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    ALL PASS
                  </span>
                )}
              </div>
            </div>
            <div className="px-5 py-1">
              {group.checks.map(check => (
                <CheckRow key={check.key} check={check} />
              ))}
            </div>
          </div>
        ))}

        {/* ── Blockers summary ── */}
        {!loading && blockers.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-red-300 mb-2">
              Deployment blockers ({blockers.length})
            </p>
            <ul className="space-y-1">
              {blockers.map(b => (
                <li key={b.key} className="flex items-start gap-2 text-xs text-red-400">
                  <span className="mt-0.5 shrink-0 font-bold">✗</span>
                  <span>{b.label}{b.detail ? ` — ${b.detail}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Footer links ── */}
        <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-600">
          <Link href="/admin/db-health" className="hover:text-slate-400 transition-colors">DB Health</Link>
          <Link href="/admin/go-live-readiness" className="hover:text-slate-400 transition-colors">Go-Live Readiness</Link>
          <Link href="/admin/live-pilot-dry-run" className="hover:text-slate-400 transition-colors">Dry Runs</Link>
          <Link href="/admin/deployment-cutover" className="hover:text-slate-400 transition-colors">Deployment Cutover</Link>
          <Link href="/admin/payment-sop" className="hover:text-slate-400 transition-colors">Payment SOP</Link>
          <Link href="/admin/legal-terms" className="hover:text-slate-400 transition-colors">Legal Terms</Link>
        </div>

        <p className="mt-4 text-[10px] text-slate-700">
          Nexum SecureFlow · Admin diagnostic only · Not a regulated financial service
        </p>
      </div>
    </div>
  );
}
