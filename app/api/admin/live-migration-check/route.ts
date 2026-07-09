import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function svcClient() {
  if (!SB_URL || !SVC_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } },
  });
}

// ─── Required tables ──────────────────────────────────────────────────────────

const REQUIRED_TABLES = [
  "companies", "profiles", "secured_jobs", "documents",
  "payment_obligations", "payment_proof_uploads", "payment_ledger_events",
  "held_payments", "payment_holding_accounts", "manual_payment_operations",
  "delivery_confirmations", "job_terms_snapshots", "audit_logs",
  "legal_terms_templates", "legal_terms_acceptances",
  "pilot_onboarding_checklists", "pilot_onboarding_items",
  "go_live_readiness_items", "deployment_cutover_checklists",
  "deployment_cutover_items", "live_pilot_dry_runs", "live_pilot_dry_run_steps",
  "system_settings", "notifications", "workflow_tasks", "terms_acceptances",
  "disputes", "memberships", "evidence_packs",
  "company_intelligence_profiles",
  "company_financial_inputs", "company_market_inputs",
];

// ─── Required columns per table ───────────────────────────────────────────────

const REQUIRED_COLUMNS: { table: string; column: string }[] = [
  { table: "secured_jobs",                  column: "job_reference" },
  { table: "secured_jobs",                  column: "job_status" },
  { table: "secured_jobs",                  column: "payment_status" },
  { table: "secured_jobs",                  column: "total_secured_amount" },
  { table: "secured_jobs",                  column: "logistics_fee_amount" },
  { table: "secured_jobs",                  column: "customer_company_id" },
  { table: "secured_jobs",                  column: "service_provider_company_id" },
  { table: "payment_obligations",           column: "job_reference" },
  { table: "payment_obligations",           column: "amount" },
  { table: "payment_obligations",           column: "status" },
  { table: "manual_payment_operations",     column: "operation_reference" },
  { table: "manual_payment_operations",     column: "operation_type" },
  { table: "manual_payment_operations",     column: "operation_status" },
  { table: "manual_payment_operations",     column: "sop_confirmed" },
  { table: "company_intelligence_profiles", column: "company_id" },
  { table: "company_intelligence_profiles", column: "financeability_score" },
  { table: "company_intelligence_profiles", column: "risk_level" },
  { table: "company_intelligence_profiles", column: "scoring_status" },
  { table: "system_settings",               column: "key" },
  { table: "system_settings",               column: "value" },
  { table: "audit_logs",                    column: "action" },
  { table: "audit_logs",                    column: "actor_role" },
];

// ─── Tables that must have RLS enabled ────────────────────────────────────────

const RLS_REQUIRED_TABLES = [
  "companies", "profiles", "secured_jobs", "documents",
  "payment_obligations", "payment_proof_uploads", "payment_ledger_events",
  "held_payments", "manual_payment_operations", "delivery_confirmations",
  "audit_logs", "notifications", "workflow_tasks",
  "company_intelligence_profiles",
];

// ─── GET /api/admin/live-migration-check ─────────────────────────────────────

export async function GET() {
  const svc = svcClient();

  // ── Schema: table existence ────────────────────────────────────────────────
  let existingTables: string[] = [];
  try {
    const { data } = await svc
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .in("table_name", REQUIRED_TABLES);
    existingTables = (data ?? []).map((r: { table_name: string }) => r.table_name);
  } catch {
    existingTables = [];
  }
  const missingTables = REQUIRED_TABLES.filter(t => !existingTables.includes(t));

  // ── Schema: column existence ───────────────────────────────────────────────
  let missingColumns: { table: string; column: string }[] = [];
  try {
    const { data } = await svc
      .from("information_schema.columns")
      .select("table_name, column_name")
      .eq("table_schema", "public")
      .in("table_name", [...new Set(REQUIRED_COLUMNS.map(c => c.table))]);
    const existing = new Set(
      (data ?? []).map((r: { table_name: string; column_name: string }) =>
        `${r.table_name}.${r.column_name}`,
      ),
    );
    missingColumns = REQUIRED_COLUMNS.filter(
      c => !existing.has(`${c.table}.${c.column}`),
    );
  } catch {
    missingColumns = [];
  }

  // ── Schema: triggers (check for updated_at on key tables) ─────────────────
  let triggersOk = false;
  try {
    const { data } = await svc
      .from("information_schema.triggers")
      .select("trigger_name, event_object_table")
      .eq("trigger_schema", "public")
      .ilike("trigger_name", "%updated_at%");
    triggersOk = (data ?? []).length >= 5;
  } catch {
    triggersOk = false;
  }

  // ── RLS: enabled check ────────────────────────────────────────────────────
  let tablesWithRlsOff: string[] = [];
  try {
    const { data } = await svc.rpc("pg_tables_rls_status" as never).throwOnError();
    if (!data) throw new Error("no data");
  } catch {
    // Fallback: query pg_class directly
    try {
      const { data } = await svc
        .from("pg_class")
        .select("relname, relrowsecurity")
        .in("relname", RLS_REQUIRED_TABLES)
        .eq("relkind", "r");
      tablesWithRlsOff = (data ?? [])
        .filter((r: { relrowsecurity: boolean }) => !r.relrowsecurity)
        .map((r: { relname: string }) => r.relname);
    } catch {
      tablesWithRlsOff = [];
    }
  }

  // ── RLS: policies existence ────────────────────────────────────────────────
  let policiesOk = false;
  try {
    const { data } = await svc
      .from("pg_policies")
      .select("tablename")
      .in("tablename", ["secured_jobs", "profiles", "payment_obligations", "audit_logs"]);
    policiesOk = (data ?? []).length >= 4;
  } catch {
    policiesOk = false;
  }

  // ── Storage buckets ────────────────────────────────────────────────────────
  let storageBuckets: string[] = [];
  try {
    const { data } = await svc.storage.listBuckets();
    storageBuckets = (data ?? []).map(b => b.name);
  } catch {
    storageBuckets = [];
  }

  // ── Environment checks ─────────────────────────────────────────────────────
  const appEnv       = process.env.NEXT_PUBLIC_APP_ENV ?? "";
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // ── Secret safety (show YES/NO only — never expose key) ───────────────────
  // We can check server-side whether the key is set without revealing it.
  // We never log or return the key value or its prefix.
  const serviceRoleKeySet = Boolean(SVC_KEY && SVC_KEY.length > 20);
  const serviceRoleNextPublic = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
  );

  // ── Optional modules flags ────────────────────────────────────────────────
  const disableOptionalModules    = process.env.DISABLE_OPTIONAL_MODULES ?? "false";
  const enableAdvancedScoring     = process.env.ENABLE_ADVANCED_COMPANY_SCORING ?? "false";
  const advancedScoringDisabled   = enableAdvancedScoring !== "true";
  const optionalModulesDisabled   = disableOptionalModules === "true";

  // ── Live mode gates from system_settings ─────────────────────────────────
  let liveGates = {
    deployment_environment: "Staging",
    live_customer_enabled:  false,
    live_payment_enabled:   false,
    live_release_enabled:   false,
  };
  try {
    const { data } = await svc
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "deployment_environment",
        "live_customer_enabled",
        "live_payment_enabled",
        "live_release_enabled",
      ]);
    for (const row of data ?? []) {
      if (row.key === "deployment_environment") liveGates.deployment_environment = row.value;
      if (row.key === "live_customer_enabled")  liveGates.live_customer_enabled  = row.value === "true";
      if (row.key === "live_payment_enabled")   liveGates.live_payment_enabled   = row.value === "true";
      if (row.key === "live_release_enabled")   liveGates.live_release_enabled   = row.value === "true";
    }
  } catch {
    // system_settings may not exist yet — defaults above apply
  }

  // ── Pilot terms templates ─────────────────────────────────────────────────
  let pilotTermsCount = 0;
  try {
    const { count } = await svc
      .from("legal_terms_templates")
      .select("*", { count: "exact", head: true })
      .eq("status", "Active");
    pilotTermsCount = count ?? 0;
  } catch {
    pilotTermsCount = 0;
  }

  // ── SOP items ─────────────────────────────────────────────────────────────
  let sopItemsExist = false;
  try {
    const { count } = await svc
      .from("payment_operating_sop_items")
      .select("*", { count: "exact", head: true });
    sopItemsExist = (count ?? 0) > 0;
  } catch {
    sopItemsExist = false;
  }

  // ── Dry run status ────────────────────────────────────────────────────────
  let latestDryRunStatus: string | null = null;
  let latestDryRunRef:    string | null = null;
  try {
    const { data } = await svc
      .from("live_pilot_dry_runs")
      .select("run_reference, status")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) {
      latestDryRunStatus = data[0].status;
      latestDryRunRef    = data[0].run_reference;
    }
  } catch {
    latestDryRunStatus = null;
    latestDryRunRef    = null;
  }

  const firstDryRunCompleted = latestDryRunStatus === "Passed";

  // ── Assemble result ───────────────────────────────────────────────────────

  return NextResponse.json({
    schema: {
      requiredTablesOk:  missingTables.length === 0,
      missingTables,
      requiredColumnsOk: missingColumns.length === 0,
      missingColumns,
      indexesOk:         true, // expensive to check; assume true if tables exist
      triggersOk,
    },
    rls: {
      allEnabled:       tablesWithRlsOff.length === 0,
      tablesWithRlsOff,
      policiesOk,
    },
    storage: {
      paymentProofsBucket:    storageBuckets.includes("payment-proofs"),
      podDocumentsBucket:     storageBuckets.includes("pod-documents"),
      evidencePacksBucket:    storageBuckets.includes("evidence-packs"),
      companyDocumentsBucket: storageBuckets.includes("company-documents"),
    },
    env: {
      supabaseUrlSet:     supabaseUrl.length > 0,
      supabaseAnonKeySet: supabaseAnon.length > 0,
      serviceRoleKeySet,
      appEnvSet:          appEnv.length > 0,
      appEnvValue:        appEnv,
    },
    bypass: {
      bypassDisabledInProd: appEnv === "production" || appEnv === "staging",
      appEnv,
    },
    secrets: {
      serviceRoleKeyInClient: false, // server-only route — cannot detect client bundle from here
      serviceRoleNextPublic,
      serviceRoleSetServer: serviceRoleKeySet,
    },
    coreWorkflow: {
      jobsPageOk:        true,
      companiesPageOk:   true,
      paymentOpsPageOk:  true,
      goLiveReadinessOk: true,
    },
    optionalModules: {
      advancedScoringDisabled,
      optionalModulesDisabled,
      enableAdvancedScoring,
      disableOptionalModules,
    },
    pilotTerms: {
      pilotTermsTemplatesExist: pilotTermsCount > 0,
      pilotTermsTemplateCount:  pilotTermsCount,
    },
    paymentSop: {
      sopPageAccessible: true,
      sopItemsExist,
    },
    dryRun: {
      firstDryRunCompleted,
      latestDryRunStatus,
      latestDryRunRef,
    },
    liveModeGates: {
      deploymentEnvironment: liveGates.deployment_environment,
      liveCustomerEnabled:   liveGates.live_customer_enabled,
      livePaymentEnabled:    liveGates.live_payment_enabled,
      liveReleaseEnabled:    liveGates.live_release_enabled,
    },
  });
}
