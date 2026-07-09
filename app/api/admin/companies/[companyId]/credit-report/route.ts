import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const IS_DEV  = process.env.NODE_ENV !== "production";

function authClient() {
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function svcClient() {
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: unknown) => (v != null ? Number(v) : 0);

function toGrade(score: number | null): string {
  if (score == null) return "N/A";
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

type SubScore = {
  name: string;
  score: number | null;
  grade: string;
  positives: string[];
  risks: string[];
  unavailable?: boolean;
};

// ─── Score computation ────────────────────────────────────────────────────────

function computeSubScores(
  jobs:              JobRow[],
  hasFinancialInputs: boolean,
  hasMarketInputs:   boolean,
  peerCompletionRate: number | null,
): SubScore[] {
  const total     = jobs.length;
  const completed = jobs.filter((j) => j.job_status === "Completed").length;
  const disputed  = jobs.filter((j) => j.job_status === "Disputed" || j.payment_status === "Disputed").length;
  const verified  = jobs.filter((j) => j.payment_status === "Fully Paid" && j.job_status === "Completed").length;
  const mismatches = jobs.filter((j) => j.job_status === "Completed" && j.payment_status !== "Fully Paid").length;

  // 1. Transaction Strength
  const txStrength: number | null = total === 0 ? null
    : Math.min(100, Math.round((completed / total) * 65 + Math.min(25, total * 5) + 10));

  // 2. Payment Behaviour
  const payBeh: number | null = total === 0 ? null
    : Math.max(0, Math.round((verified / Math.max(completed, 1)) * 100 - mismatches * 15));

  // 3. Delivery Performance
  const delivery: number | null = total === 0 ? null
    : Math.max(0, Math.round((completed / total) * 100 - (disputed / total) * 30));

  // 4. Cash Flow Health — needs financial inputs
  const cfScore: number | null = null; // populated from financial inputs below

  // 5. Margin Health — needs market inputs
  const marginScore: number | null = null;

  // 6. Market Competitiveness — compare vs peer
  let mktScore: number | null = null;
  if (peerCompletionRate != null && total > 0) {
    const myRate = completed / total;
    const diff   = (myRate - peerCompletionRate) * 100;
    mktScore = Math.min(100, Math.max(0, Math.round(50 + diff)));
  }

  // 7. Evidence Quality
  let evid = 10;
  if (total > 0)             evid += 30;
  if (completed > 0)         evid += 20;
  if (hasFinancialInputs)    evid += 25;
  if (hasMarketInputs)       evid += 15;
  evid = Math.min(100, evid);

  return [
    {
      name:      "Transaction Strength",
      score:     txStrength,
      grade:     toGrade(txStrength),
      positives: [
        ...(completed > 0  ? [`${completed} completed job(s) on record`] : []),
        ...(total >= 5     ? [`${total} total transactions — active trade relationship`] : []),
        ...(disputed === 0 && total > 0 ? ["No disputes on record"] : []),
      ],
      risks: [
        ...(total < 3    ? [`Only ${total} transaction(s) — lenders prefer 3+ completed jobs`] : []),
        ...(disputed > 0 ? [`${disputed} dispute(s) — reduces transaction quality score`] : []),
      ],
    },
    {
      name:      "Payment Behaviour",
      score:     payBeh,
      grade:     toGrade(payBeh),
      positives: [
        ...(verified > 0    ? [`${verified} payment(s) fully verified`] : []),
        ...(mismatches === 0 && completed > 0 ? ["All completed jobs have exact payment match"] : []),
      ],
      risks: [
        ...(mismatches > 0 ? [`${mismatches} payment mismatch(es) — completed jobs with unverified payment`] : []),
        ...(verified === 0 && completed > 0 ? ["No fully-verified payments yet"] : []),
      ],
    },
    {
      name:      "Delivery Performance",
      score:     delivery,
      grade:     toGrade(delivery),
      positives: [
        ...(completed > 0 && total > 0 ? [`${Math.round((completed / total) * 100)}% job completion rate`] : []),
        ...(disputed === 0 && total > 0 ? ["Zero dispute rate"] : []),
      ],
      risks: [
        ...(disputed > 0   ? [`${disputed} active dispute(s)`] : []),
        ...(completed < total && total > 0 ? [`${total - completed} incomplete job(s)`] : []),
      ],
    },
    {
      name:      "Cash Flow Health",
      score:     cfScore,
      grade:     toGrade(cfScore),
      positives: [],
      risks:     hasFinancialInputs ? [] : ["No cash-flow data available — add financial inputs"],
      unavailable: !hasFinancialInputs,
    },
    {
      name:      "Margin Health",
      score:     marginScore,
      grade:     toGrade(marginScore),
      positives: [],
      risks:     hasMarketInputs ? [] : ["No margin data available — add market inputs"],
      unavailable: !hasMarketInputs,
    },
    {
      name:  "Market Competitiveness",
      score: mktScore,
      grade: toGrade(mktScore),
      positives: [
        ...(mktScore != null && mktScore >= 60 ? ["Completion rate above peer average"] : []),
      ],
      risks: [
        ...(mktScore == null ? ["Insufficient peer data for benchmarking"] : []),
        ...(mktScore != null && mktScore < 40  ? ["Completion rate below peer average"] : []),
      ],
    },
    {
      name:  "Evidence Quality",
      score: evid,
      grade: toGrade(evid),
      positives: [
        ...(total > 0          ? ["Transaction records in Nexum system"] : []),
        ...(hasFinancialInputs ? ["Financial data provided"] : []),
        ...(hasMarketInputs    ? ["Market/margin data provided"] : []),
      ],
      risks: [
        ...(!hasFinancialInputs ? ["No P&L or balance sheet data"] : []),
        ...(!hasMarketInputs    ? ["No margin or market data"] : []),
        ...(total < 3           ? ["Limited transaction evidence"] : []),
      ],
    },
  ];
}

function computeRiskFlags(
  jobs:              JobRow[],
  hasFinancialInputs: boolean,
  hasMarketInputs:   boolean,
) {
  const flags: Array<{ flag: string; severity: "low" | "medium" | "high"; detail: string }> = [];
  const total      = jobs.length;
  const completed  = jobs.filter((j) => j.job_status === "Completed").length;
  const disputed   = jobs.filter((j) => j.job_status === "Disputed" || j.payment_status === "Disputed").length;
  const mismatches = jobs.filter((j) => j.job_status === "Completed" && j.payment_status !== "Fully Paid").length;
  const totalSecured   = jobs.reduce((s, j) => s + n(j.total_secured_amount), 0);
  const totalCargoVal  = jobs.reduce((s, j) => s + n(j.cargo_value_amount), 0);

  if (total === 0) {
    flags.push({ flag: "No Transaction History", severity: "high", detail: "No secured jobs on record. Minimum 3 completed transactions recommended before lender review." });
    return flags;
  }
  if (total < 3) {
    flags.push({ flag: "Limited Transaction History", severity: "medium", detail: `Only ${total} job(s). Build to 3+ completed transactions for a stronger lender case.` });
  }
  if (disputed > 0) {
    flags.push({ flag: "Active Disputes", severity: "high", detail: `${disputed} job(s) in disputed status. Lenders view unresolved disputes as elevated credit risk.` });
  }
  if (mismatches > 0) {
    flags.push({ flag: "Payment Mismatches", severity: "medium", detail: `${mismatches} completed job(s) with payment not fully verified. Review payment collection process.` });
  }
  if (totalSecured >= 500_000) {
    flags.push({ flag: "High Exposure Concentration", severity: "medium", detail: `Total secured RM ${totalSecured.toLocaleString("en-MY")}. High single-platform exposure.` });
  }
  if (totalCargoVal > 0 && totalCargoVal > totalSecured * 5) {
    flags.push({ flag: "Cargo Value vs Secured Gap", severity: "medium", detail: "Cargo value significantly exceeds secured payment amount — payment protection gap may exist." });
  }
  if (!hasFinancialInputs) {
    flags.push({ flag: "Missing Cash-Flow Data", severity: "low", detail: "No financial inputs on record. Cash-flow analysis unavailable. Add data via the financial inputs form." });
  }
  if (!hasMarketInputs) {
    flags.push({ flag: "Missing Margin Data", severity: "low", detail: "No market/margin inputs. Profitability cannot be assessed until margin data is provided." });
  }
  // Provider concentration
  const providers = new Set(jobs.map((j) => j.service_provider_company_id).filter(Boolean)).size;
  const customers  = new Set(jobs.map((j) => j.customer_company_id).filter(Boolean)).size;
  if (providers === 1 && total >= 3) {
    flags.push({ flag: "Provider Concentration", severity: "low", detail: "All jobs linked to a single service provider. Relationship risk if provider exits platform." });
  }
  if (customers === 1 && total >= 3) {
    flags.push({ flag: "Customer Concentration", severity: "low", detail: "All jobs linked to a single customer. Revenue concentration risk." });
  }
  void completed;
  return flags;
}

function computeRecommendation(
  totalJobs:    number,
  completedJobs: number,
  riskLevel:    string | null,
  finScore:     number | null,
  totalSecured: number,
) {
  if (totalJobs === 0 || finScore == null) {
    return {
      product:         "Not enough data",
      status:          "Not enough data",
      facility_type:   null as string | null,
      suggested_tenor: null as string | null,
      suggested_limit: null as number | null,
      reasoning: "No transaction history. Minimum 1 completed job is required for any indicative assessment.",
    };
  }
  if (riskLevel === "High") {
    return {
      product:         "Not suitable yet",
      status:          "Not suitable yet",
      facility_type:   null as string | null,
      suggested_tenor: null as string | null,
      suggested_limit: null as number | null,
      reasoning: "Active disputes or payment issues present. Resolve before any indicative assessment can proceed.",
    };
  }
  if (riskLevel === "Medium") {
    return {
      product:         "Logistics Working Capital",
      status:          "Requires review",
      facility_type:   "Revolving Credit Facility" as string | null,
      suggested_tenor: "3–6 months" as string | null,
      suggested_limit: Math.round(totalSecured * 0.3) as number | null,
      reasoning: "Medium risk profile with active operations. Document collection and lender review required before simulation.",
    };
  }
  if (completedJobs >= 3 && finScore >= 70) {
    return {
      product:         "Logistics Working Capital",
      status:          "Simulation-ready",
      facility_type:   "Trade Finance / Working Capital Line" as string | null,
      suggested_tenor: "6–12 months" as string | null,
      suggested_limit: Math.round(totalSecured * 0.5) as number | null,
      reasoning: `${completedJobs} completed jobs with verified payment. Profile is indicatively suitable for working capital assessment. Subject to lender review.`,
    };
  }
  return {
    product:         "Logistics Working Capital",
    status:          "Potentially suitable",
    facility_type:   "Working Capital" as string | null,
    suggested_tenor: "3–6 months" as string | null,
    suggested_limit: Math.round(totalSecured * 0.2) as number | null,
    reasoning: "Early-stage transaction history. Continue building track record for a stronger indicative financing case.",
  };
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;

  if (!SB_URL || !SVC_KEY) {
    return NextResponse.json({ ok: false, error: "Server env vars not set" }, { status: 500 });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const isBypass = IS_DEV && req.headers.get("x-nexum-dev-bypass") === "1";
  if (!isBypass) {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: { user }, error: authErr } = await authClient().auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const svc = svcClient();
    const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const db = svcClient();

  // ── 1. Company ──────────────────────────────────────────────────────────────
  const { data: compRow } = await db
    .from("companies")
    .select("id, name, type, country, registration_no, status, created_at")
    .eq("id", companyId)
    .single();

  if (!compRow) return NextResponse.json({ ok: false, error: "Company not found" }, { status: 404 });
  const company = compRow as {
    id: string; name: string; type: string | null; country: string | null;
    registration_no: string | null; status: string | null; created_at: string | null;
  };

  // ── 2. Parallel: profile, jobs, all companies (for peers) ──────────────────
  const [profileRes, jobsRes, allCompRes] = await Promise.all([
    db.from("company_intelligence_profiles")
      .select("risk_level, financeability_score, overall_trust_score, scoring_status, last_calculated_at, total_jobs, completed_jobs, active_jobs, monthly_jobs, total_secured_amount, monthly_secured_amount, total_logistics_fee, total_cargo_value")
      .eq("company_id", companyId)
      .maybeSingle(),
    db.from("secured_jobs")
      .select("id, service_provider_company_id, customer_company_id, job_status, payment_status, logistics_fee_amount, cargo_value_amount, total_secured_amount, created_at")
      .or(`service_provider_company_id.eq.${companyId},customer_company_id.eq.${companyId}`),
    db.from("companies").select("id, type"),
  ]);

  const profile = profileRes.data as {
    risk_level: string | null; financeability_score: number | null;
    overall_trust_score: number | null; scoring_status: string | null;
    last_calculated_at: string | null; total_jobs: number; completed_jobs: number;
    active_jobs: number; monthly_jobs: number; total_secured_amount: number;
    monthly_secured_amount: number; total_logistics_fee: number; total_cargo_value: number;
  } | null;

  // Deduplicate jobs
  const seen = new Set<string>();
  const jobs: JobRow[] = [];
  for (const j of ((jobsRes.data ?? []) as unknown as JobRow[])) {
    if (!seen.has(j.id)) { seen.add(j.id); jobs.push(j); }
  }

  // ── 3. Parallel: financial + market inputs ──────────────────────────────────
  // Both tables may not exist yet (migration 024 not run). Wrap in try/catch so
  // the rest of the report still renders with "data unavailable" notices.
  const [finRes, mktRes] = await Promise.all([
    (async () => {
      try {
        return await db.from("company_financial_inputs")
          .select("period_start, period_end, revenue, gross_profit, gross_margin_percent, net_profit, cash_balance, receivables, payables, bank_facility_limit, bank_facility_used, source_type, note")
          .eq("company_id", companyId)
          .order("period_start", { ascending: false })
          .limit(5);
      } catch { return { data: null }; }
    })(),
    (async () => {
      try {
        return await db.from("company_market_inputs")
          .select("commodity_category, product_description, selling_price, purchase_cost, landed_cost, logistics_cost, duty_tax, margin_percent, competitor_price_low, competitor_price_high, market_note, source_type")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(5);
      } catch { return { data: null }; }
    })(),
  ]);

  const financialInputs = ((finRes.data ?? []) as Record<string, unknown>[]);
  const marketInputs    = ((mktRes.data ?? []) as Record<string, unknown>[]);

  // ── 4. Peer stats (same company type) ──────────────────────────────────────
  const sameTypeIds = (allCompRes.data ?? [])
    .filter((c: { id: string; type: string | null }) => c.type === company.type && c.id !== companyId)
    .map((c: { id: string }) => c.id);

  let peerStats: { peer_count: number; avg_completion_rate: number; avg_logistics_fee: number; avg_secured_amount: number } | null = null;

  if (sameTypeIds.length > 0) {
    const { data: peerJobs } = await db
      .from("secured_jobs")
      .select("service_provider_company_id, customer_company_id, job_status, logistics_fee_amount, total_secured_amount")
      .in("service_provider_company_id", sameTypeIds.slice(0, 50));

    if (peerJobs && peerJobs.length > 0) {
      const pj = peerJobs as Array<{ job_status: string | null; logistics_fee_amount: number | null; total_secured_amount: number | null }>;
      const peerCompleted = pj.filter((j) => j.job_status === "Completed").length;
      peerStats = {
        peer_count:          sameTypeIds.length,
        avg_completion_rate: pj.length > 0 ? peerCompleted / pj.length : 0,
        avg_logistics_fee:   pj.reduce((s, j) => s + n(j.logistics_fee_amount), 0) / pj.length,
        avg_secured_amount:  pj.reduce((s, j) => s + n(j.total_secured_amount), 0) / pj.length,
      };
    }
  }

  // ── 5. Compute all metrics ──────────────────────────────────────────────────
  const THIRTY_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const totalJobs      = jobs.length;
  const completedJobs  = jobs.filter((j) => j.job_status === "Completed").length;
  const activeJobs     = jobs.filter((j) => !["Completed", "Cancelled"].includes(j.job_status ?? "")).length;
  const monthlyJobs    = jobs.filter((j) => j.created_at && j.created_at >= THIRTY_AGO).length;
  const disputedJobs   = jobs.filter((j) => j.job_status === "Disputed" || j.payment_status === "Disputed").length;
  const verifiedJobs   = jobs.filter((j) => j.payment_status === "Fully Paid" && j.job_status === "Completed").length;
  const mismatches     = jobs.filter((j) => j.job_status === "Completed" && j.payment_status !== "Fully Paid").length;
  const totalSecured   = jobs.reduce((s, j) => s + n(j.total_secured_amount), 0);
  const monthlySecured = jobs.filter((j) => j.created_at && j.created_at >= THIRTY_AGO).reduce((s, j) => s + n(j.total_secured_amount), 0);
  const totalLogFee    = jobs.reduce((s, j) => s + n(j.logistics_fee_amount), 0);
  const totalCargoVal  = jobs.reduce((s, j) => s + n(j.cargo_value_amount), 0);
  const sortedDates    = jobs.map((j) => j.created_at).filter(Boolean).sort() as string[];
  const firstJobAt     = sortedDates[0] ?? null;
  const lastJobAt      = sortedDates[sortedDates.length - 1] ?? null;
  const monthsActive   = firstJobAt ? Math.max(1, Math.round((Date.now() - new Date(firstJobAt).getTime()) / (30 * 24 * 60 * 60 * 1000))) : null;

  const subScores = computeSubScores(
    jobs,
    financialInputs.length > 0,
    marketInputs.length > 0,
    peerStats?.avg_completion_rate ?? null,
  );
  const availScores = subScores.map((s) => s.score).filter((s): s is number => s != null);
  const overallScore = availScores.length > 0 ? Math.round(availScores.reduce((a, b) => a + b, 0) / availScores.length) : null;

  const riskLevel = profile?.risk_level ?? (totalJobs === 0 ? "Not Available" : disputedJobs > 0 ? "High" : "Medium");
  const finScore  = profile?.financeability_score ?? null;

  const riskFlags    = computeRiskFlags(jobs, financialInputs.length > 0, marketInputs.length > 0);
  const recommendation = computeRecommendation(totalJobs, completedJobs, riskLevel, finScore, totalSecured);

  // ── 6. Required documents checklist ─────────────────────────────────────────
  const requiredDocs = [
    "SSM / Company Registration Certificate",
    "Director & Shareholder Information",
    "Bank Statements (6–12 months)",
    "Financial Statements or Management Accounts",
    "Invoices / Purchase Orders / Contracts",
    "Debtor Aging Schedule",
    "Creditor Aging Schedule",
    "Inventory List (if applicable)",
    "Existing Loan / Facility Disclosure",
    "Tax Documents (if available)",
    "CTOS / CCRIS Report (if applicable)",
    "AML / KYC Documents",
  ];

  // ── 7. Response ─────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok:         true,
    reportDate: new Date().toISOString(),
    company,
    profile,
    scores: {
      overall:    overallScore,
      sub_scores: subScores,
    },
    jobStats: {
      total:        totalJobs,
      completed:    completedJobs,
      active:       activeJobs,
      monthly:      monthlyJobs,
      disputed:     disputedJobs,
      payment_verified: verifiedJobs,
      payment_mismatches: mismatches,
      total_secured:    totalSecured,
      monthly_secured:  monthlySecured,
      total_logistics_fee: totalLogFee,
      total_cargo_value:   totalCargoVal,
      avg_transaction_size: totalJobs > 0 ? Math.round(totalSecured / totalJobs) : null,
      first_job_at:  firstJobAt,
      last_job_at:   lastJobAt,
      months_active: monthsActive,
      jobs_per_month: monthsActive && totalJobs > 0 ? Math.round((totalJobs / monthsActive) * 10) / 10 : null,
    },
    paymentBehaviour: {
      verified_jobs:    verifiedJobs,
      mismatches,
      verification_rate: completedJobs > 0 ? Math.round((verifiedJobs / completedJobs) * 100) : null,
      score: subScores.find((s) => s.name === "Payment Behaviour")?.score ?? null,
    },
    deliveryPerf: {
      completed:       completedJobs,
      disputed:        disputedJobs,
      completion_rate: totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : null,
      score:           subScores.find((s) => s.name === "Delivery Performance")?.score ?? null,
    },
    riskFlags,
    peerStats,
    recommendation,
    financialInputs,
    marketInputs,
    requiredDocs,
    dataAvailability: {
      has_profile:         !!profile,
      has_jobs:            totalJobs > 0,
      has_financial_inputs: financialInputs.length > 0,
      has_market_inputs:   marketInputs.length > 0,
      has_peers:           (peerStats?.peer_count ?? 0) > 0,
    },
  });
}
