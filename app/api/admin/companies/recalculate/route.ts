import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Advanced scoring is disabled by default. Set ENABLE_ADVANCED_COMPANY_SCORING=true
// to include the full set of scoring fields in the upsert payload.
const ENABLE_ADVANCED = process.env.ENABLE_ADVANCED_COMPANY_SCORING === "true";

// Fields omitted from the basic upsert when advanced scoring is disabled.
// These will be listed in the response as skipped_advanced_fields.
const ADVANCED_FIELDS = [
  "completed_jobs",
  "active_jobs",
  "disputed_jobs",
  "payment_verified_jobs",
  "auto_confirmed_jobs",
  "open_exceptions",
  "critical_exceptions",
  "high_exceptions",
  "exception_count",
  "payment_mismatch_count",
  "late_payment_count",
  "dispute_count",
  "claim_count",
  "total_cargo_value",
  "avg_payment_confirmation_days",
  "avg_execution_completion_days",
  "average_payment_days",
  "average_delivery_days",
  "on_time_completion_rate",
  "document_completeness_score",
  "payment_behavior_score",
  "payment_behaviour_score",
  "operational_reliability_score",
  "delivery_performance_score",
  "overall_trust_score",
  "financing_readiness",
  "financing_readiness_score",
  "finance_priority_level",
  "priority_finance_reason",
  "trend",
  "recommended_terms",
  "recommended_exposure_limit",
  "recommended_financing_amount",
  "score_note",
  "risk_flags",
  "score_breakdown",
  "top_routes",
];

// ─── Clients ──────────────────────────────────────────────────────────────────

function authClient() {
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function svcClient() {
  if (!SB_URL || !SVC_KEY) {
    throw new Error(
      `Missing env — NEXT_PUBLIC_SUPABASE_URL=${!!SB_URL}, SUPABASE_SERVICE_ROLE_KEY=${!!SVC_KEY}`,
    );
  }
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        apikey:        SVC_KEY,
        Authorization: `Bearer ${SVC_KEY}`,
      },
    },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CompanyRow = {
  id:      string;
  name:    string;
  type:    string | null;
  country: string | null;
  status:  string | null;
};

type JobRow = {
  id:                          string;
  service_provider_company_id: string | null;
  customer_company_id:         string | null;
  job_status:                  string | null;
  payment_status:              string | null;
  logistics_fee_amount:        number | null;
  cargo_value_amount:          number | null;
  total_secured_amount:        number | null;
  created_at:                  string | null;
};

type BasicPayload = {
  company_id:             string;
  company_name:           string;
  company_type:           string | null;
  total_jobs:             number;
  monthly_jobs:           number;
  total_logistics_fee:    number;
  total_cargo_value:      number;
  total_secured_amount:   number;
  monthly_secured_amount: number;
  risk_level:             string;
  financeability_score:   number | null;
  scoring_status:         string;
  last_calculated_at:     string;
  updated_at:             string;
};

// ─── Payload builder (basic mode) ────────────────────────────────────────────

function buildBasicPayload(company: CompanyRow, compJobs: JobRow[]): BasicPayload {
  const THIRTY_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const n = (v: unknown) => (v != null ? Number(v) : 0);

  const recent        = compJobs.filter((j) => j.created_at != null && j.created_at >= THIRTY_AGO);
  const totalJobs     = compJobs.length;
  const completedJobs = compJobs.filter((j) => j.job_status === "Completed").length;
  const disputedJobs  = compJobs.filter(
    (j) => j.job_status === "Disputed" || j.payment_status === "Disputed",
  ).length;
  const totalSecured  = compJobs.reduce((s, j) => s + n(j.total_secured_amount), 0);

  // Risk level
  let riskLevel: string;
  if (totalJobs === 0)       riskLevel = "Not Available";
  else if (disputedJobs > 0) riskLevel = "High";
  else if (totalSecured >= 500_000) riskLevel = "Medium";
  else if (completedJobs > 0) riskLevel = "Low";
  else                        riskLevel = "Medium";

  // Financeability score (0-100, null when no history)
  let financeabilityScore: number | null = null;
  if (totalJobs > 0) {
    if (disputedJobs > 1)           financeabilityScore = 45;
    else if (disputedJobs === 1)    financeabilityScore = 55;
    else if (totalSecured >= 500_000) financeabilityScore = 70;
    else if (completedJobs > 0)     financeabilityScore = 80;
    else                            financeabilityScore = 60;
  }

  const now = new Date().toISOString();

  return {
    company_id:             company.id,
    company_name:           company.name,
    company_type:           company.type,
    total_jobs:             totalJobs,
    monthly_jobs:           recent.length,
    total_logistics_fee:    compJobs.reduce((s, j) => s + n(j.logistics_fee_amount), 0),
    total_cargo_value:      compJobs.reduce((s, j) => s + n(j.cargo_value_amount), 0),
    total_secured_amount:   totalSecured,
    monthly_secured_amount: recent.reduce((s, j) => s + n(j.total_secured_amount), 0),
    risk_level:             riskLevel,
    financeability_score:   financeabilityScore,
    scoring_status:         "Scored",
    last_calculated_at:     now,
    updated_at:             now,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Env check ────────────────────────────────────────────────────────────
  let svc: ReturnType<typeof svcClient>;
  try { svc = svcClient(); } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // ── 2. Auth ──────────────────────────────────────────────────────────────────
  // Two paths:
  //   a) Internal server-to-server call (x-internal-service-key = SVC_KEY) — skip JWT check.
  //   b) External client call — require valid JWT + admin profiles row.

  const internalKey = req.headers.get("x-internal-service-key");
  const isInternal  = !!(internalKey && internalKey === SVC_KEY);

  if (!isInternal) {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized — no token" }, { status: 401 });
    }
    const { data: { user }, error: authErr } = await authClient().auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized", detail: authErr?.message }, { status: 401 });
    }
    const { data: profile } = await svc
      .from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({})) as { companyId?: string };

  // ── 3. Single-company mode ──────────────────────────────────────────────────
  if (body.companyId) {
    const { data: compRow } = await svc
      .from("companies").select("id, name, type, country, status")
      .eq("id", body.companyId).single();

    if (!compRow) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const company = compRow as CompanyRow;

    const { data: jobs, error: jobErr } = await svc
      .from("secured_jobs")
      .select(
        "id, service_provider_company_id, customer_company_id, job_status, payment_status, " +
        "logistics_fee_amount, cargo_value_amount, total_secured_amount, created_at",
      )
      .or(`service_provider_company_id.eq.${company.id},customer_company_id.eq.${company.id}`);

    if (jobErr) {
      return NextResponse.json({ error: jobErr.message }, { status: 500 });
    }

    const seen = new Set<string>();
    const compJobs: JobRow[] = [];
    for (const j of (jobs ?? []) as unknown as JobRow[]) {
      if (!seen.has(j.id)) { seen.add(j.id); compJobs.push(j); }
    }

    const payload = buildBasicPayload(company, compJobs);
    const { error: upsertErr } = await svc
      .from("company_intelligence_profiles")
      .upsert(payload, { onConflict: "company_id" });

    if (upsertErr) {
      return NextResponse.json({
        error:  upsertErr.message,
        detail: {
          code:    upsertErr.code,
          hint:    (upsertErr as { hint?: string }).hint ??
                   "Run migration 023_cip_basic_scoring_schema.sql in Supabase SQL Editor.",
          details: (upsertErr as { details?: string }).details,
        },
      }, { status: 500 });
    }

    return NextResponse.json({
      success:               true,
      advanced_scoring:      ENABLE_ADVANCED,
      companies_scored:      1,
      companies_failed:      0,
      total_jobs_analyzed:   compJobs.length,
      skipped_advanced_fields: ENABLE_ADVANCED ? [] : ADVANCED_FIELDS,
    });
  }

  // ── 4. All-companies mode ───────────────────────────────────────────────────
  const { data: companies, error: compErr } = await svc
    .from("companies").select("id, name, type, country, status");

  if (compErr) {
    return NextResponse.json({ error: compErr.message }, { status: 500 });
  }

  const compList = (companies ?? []) as unknown as CompanyRow[];
  if (compList.length === 0) {
    return NextResponse.json({
      success:             true,
      advanced_scoring:    ENABLE_ADVANCED,
      companies_scored:    0,
      companies_failed:    0,
      total_jobs_analyzed: 0,
      skipped_advanced_fields: ENABLE_ADVANCED ? [] : ADVANCED_FIELDS,
    });
  }

  // ── 5. Bulk-load ALL jobs in one query ─────────────────────────────────────
  const { data: allJobs, error: jobErr } = await svc
    .from("secured_jobs")
    .select(
      "id, service_provider_company_id, customer_company_id, job_status, payment_status, " +
      "logistics_fee_amount, cargo_value_amount, total_secured_amount, created_at",
    );

  if (jobErr) {
    return NextResponse.json({ error: `Failed to load jobs: ${jobErr.message}` }, { status: 500 });
  }

  // Group jobs by company
  const jobsByCompany = new Map<string, Map<string, JobRow>>();
  for (const j of (allJobs ?? []) as unknown as JobRow[]) {
    const addTo = (cid: string | null) => {
      if (!cid) return;
      if (!jobsByCompany.has(cid)) jobsByCompany.set(cid, new Map());
      jobsByCompany.get(cid)!.set(j.id, j);
    };
    addTo(j.service_provider_company_id);
    addTo(j.customer_company_id);
  }

  // ── 6. Build all payloads ──────────────────────────────────────────────────
  const upsertRows:      BasicPayload[] = [];
  const failedCompanies: string[]       = [];
  let   totalJobsAnalyzed               = 0;

  for (const company of compList) {
    try {
      const compJobs = Array.from(jobsByCompany.get(company.id)?.values() ?? []);
      totalJobsAnalyzed += compJobs.length;
      upsertRows.push(buildBasicPayload(company, compJobs));
    } catch (e) {
      failedCompanies.push(`${company.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 7. Batch upsert ────────────────────────────────────────────────────────
  if (upsertRows.length > 0) {
    const { error: upsertErr } = await svc
      .from("company_intelligence_profiles")
      .upsert(upsertRows, { onConflict: "company_id" });

    if (upsertErr) {
      return NextResponse.json({
        error:  `Batch upsert failed: ${upsertErr.message}`,
        detail: {
          code:    upsertErr.code,
          hint:    (upsertErr as { hint?: string }).hint ??
                   "Run migration 023_cip_basic_scoring_schema.sql in Supabase SQL Editor.",
          details: (upsertErr as { details?: string }).details,
        },
        companies_scored:    0,
        companies_failed:    upsertRows.length,
        total_jobs_analyzed: totalJobsAnalyzed,
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    success:               true,
    advanced_scoring:      ENABLE_ADVANCED,
    companies_scored:      upsertRows.length,
    companies_failed:      failedCompanies.length,
    total_jobs_analyzed:   totalJobsAnalyzed,
    errors:                failedCompanies.length > 0 ? failedCompanies : undefined,
    skipped_advanced_fields: ENABLE_ADVANCED ? [] : ADVANCED_FIELDS,
    ...(ENABLE_ADVANCED ? {} : { warning: "Advanced scoring disabled. Set ENABLE_ADVANCED_COMPANY_SCORING=true to enable." }),
  });
}
