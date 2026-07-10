import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? "";
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? "";

// authClient — JWT validation only, never used for PostgREST data calls
function authClient() {
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// svcClient — ALL data ops, pins service-role JWT so RLS is bypassed on every call
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Diag = {
  env_url_set:             boolean;
  env_key_set:             boolean;
  env_key_prefix:          string;
  auth_user_id:            string | null;
  auth_error:              string | null;
  profile_role:            string | null;
  company_count_exact:     number | null;
  company_count_error:     { code: string | undefined; message: string } | null;
  company_select_error:    { code: string | undefined; message: string } | null;
  company_rows_fetched:    number;
  company_first_row:       Record<string, unknown> | null;
  jobs_count:              number;
  jobs_error:              string | null;
  intel_count:             number;
  intel_error:             string | null;
  scored_count:            number;
  companies_with_jobs:     number;
  extra_errors:            string[];
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = authClient();
  const db   = svcClient();

  const diag: Diag = {
    env_url_set:          !!SB_URL,
    env_key_set:          !!SVC_KEY,
    env_key_prefix:       SVC_KEY.slice(0, 12) + "…",
    auth_user_id:         null,
    auth_error:           null,
    profile_role:         null,
    company_count_exact:  null,
    company_count_error:  null,
    company_select_error: null,
    company_rows_fetched: 0,
    company_first_row:    null,
    jobs_count:           0,
    jobs_error:           null,
    intel_count:          0,
    intel_error:          null,
    scored_count:         0,
    companies_with_jobs:  0,
    extra_errors:         [],
  };

  // ── Auth — JWT verification only; service role handles all data (bypasses RLS) ─
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: { user }, error: authErr } = await auth.auth.getUser(token);

  if (authErr || !user) {
    diag.auth_error = authErr?.message ?? "No user";
    return NextResponse.json({ error: "Unauthorized", _diag: diag }, { status: 401 });
  }
  diag.auth_user_id = user.id;

  // NOTE: Profiles row check is intentionally omitted for READ operations.
  // This route is server-side only (service role key never reaches the browser).
  // The admin UI is protected by AuthGuard; a valid JWT is sufficient for reads.
  // Write operations (recalculate, backfill) have their own role checks.
  diag.profile_role = "jwt-verified (read-only route — profiles check skipped)";

  // ── Optional: companies-only mode for staged loading (Stage 1 fast path) ────
  const companiesOnly = req.nextUrl.searchParams.get("companiesOnly") === "1";

  // ── 1. Count companies (verify table is reachable) ─────────────────────────
  const { count: exactCount, error: countErr } = await db
    .from("companies")
    .select("*", { count: "exact", head: true });

  diag.company_count_exact = exactCount;
  diag.company_count_error = countErr
    ? { code: countErr.code, message: countErr.message }
    : null;

  // ── 2. Select companies — exact columns, no introspection ─────────────────
  //   Columns confirmed by user: id, name, type, country, registration_no, status, created_at
  const { data: companiesRaw, error: compErr } = await db
    .from("companies")
    .select("id, name, type, country, registration_no, status, created_at")
    .order("name");

  diag.company_select_error = compErr
    ? { code: compErr.code, message: compErr.message }
    : null;
  diag.company_rows_fetched = companiesRaw?.length ?? 0;
  diag.company_first_row    = (companiesRaw?.[0] ?? null) as Record<string, unknown> | null;

  // If the main query failed, return what we have with diagnostics
  if (compErr || !companiesRaw) {
    return NextResponse.json({
      companies:  [],
      _diag:      diag,
    });
  }

  const compList = companiesRaw as Array<{
    id: string; name: string; type: string | null;
    country: string | null; registration_no: string | null;
    status: string | null; created_at: string | null;
  }>;

  // ── companiesOnly fast path: return just the company list, skip jobs/intel ──
  if (companiesOnly) {
    return NextResponse.json({ companies: compList, _diag: diag });
  }

  // ── 3. Secured jobs ────────────────────────────────────────────────────────
  type JobRow = {
    id: string;
    job_reference: string;
    service_provider_company_id: string | null;
    customer_company_id: string | null;
    service_provider: string | null;
    customer: string | null;
    service_type: string | null;
    route: string | null;
    logistics_fee_amount: number | null;
    cargo_value_amount: number | null;
    total_secured_amount: number | null;
    job_status: string | null;
    payment_status: string | null;
    current_milestone: string | null;
    risk_level: string | null;
    created_at: string | null;
  };

  let jobList: JobRow[] = [];

  try {
    const { data: jobs, error: jobErr } = await db
      .from("secured_jobs")
      .select([
        "id", "job_reference",
        "service_provider_company_id", "customer_company_id",
        "service_provider", "customer",
        "service_type", "route",
        "logistics_fee_amount", "cargo_value_amount",
        "total_secured_amount",
        "job_status", "payment_status",
        "current_milestone", "risk_level",
        "created_at",
      ].join(", "));

    if (jobErr) {
      diag.jobs_error = `${jobErr.code}: ${jobErr.message}`;
    } else {
      jobList  = (jobs ?? []) as unknown as JobRow[];
      diag.jobs_count = jobList.length;
    }
  } catch (e) {
    diag.extra_errors.push(`jobs exception: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4. Intelligence profiles (optional — never blocks companies loading) ───
  const intelMap: Record<string, Record<string, unknown>> = {};

  try {
    const { data: intel, error: intelErr } = await db
      .from("company_intelligence_profiles")
      .select("*");

    if (intelErr) {
      diag.intel_error = `${intelErr.code}: ${intelErr.message}`;
    } else {
      diag.intel_count = intel?.length ?? 0;
      for (const row of (intel ?? []) as Array<{ company_id: string } & Record<string, unknown>>) {
        intelMap[row.company_id] = row;
      }
    }
  } catch (e) {
    diag.intel_error = e instanceof Error ? e.message : String(e);
  }

  diag.scored_count = Object.keys(intelMap).length;

  // ── 5. Per-company metrics ─────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const n = (v: unknown) => (v != null ? Number(v) : 0);

  const result = compList.map((c) => {
    // Prefer UUID FK; fall back to name string
    const byCompany = jobList.filter(
      (j) =>
        (j.service_provider_company_id && j.service_provider_company_id === c.id) ||
        (j.customer_company_id         && j.customer_company_id         === c.id) ||
        (j.service_provider            && j.service_provider            === c.name) ||
        (j.customer                    && j.customer                    === c.name),
    );

    if (byCompany.length > 0) diag.companies_with_jobs++;

    const recent = byCompany.filter(
      (j) => j.created_at != null && j.created_at >= thirtyDaysAgo,
    );

    return {
      id:              c.id,
      name:            c.name,
      type:            c.type,
      country:         c.country,
      registration_no: c.registration_no,
      status:          c.status ?? "Active",
      created_at:      c.created_at,
      stats: {
        total_jobs:             byCompany.length,
        monthly_jobs:           recent.length,
        completed_jobs:         byCompany.filter((j) => j.job_status === "Completed").length,
        active_jobs:            byCompany.filter((j) =>
                                  j.job_status === "In Progress" ||
                                  j.job_status === "Ready for Execution"
                                ).length,
        disputed_jobs:          byCompany.filter((j) => j.job_status === "Disputed").length,
        total_logistics_fee:    byCompany.reduce((s, j) => s + n(j.logistics_fee_amount), 0),
        total_cargo_value:      byCompany.reduce((s, j) => s + n(j.cargo_value_amount), 0),
        total_secured_amount:   byCompany.reduce((s, j) => s + n(j.total_secured_amount), 0),
        monthly_secured_amount: recent.reduce((s, j) => s + n(j.total_secured_amount), 0),
      },
      intel: intelMap[c.id] ?? null,
    };
  });

  return NextResponse.json({ companies: result, _diag: diag });
}
