import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const IS_DEV  = process.env.NODE_ENV !== "production";

// ─── Clients ──────────────────────────────────────────────────────────────────
// authClient: JWT verification only — never used for PostgREST data reads.
// svcClient:  ALL data ops. Pins service-role key on every request, RLS bypassed.

function authClient() {
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function svcClient() {
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

// ─── Timeout helper ───────────────────────────────────────────────────────────
// IMPORTANT: The timer is explicitly cleared in .finally() so it does not keep
// the Node.js event loop alive after the query resolves or rejects.
// Promise.race is correct here: once p settles, the race is settled and any
// later rejection from the timer Promise is silently discarded by the engine.
// This function does NOT always reject — it only rejects if p hasn't resolved
// within ms milliseconds.

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`[${label}] timed out after ${ms / 1000}s`)),
      ms,
    );
  });

  return Promise.race([p, timeout]).finally(() => {
    // Always clear the timer — prevents dangling timers when the query wins the race.
    clearTimeout(timerId);
  }) as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type JobMetrics = {
  total_jobs:             number;
  monthly_jobs:           number;
  completed_jobs:         number;
  active_jobs:            number;
  disputed_jobs:          number;
  total_logistics_fee:    number;
  total_cargo_value:      number;
  total_secured_amount:   number;
  monthly_secured_amount: number;
};

function zeroMetrics(): JobMetrics {
  return {
    total_jobs: 0, monthly_jobs: 0, completed_jobs: 0, active_jobs: 0,
    disputed_jobs: 0, total_logistics_fee: 0, total_cargo_value: 0,
    total_secured_amount: 0, monthly_secured_amount: 0,
  };
}

function n(v: unknown): number { return v != null ? Number(v) : 0; }

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const started = Date.now();
  const warnings: string[] = [];

  // ── Env check ───────────────────────────────────────────────────────────────
  if (!SB_URL || !SVC_KEY) {
    if (IS_DEV) console.warn("[company-intel/list] env vars missing — SUPABASE_URL or SERVICE_ROLE_KEY not set");
    return NextResponse.json({
      ok:    false,
      error: "Server misconfiguration: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
      diagnostics: { companiesCount: 0, jobsCount: 0, profilesCount: 0, warnings: ["env vars missing"] },
    }, { status: 500 });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  // In development: accept x-nexum-dev-bypass: 1 header to skip JWT check.
  // In production: always require a valid Supabase JWT.
  const bypassHeader    = req.headers.get("x-nexum-dev-bypass") === "1";
  const isBypassAllowed = IS_DEV && bypassHeader;

  if (IS_DEV) {
    console.log(`[company-intel/list] GET started — bypass=${isBypassAllowed} url=${SB_URL.slice(0, 30)}… keySet=${!!SVC_KEY}`);
  }

  if (!isBypassAllowed) {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing Authorization header" }, { status: 401 });
    }
    const { data: { user }, error: authErr } = await authClient().auth.getUser(token);
    if (authErr || !user) {
      if (IS_DEV) console.warn("[company-intel/list] auth failed:", authErr?.message);
      return NextResponse.json({
        ok:    false,
        error: authErr?.message ?? "Invalid token",
        diagnostics: { companiesCount: 0, jobsCount: 0, profilesCount: 0, warnings: [] },
      }, { status: 401 });
    }
    if (IS_DEV) console.log("[company-intel/list] auth ok — user:", user.id);
  }

  const coreOnly = req.nextUrl.searchParams.get("coreOnly") === "true";
  if (IS_DEV) console.log(`[company-intel/list] querying — coreOnly=${coreOnly}`);
  const db = svcClient();

  // ── Wrap entire query set in 12-second timeout ─────────────────────────────
  try {
    const result = await raceTimeout(runQueries(db, coreOnly, warnings, started), 12_000, "company-intelligence/list");
    const dur = Date.now() - started;
    if (IS_DEV) {
      console.log(`[company-intel/list] GET completed in ${dur}ms — companies=${result.diagnostics.companiesCount} jobs=${result.diagnostics.jobsCount} profiles=${result.diagnostics.profilesCount}`);
      if (result.diagnostics.warnings.length > 0) {
        console.warn("[company-intel/list] warnings:", result.diagnostics.warnings);
      }
    }
    return NextResponse.json({
      ...result,
      diagnostics: { ...result.diagnostics, durationMs: dur },
    });
  } catch (e) {
    const dur = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    if (IS_DEV) console.error(`[company-intel/list] GET error after ${dur}ms:`, msg);
    return NextResponse.json({
      ok:                   false,
      error:                msg,
      companies:            [],
      metricsByCompanyId:   {},
      profilesByCompanyId:  {},
      scoringAvailable:     false,
      diagnostics: {
        companiesCount: 0,
        jobsCount:      0,
        profilesCount:  0,
        warnings:       [msg],
        durationMs:     dur,
      },
    }, { status: 200 }); // Always 200 so frontend can read the error body
  }
}

// ─── Core query runner ────────────────────────────────────────────────────────

async function runQueries(
  db: ReturnType<typeof svcClient>,
  coreOnly: boolean,
  warnings: string[],
  requestStart: number,
) {
  function elapsed() { return Date.now() - requestStart; }

  // ── 1. Companies ────────────────────────────────────────────────────────────
  const t1 = Date.now();
  if (IS_DEV) console.log(`[company-intel/list] query:companies started @${elapsed()}ms`);

  const { data: companiesRaw, error: compErr } = await db
    .from("companies")
    .select("id, name, type, country, registration_no, status, created_at")
    .order("created_at", { ascending: false });

  if (IS_DEV) {
    console.log(
      `[company-intel/list] query:companies done in ${Date.now() - t1}ms — ` +
      `rows=${companiesRaw?.length ?? 0}${compErr ? ` error="${compErr.message}" code=${compErr.code}` : ""}`,
    );
  }

  if (compErr) {
    return {
      ok:    false,
      error: `companies query failed: ${compErr.message} (code: ${compErr.code})`,
      companies:           [],
      metricsByCompanyId:  {} as Record<string, JobMetrics>,
      profilesByCompanyId: {} as Record<string, Record<string, unknown>>,
      scoringAvailable:    false,
      diagnostics: { companiesCount: 0, jobsCount: 0, profilesCount: 0, warnings },
    };
  }

  type CompRow = {
    id: string; name: string; type: string | null;
    country: string | null; registration_no: string | null;
    status: string | null; created_at: string | null;
  };
  const companies = (companiesRaw ?? []) as CompRow[];

  if (coreOnly) {
    if (IS_DEV) console.log(`[company-intel/list] coreOnly=true — skipping jobs and profiles @${elapsed()}ms`);
    return {
      ok:                  true,
      companies,
      metricsByCompanyId:  {} as Record<string, JobMetrics>,
      profilesByCompanyId: {} as Record<string, Record<string, unknown>>,
      scoringAvailable:    false,
      diagnostics: { companiesCount: companies.length, jobsCount: 0, profilesCount: 0, warnings },
    };
  }

  // ── 2. Secured jobs ─────────────────────────────────────────────────────────
  type JobRow = Record<string, unknown>;
  let jobList: JobRow[] = [];
  let jobsCount = 0;

  const t2 = Date.now();
  if (IS_DEV) console.log(`[company-intel/list] query:secured_jobs started @${elapsed()}ms`);

  try {
    const { data: jobsRaw, error: jobErr } = await db
      .from("secured_jobs")
      .select([
        "service_provider_company_id",
        "customer_company_id",
        "service_provider",
        "customer",
        "logistics_fee_amount",
        "cargo_value_amount",
        "total_secured_amount",
        "job_status",
        "payment_status",
        "current_milestone",
        "risk_level",
        "dispute_status",
        "customer_confirmation_status",
        "created_at",
      ].join(", "));

    if (IS_DEV) {
      console.log(
        `[company-intel/list] query:secured_jobs done in ${Date.now() - t2}ms — ` +
        `rows=${jobsRaw?.length ?? 0}${jobErr ? ` error="${jobErr.message}" code=${jobErr.code}` : ""}`,
      );
    }

    if (jobErr) {
      warnings.push(`secured_jobs: ${jobErr.message} (code: ${jobErr.code})`);
    } else {
      jobList   = (jobsRaw ?? []) as unknown as JobRow[];
      jobsCount = jobList.length;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (IS_DEV) console.error(`[company-intel/list] query:secured_jobs threw after ${Date.now() - t2}ms:`, msg);
    warnings.push(`secured_jobs exception: ${msg}`);
  }

  // ── 3. Company intelligence profiles ────────────────────────────────────────
  const profilesByCompanyId: Record<string, Record<string, unknown>> = {};
  let profilesCount = 0;
  let scoringAvailable = false;

  const t3 = Date.now();
  if (IS_DEV) console.log(`[company-intel/list] query:company_intelligence_profiles started @${elapsed()}ms`);

  try {
    const { data: profilesRaw, error: profErr } = await db
      .from("company_intelligence_profiles")
      .select("*");

    if (IS_DEV) {
      console.log(
        `[company-intel/list] query:company_intelligence_profiles done in ${Date.now() - t3}ms — ` +
        `rows=${profilesRaw?.length ?? 0}${profErr ? ` error="${profErr.message}" code=${profErr.code}` : ""}`,
      );
    }

    if (profErr) {
      const isSchemaError = profErr.code === "42703" || /does not exist/i.test(profErr.message);
      warnings.push(`company_intelligence_profiles: ${profErr.message} (code: ${profErr.code})${isSchemaError ? " — run migration 020_cip_comprehensive_schema.sql" : ""}`);
    } else {
      profilesCount    = profilesRaw?.length ?? 0;
      scoringAvailable = profilesCount > 0;
      for (const row of (profilesRaw ?? []) as Array<{ company_id: string } & Record<string, unknown>>) {
        if (row.company_id) profilesByCompanyId[row.company_id] = row;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (IS_DEV) console.error(`[company-intel/list] query:company_intelligence_profiles threw after ${Date.now() - t3}ms:`, msg);
    warnings.push(`company_intelligence_profiles exception: ${msg}`);
  }

  // ── 4. Compute per-company job metrics ──────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const metricsByCompanyId: Record<string, JobMetrics> = {};

  for (const c of companies) {
    const byComp = jobList.filter((j) =>
      (j.service_provider_company_id && j.service_provider_company_id === c.id) ||
      (j.customer_company_id         && j.customer_company_id         === c.id) ||
      (j.service_provider            && j.service_provider            === c.name) ||
      (j.customer                    && j.customer                    === c.name),
    );

    const recent = byComp.filter((j) =>
      typeof j.created_at === "string" && j.created_at >= thirtyDaysAgo,
    );

    metricsByCompanyId[c.id] = {
      total_jobs:             byComp.length,
      monthly_jobs:           recent.length,
      completed_jobs:         byComp.filter((j) => j.job_status === "Completed").length,
      active_jobs:            byComp.filter((j) =>
        j.job_status === "In Progress" || j.job_status === "Ready for Execution").length,
      disputed_jobs:          byComp.filter((j) =>
        j.job_status === "Disputed" || j.dispute_status === "Open").length,
      total_logistics_fee:    byComp.reduce((s, j) => s + n(j.logistics_fee_amount), 0),
      total_cargo_value:      byComp.reduce((s, j) => s + n(j.cargo_value_amount), 0),
      total_secured_amount:   byComp.reduce((s, j) => s + n(j.total_secured_amount), 0),
      monthly_secured_amount: recent.reduce((s, j) => s + n(j.total_secured_amount), 0),
    };
  }

  // Fill zeros for any company with no jobs
  for (const c of companies) {
    if (!metricsByCompanyId[c.id]) metricsByCompanyId[c.id] = zeroMetrics();
  }

  return {
    ok:                  true,
    companies,
    metricsByCompanyId,
    profilesByCompanyId,
    scoringAvailable,
    diagnostics: {
      companiesCount: companies.length,
      jobsCount,
      profilesCount,
      warnings,
    },
  };
}
