import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { insertAuditLogWithClient }  from "@/lib/auditLog";

// ─── Service-role client ──────────────────────────────────────────────────────

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ─── Admin guard ──────────────────────────────────────────────────────────────

interface AdminActor { id: string; name: string; email: string | null }

async function validateAdmin(req: NextRequest): Promise<AdminActor | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const db = svc();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  const { data: p } = await db
    .from("profiles")
    .select("id, full_name, role, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!p || p.role !== "admin") return null;
  return { id: user.id, name: (p.full_name as string) ?? "Admin", email: user.email ?? null };
}

// ─── Computation helpers ──────────────────────────────────────────────────────

interface JobRow {
  job_reference:                string;
  job_status:                   string;
  payment_status:               string;
  job_value:                    number;
  currency:                     string;
  created_at:                   string;
  service_type:                 string | null;
  route:                        string | null;
  service_provider:             string | null;
  customer:                     string | null;
  service_provider_company_id:  string | null;
  customer_company_id:          string | null;
  pod_uploaded_at:              string | null;
  customer_confirmation_status: string | null;
  auto_confirmed_at:            string | null;
  dispute_status:               string | null;
  delivery_confirmed_at:        string | null;
  current_milestone:            string | null;
}

function clamp0(v: number, max = 1_000_000_000): number {
  return Math.min(max, Math.max(0, v));
}

function topN(
  items: Record<string, unknown>[],
  key: string,
  valueKey: string,
  n = 5,
): { name: string; count: number; total_value: number }[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const item of items) {
    const name = String(item[key] ?? "Unknown");
    if (!name || name === "null" || name === "undefined") continue;
    const e = map.get(name) ?? { count: 0, total: 0 };
    e.count++;
    e.total += Number(item[valueKey] ?? 0);
    map.set(name, e);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
    .map(([name, d]) => ({ name, count: d.count, total_value: Math.round(d.total) }));
}

function groupByMonth(jobs: JobRow[]) {
  const map = new Map<string, { count: number; total_value: number; secured: number; disputed: number }>();
  for (const j of jobs) {
    const m = j.created_at.slice(0, 7);
    const e = map.get(m) ?? { count: 0, total_value: 0, secured: 0, disputed: 0 };
    e.count++;
    e.total_value += Number(j.job_value ?? 0);
    if (["Fully Paid", "Deposit Confirmed", "Payment Secured"].includes(j.payment_status ?? "")) {
      e.secured += Number(j.job_value ?? 0);
    }
    if (j.dispute_status === "Open" || j.job_status === "Disputed") e.disputed++;
    map.set(m, e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, d]) => ({
      month,
      job_count:   d.count,
      total_value: Math.round(d.total_value),
      secured:     Math.round(d.secured),
      disputed:    d.disputed,
    }));
}

function computeRiskFlags(
  jobs: JobRow[],
  totalJobs: number,
  disputedJobs: number,
  monthly: ReturnType<typeof groupByMonth>,
): string[] {
  const flags: string[] = [];

  // High dispute rate
  if (totalJobs > 0 && disputedJobs / totalJobs > 0.10) {
    flags.push("High dispute rate — disputed jobs exceed 10% of total");
  }

  // High transaction growth (last 2 months)
  if (monthly.length >= 2) {
    const last   = monthly[monthly.length - 1];
    const prev   = monthly[monthly.length - 2];
    if (prev.total_value > 0 && last.total_value / prev.total_value > 2) {
      flags.push("High transaction growth — verify legitimacy of volume spike");
    }
  }

  // Jobs stuck in non-terminal state > 30 days (approx — using created_at only)
  const now = Date.now();
  const stuckJobs = jobs.filter(
    (j) =>
      !["Completed", "Cancelled"].includes(j.job_status) &&
      now - new Date(j.created_at).getTime() > 30 * 24 * 60 * 60 * 1000,
  );
  if (stuckJobs.length > 0) {
    flags.push(`${stuckJobs.length} job(s) active for over 30 days — may indicate stalled delivery`);
  }

  // Low payment verification rate
  const paidJobs = jobs.filter((j) =>
    ["Fully Paid", "Deposit Confirmed", "Payment Secured"].includes(j.payment_status ?? ""),
  ).length;
  if (totalJobs > 3 && paidJobs / totalJobs < 0.5) {
    flags.push("Low payment verification rate — fewer than 50% of jobs have confirmed payment");
  }

  // Repeated confirmation delays (POD uploaded but customer not confirmed)
  const podWithoutConfirm = jobs.filter(
    (j) => j.pod_uploaded_at && j.customer_confirmation_status !== "Confirmed" && j.auto_confirmed_at === null,
  ).length;
  if (podWithoutConfirm > 2) {
    flags.push(`${podWithoutConfirm} job(s) with POD uploaded but customer confirmation pending`);
  }

  // No completed jobs with significant volume
  const completedJobs = jobs.filter((j) => j.job_status === "Completed").length;
  const totalValue = jobs.reduce((s, j) => s + Number(j.job_value ?? 0), 0);
  if (completedJobs === 0 && totalValue > 50000) {
    flags.push("High transaction value but no completed jobs — elevated monitoring recommended");
  }

  return flags;
}

// ─── GET /api/admin/company-intelligence-report/[companyId] ──────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;

  const actor = await validateAdmin(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();

  // ── Company (blocking) ────────────────────────────────────────────────────
  const { data: company, error: coErr } = await db
    .from("companies")
    .select("id, name, company_type, email, phone, address, registration_no, is_active, created_at")
    .eq("id", companyId)
    .maybeSingle();

  if (coErr || !company) {
    return NextResponse.json({ error: coErr?.message ?? "Company not found" }, { status: 404 });
  }

  // ── Jobs (blocking — core data source) ───────────────────────────────────
  const { data: rawJobs, error: jobsErr } = await db
    .from("secured_jobs")
    .select([
      "job_reference", "job_status", "payment_status", "job_value", "currency",
      "created_at", "service_type", "route",
      "service_provider", "customer",
      "service_provider_company_id", "customer_company_id",
      "pod_uploaded_at", "customer_confirmation_status",
      "auto_confirmed_at", "dispute_status",
      "delivery_confirmed_at", "current_milestone",
    ].join(", "))
    .or(`service_provider_company_id.eq.${companyId},customer_company_id.eq.${companyId}`)
    .order("created_at", { ascending: false });

  if (jobsErr) {
    return NextResponse.json({ error: `Failed to load jobs: ${jobsErr.message}` }, { status: 500 });
  }

  const jobs = (rawJobs ?? []) as unknown as JobRow[];
  const jobRefs = jobs.map((j) => j.job_reference);

  // ── Optional queries — all in parallel ───────────────────────────────────
  const [
    intelRes,
    provBenchRes,
    custBenchRes,
    payObsRes,
    settlementsRes,
    finScoresRes,
    finOpsRes,
    wcNeedsRes,
    exceptionsRes,
  ] = await Promise.allSettled([
    db.from("company_intelligence_profiles").select("*").eq("company_id", companyId).maybeSingle(),
    db.from("provider_performance_benchmarks").select("*").eq("provider_company_id", companyId).maybeSingle(),
    db.from("customer_performance_benchmarks").select("*").eq("customer_company_id", companyId).maybeSingle(),
    jobRefs.length > 0
      ? db.from("payment_obligations")
          .select("obligation_type, amount, currency, status, created_at, payer_company_id, payee_company_id")
          .in("job_reference", jobRefs.slice(0, 200))
      : Promise.resolve({ data: [], error: null }),
    db.from("release_settlements")
      .select("expected_release_amount, actual_released_amount, currency, settlement_status, released_at, job_reference")
      .eq("payee_company_id", companyId),
    db.from("job_financeability_scores")
      .select("financeability_score, financeability_grade, recommended_amount, recommended_product, pricing_band")
      .eq("company_id", companyId),
    db.from("financing_opportunities")
      .select("opportunity_amount, currency, status")
      .eq("company_id", companyId),
    db.from("working_capital_needs")
      .select("amount, currency, status")
      .eq("company_id", companyId),
    jobRefs.length > 0
      ? db.from("job_exceptions")
          .select("severity, status, exception_type")
          .in("job_reference", jobRefs.slice(0, 200))
      : Promise.resolve({ data: [], error: null }),
  ]);

  function extract<T>(r: PromiseSettledResult<{ data: T | null; error: unknown }>): T | null {
    return r.status === "fulfilled" ? (r.value.data ?? null) : null;
  }
  function extractArr<T>(r: PromiseSettledResult<{ data: T[] | null; error: unknown }>): T[] {
    return r.status === "fulfilled" ? (r.value.data ?? []) : [];
  }

  const intel         = extract(intelRes);
  const provBench     = extract(provBenchRes);
  const custBench     = extract(custBenchRes);
  const payObs        = extractArr(payObsRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>);
  const settlements   = extractArr(settlementsRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>);
  const finScores     = extractArr(finScoresRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>);
  const finOps        = extractArr(finOpsRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>);
  const wcNeeds       = extractArr(wcNeedsRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>);
  const exceptions    = extractArr(exceptionsRes as PromiseSettledResult<{ data: unknown[]; error: unknown }>);

  // ── Compute summary ────────────────────────────────────────────────────────
  const now30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totalJobs      = jobs.length;
  const completedJobs  = jobs.filter((j) => j.job_status === "Completed").length;
  const activeJobs     = jobs.filter((j) => !["Completed", "Cancelled"].includes(j.job_status)).length;
  const cancelledJobs  = jobs.filter((j) => j.job_status === "Cancelled").length;
  const disputedJobs   = jobs.filter(
    (j) => j.job_status === "Disputed" || j.dispute_status === "Open",
  ).length;

  const totalJobValue  = jobs.reduce((s, j) => s + clamp0(Number(j.job_value ?? 0)), 0);
  const currency       = jobs[0]?.currency ?? "MYR";
  const monthlyJobs    = jobs.filter((j) => j.created_at >= now30);
  const monthlyValue   = monthlyJobs.reduce((s, j) => s + clamp0(Number(j.job_value ?? 0)), 0);

  const PAID_STATUSES  = new Set(["Fully Paid", "Deposit Confirmed", "Payment Secured", "Balance Confirmed"]);
  const verifiedJobs   = jobs.filter((j) => PAID_STATUSES.has(j.payment_status ?? ""));
  const totalSecured   = verifiedJobs.reduce((s, j) => s + clamp0(Number(j.job_value ?? 0)), 0);
  const totalReleased  = (settlements as Array<{ actual_released_amount?: number; expected_release_amount?: number }>)
    .reduce((s, st) => s + clamp0(Number(st.actual_released_amount ?? st.expected_release_amount ?? 0)), 0);

  const disputeAmount  = jobs
    .filter((j) => j.dispute_status === "Open" || j.job_status === "Disputed")
    .reduce((s, j) => s + clamp0(Number(j.job_value ?? 0)), 0);

  const summary = {
    total_jobs:              totalJobs,
    completed_jobs:          completedJobs,
    active_jobs:             activeJobs,
    cancelled_jobs:          cancelledJobs,
    disputed_jobs:           disputedJobs,
    total_job_value:         Math.round(totalJobValue),
    currency,
    monthly_job_value:       Math.round(monthlyValue),
    monthly_job_count:       monthlyJobs.length,
    avg_job_value:           totalJobs > 0 ? Math.round(totalJobValue / totalJobs) : 0,
    // Not captured separately — job_value is the total secured logistics fee
    total_logistics_fee:     null as null,
    total_cargo_value:       null as null,
    total_secured_amount:    Math.round(totalSecured),
    total_payment_verified:  verifiedJobs.length,
    total_released:          Math.round(totalReleased),
    outstanding_amount:      Math.round(Math.max(0, totalJobValue - totalSecured)),
    dispute_amount:          Math.round(disputeAmount),
    avg_payment_time_days:   (intel as Record<string, unknown> | null)?.avg_payment_confirmation_days as number | null ?? null,
    avg_delivery_time_days:  (intel as Record<string, unknown> | null)?.avg_execution_completion_days as number | null ?? null,
  };

  // ── Monthly breakdown ─────────────────────────────────────────────────────
  const monthly = groupByMonth(jobs);

  // ── Trade profile ─────────────────────────────────────────────────────────
  const routeCounts = topN(
    jobs.map((j) => ({ route: j.route ?? "Unknown", job_value: j.job_value })),
    "route",
    "job_value",
    8,
  );
  const serviceTypeCounts = topN(
    jobs.map((j) => ({ service_type: j.service_type ?? "Unknown", job_value: j.job_value })),
    "service_type",
    "job_value",
    5,
  );

  const trade = {
    top_routes:        routeCounts,
    service_types:     serviceTypeCounts,
    // Not yet captured in secured_jobs:
    top_origins:        null as null,
    top_destinations:   null as null,
    top_hs_codes:       null as null,
    top_commodities:    null as null,
    avg_cargo_value:    null as null,
    avg_logistics_cost: null as null,
    logistics_pct_cargo: null as null,
    total_weight:       null as null,
    total_volume:       null as null,
  };

  // ── Counterparty profile ──────────────────────────────────────────────────
  const asProvider = jobs.filter((j) => j.service_provider_company_id === companyId);
  const asCustomer = jobs.filter((j) => j.customer_company_id === companyId);

  const counterparties = {
    as_provider: {
      job_count:           asProvider.length,
      top_customers:       topN(asProvider.map((j) => ({ customer: j.customer ?? "Unknown", job_value: j.job_value })), "customer", "job_value"),
      completed_jobs:      asProvider.filter((j) => j.job_status === "Completed").length,
      pod_uploaded_count:  asProvider.filter((j) => j.pod_uploaded_at).length,
      dispute_count:       asProvider.filter((j) => j.dispute_status === "Open").length,
      top_routes:          topN(asProvider.map((j) => ({ route: j.route ?? "Unknown", job_value: j.job_value })), "route", "job_value", 3),
    },
    as_customer: {
      job_count:           asCustomer.length,
      top_providers:       topN(asCustomer.map((j) => ({ service_provider: j.service_provider ?? "Unknown", job_value: j.job_value })), "service_provider", "job_value"),
      confirmed_jobs:      asCustomer.filter((j) => j.customer_confirmation_status === "Confirmed").length,
      auto_confirmed_jobs: asCustomer.filter((j) => j.auto_confirmed_at).length,
      dispute_count:       asCustomer.filter((j) => j.dispute_status === "Open").length,
    },
    // Not yet captured:
    buy_from_countries:  null as null,
    sell_to_countries:   null as null,
  };

  // ── Delivery performance ──────────────────────────────────────────────────
  const delivery = {
    pod_uploaded_count:       jobs.filter((j) => j.pod_uploaded_at).length,
    customer_confirmed_count: jobs.filter((j) => j.customer_confirmation_status === "Confirmed").length,
    auto_confirmed_count:     jobs.filter((j) => j.auto_confirmed_at).length,
    dispute_raised_count:     jobs.filter((j) => j.dispute_status === "Open").length,
    completed_count:          completedJobs,
    delivery_confirmed_count: jobs.filter((j) => j.delivery_confirmed_at).length,
    // Not computed yet (need systematic timestamps):
    avg_days_payment_to_delivery: null as null,
    avg_days_pod_to_confirmation: null as null,
    avg_days_acceptance_to_secured: null as null,
  };

  // ── Payment behaviour ─────────────────────────────────────────────────────
  const payObsArr = payObs as Array<{ status: string; amount: number; obligation_type: string }>;
  const paymentBehaviour = payObs.length > 0 ? {
    available:        true,
    total_obligations: payObsArr.length,
    verified_count:   payObsArr.filter((p) => p.status === "Verified").length,
    pending_count:    payObsArr.filter((p) => p.status === "Pending").length,
    overdue_count:    payObsArr.filter((p) => p.status === "Overdue").length,
    disputed_count:   payObsArr.filter((p) => p.status === "Disputed").length,
    proof_uploaded_count: payObsArr.filter((p) => p.status === "Proof Uploaded").length,
    // Not captured: exact timing, mismatch counts
    avg_proof_upload_hours:    null as null,
    avg_verification_hours:    null as null,
    exact_match_rate:          null as null,
    amount_mismatch_count:     null as null,
    currency_mismatch_count:   null as null,
    late_payment_count:        null as null,
    third_party_count:         null as null,
    duplicate_reference_count: null as null,
  } : { available: false };

  // ── Release settlements ───────────────────────────────────────────────────
  const settArr = settlements as Array<{ settlement_status: string; actual_released_amount?: number; expected_release_amount?: number }>;
  const settlementData = settlements.length > 0 ? {
    available:            true,
    settlement_count:     settArr.length,
    total_released:       Math.round(totalReleased),
    reconciled_count:     settArr.filter((s) => s.settlement_status === "Reconciled").length,
    mismatch_count:       settArr.filter((s) => s.settlement_status === "Amount Mismatch").length,
    failed_count:         settArr.filter((s) => s.settlement_status === "Failed").length,
  } : { available: false };

  // ── Financeability ────────────────────────────────────────────────────────
  const finScoresArr = finScores as Array<{ financeability_score?: number; financeability_grade?: string; recommended_amount?: number; recommended_product?: string }>;
  const finOpsArr    = finOps   as Array<{ opportunity_amount?: number; currency?: string; status?: string }>;
  const wcArr        = wcNeeds  as Array<{ amount?: number; status?: string }>;

  const avgFinScore = finScoresArr.length > 0
    ? Math.round(finScoresArr.reduce((s, f) => s + (f.financeability_score ?? 0), 0) / finScoresArr.length)
    : null;
  const totalOpportunity = finOpsArr.reduce((s, o) => s + clamp0(Number(o.opportunity_amount ?? 0)), 0);
  const totalWcNeed      = wcArr.reduce((s, w) => s + clamp0(Number(w.amount ?? 0)), 0);

  const financeability = {
    available:             finScoresArr.length > 0 || finOpsArr.length > 0,
    avg_score:             avgFinScore,
    top_grade:             finScoresArr[0]?.financeability_grade ?? null,
    scores_count:          finScoresArr.length,
    opportunities_count:   finOpsArr.length,
    total_opportunity:     Math.round(totalOpportunity),
    working_capital_count: wcArr.length,
    total_wc_need:         Math.round(totalWcNeed),
    recommended_product:   finScoresArr[0]?.recommended_product ?? null,
    // From intel:
    readiness:             (intel as Record<string, unknown> | null)?.financing_readiness as string ?? null,
    recommended_terms:     (intel as Record<string, unknown> | null)?.recommended_terms as string ?? null,
  };

  // ── Exceptions ────────────────────────────────────────────────────────────
  const excArr = exceptions as Array<{ severity: string; status: string; exception_type: string }>;
  const activeExceptions = excArr.filter((e) => !["Resolved", "Closed"].includes(e.status));

  const exceptionSummary = {
    total:    excArr.length,
    active:   activeExceptions.length,
    critical: activeExceptions.filter((e) => e.severity === "Critical").length,
    high:     activeExceptions.filter((e) => e.severity === "High").length,
    by_type:  Object.entries(
      activeExceptions.reduce((acc, e) => {
        acc[e.exception_type] = (acc[e.exception_type] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count })),
  };

  // ── Cost breakdown (partially available) ─────────────────────────────────
  const costBreakdown = {
    // Captured:
    total_job_value:      Math.round(totalJobValue),
    total_released:       Math.round(totalReleased),
    // Not captured yet (no separate columns in secured_jobs):
    logistics_fee:         null as null,
    cargo_value:           null as null,
    duty_tax:              null as null,
    insurance:             null as null,
    additional_charges:    null as null,
    platform_fee:          null as null,
    claim_reserve:         null as null,
    net_settlement:        settlements.length > 0 ? Math.round(totalReleased) : null,
  };

  // ── Risk flags ────────────────────────────────────────────────────────────
  const riskFlags = computeRiskFlags(jobs, totalJobs, disputedJobs, monthly);

  // ── Audit log (fire-and-forget) ───────────────────────────────────────────
  void (async () => {
    try {
      await insertAuditLogWithClient(db, {
        job_reference: `COMPANY:${companyId}`,
        actor_id:      actor.id,
        actor_role:    "admin",
        actor_name:    actor.name,
        action:        "company_intelligence_report_viewed",
        description:   `Intelligence report viewed for ${(company as { name: string }).name} (${(company as { company_type: string }).company_type})`,
        metadata:      { companyId, company_name: (company as { name: string }).name },
      });
    } catch { /* non-blocking */ }
  })();

  // ── Response ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    company,
    summary,
    monthly,
    trade,
    counterparties,
    delivery,
    payment_behaviour:   paymentBehaviour,
    settlements:         settlementData,
    cost_breakdown:      costBreakdown,
    financeability,
    exceptions:          exceptionSummary,
    intel,
    provider_benchmark:  provBench,
    customer_benchmark:  custBench,
    risk_flags:          riskFlags,
    // Fields not yet captured in the current data model:
    unavailable_fields: [
      "cargo_value (no separate column in secured_jobs — captured in job_value total)",
      "logistics_fee (no separate column — captured in job_value total)",
      "duty_tax (not captured)",
      "insurance (not captured)",
      "hs_code / commodity (not captured in secured_jobs)",
      "origin_country / destination_country (free-text route only)",
      "weight / volume (not captured)",
      "payment proof upload timestamp (systematic tracking not yet in place)",
      "admin verification timestamp (not captured per obligation)",
      "amount_mismatch_count (not tracked)",
      "currency_mismatch_count (not tracked)",
      "third_party_payment_count (not tracked)",
      "duplicate_reference_count (not tracked)",
      "payout_account_mismatch (not tracked)",
      "platform_fee per job (not stored in job row)",
    ],
    generated_at: new Date().toISOString(),
  });
}

// ─── POST — recalculate score ─────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const actor = await validateAdmin(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();

  // Log the recalculation request
  void (async () => {
    try {
      await insertAuditLogWithClient(db, {
        job_reference: `COMPANY:${companyId}`,
        actor_id:      actor.id,
        actor_role:    "admin",
        actor_name:    actor.name,
        action:        "company_score_recalculated",
        description:   `Intelligence score recalculation triggered for company ${companyId}`,
        metadata:      { companyId, triggered_by: actor.name },
      });
    } catch { /* non-blocking */ }
  })();

  // Tell the client to call the client-side calculateCompanyIntelligence function
  return NextResponse.json({ ok: true, message: "Recalculation triggered — refresh the page" });
}
