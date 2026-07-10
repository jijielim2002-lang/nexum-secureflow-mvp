import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  runCapitalReadinessScoring,
  type AssessmentType,
  type CapitalScoringInput,
} from "@/lib/capitalReadiness";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── POST — run assessment ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const adminId = await validateAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    companyId?:     string;
    jobReference?:  string;
    assessmentType: AssessmentType;
    currency?:      string;
    actorName?:     string;
  };

  const { assessmentType, currency = "RM", actorName = "Admin" } = body;
  let { companyId, jobReference } = body;

  if (!assessmentType) {
    return NextResponse.json({ error: "assessmentType is required" }, { status: 400 });
  }
  if (!companyId && !jobReference) {
    return NextResponse.json({ error: "companyId or jobReference is required" }, { status: 400 });
  }

  // ── Resolve company from jobReference if needed ───────────────────────────
  if (jobReference && !companyId) {
    const { data: job } = await svc
      .from("secured_jobs")
      .select("customer_company_id, service_provider_company_id")
      .eq("job_reference", jobReference)
      .single();
    companyId = job?.customer_company_id ?? job?.service_provider_company_id ?? undefined;
  }

  let companyName: string | null = null;
  if (companyId) {
    const { data: co } = await svc.from("companies").select("name").eq("id", companyId).single();
    companyName = co?.name ?? null;
  }

  // ── Fetch all scoring data ────────────────────────────────────────────────
  const companyFilter = companyId
    ? `service_provider_company_id.eq.${companyId},customer_company_id.eq.${companyId}`
    : `job_reference.eq.${jobReference ?? ""}`;

  const [jobsR, obsR, ciR, docsR, tipR, shipR, membR, excR, bizR] = await Promise.all([
    // All jobs for company
    svc.from("secured_jobs")
      .select("job_status, payment_status, job_value, currency, created_at")
      .or(companyFilter)
      .order("created_at", { ascending: false })
      .limit(100),

    // Payment obligations
    jobReference
      ? svc.from("payment_obligations")
          .select("status, amount, obligation_type, due_date")
          .eq("job_reference", jobReference)
      : svc.from("payment_obligations")
          .select("status, amount, obligation_type, due_date, job_reference"),

    // Company intelligence
    companyId
      ? svc.from("company_intelligence_profiles")
          .select("overall_trust_score, payment_behavior_score, operational_reliability_score, risk_level, trend, financing_readiness")
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Documents
    jobReference
      ? svc.from("documents").select("document_type").eq("job_reference", jobReference)
      : svc.from("documents").select("document_type, job_reference"),

    // Trade Intelligence Profile
    jobReference
      ? svc.from("trade_intelligence_profiles")
          .select("overall_trade_risk, route_risk_level, payment_risk_level")
          .eq("job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Shipment tracking
    jobReference
      ? svc.from("shipment_trackings")
          .select("delay_days, tracking_status")
          .eq("job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Membership
    companyId
      ? svc.from("memberships")
          .select("status, plan")
          .eq("company_id", companyId)
          .eq("status", "Active")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Exceptions
    jobReference
      ? svc.from("job_exceptions").select("severity, status").eq("job_reference", jobReference)
      : svc.from("job_exceptions").select("severity, status"),

    // Business context
    jobReference
      ? svc.from("business_context_profiles")
          .select("margin_percentage, inventory_days_cover, confirmed_order, supply_disruption_risk")
          .eq("job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const scoringInput: CapitalScoringInput = {
    assessmentType,
    currency,
    paymentObligations: (obsR.data ?? []) as CapitalScoringInput["paymentObligations"],
    jobs:               (jobsR.data ?? []) as CapitalScoringInput["jobs"],
    companyIntelligence: ciR.data as CapitalScoringInput["companyIntelligence"] ?? null,
    documents:           (docsR.data ?? []) as CapitalScoringInput["documents"],
    tip:                 tipR.data as CapitalScoringInput["tip"] ?? null,
    shipment:            shipR.data as CapitalScoringInput["shipment"] ?? null,
    membership:          membR.data as CapitalScoringInput["membership"] ?? null,
    exceptions:          (excR.data ?? []) as CapitalScoringInput["exceptions"],
    businessContext:     bizR.data as CapitalScoringInput["businessContext"] ?? null,
  };

  const result = runCapitalReadinessScoring(scoringInput);

  // ── Insert assessment ─────────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await svc
    .from("capital_readiness_assessments")
    .insert({
      job_reference:          jobReference ?? null,
      company_id:             companyId ?? null,
      company_name:           companyName,
      assessment_type:        assessmentType,
      readiness_status:       result.readinessStatus,
      readiness_score:        result.score,
      max_recommended_amount: result.maxRecommendedAmount,
      currency,
      suggested_tenure_days:  result.suggestedTenureDays,
      suggested_pricing_note: result.suggestedPricingNote,
      key_strengths:          result.keyStrengths.join("\n"),
      key_risks:              result.keyRisks.join("\n"),
      required_conditions:    result.requiredConditions.join("\n"),
      source_summary:         result.sourceSummary,
      assessed_by:            adminId,
      assessed_at:            new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditAction =
    result.readinessStatus === "Priority"  ? "capital_opportunity_identified" :
    result.readinessStatus === "Not Ready" ? "capital_assessment_blocked"     :
    "capital_readiness_assessed";

  await svc.from("audit_logs").insert({
    job_reference: jobReference ?? "",
    actor_id:      adminId,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        auditAction,
    description:   `Capital readiness assessed for ${companyName ?? companyId ?? jobReference}: ${result.readinessStatus} (score: ${result.score}) — ${assessmentType}`,
    metadata:      { assessment_id: inserted?.id, score: result.score, status: result.readinessStatus },
  });

  return NextResponse.json({ assessment: inserted, result }, { status: 201 });
}

// ─── GET — list assessments ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url            = new URL(req.url);
  const companyId      = url.searchParams.get("companyId")      ?? undefined;
  const jobReference   = url.searchParams.get("jobReference")   ?? undefined;
  const status         = url.searchParams.get("readinessStatus") ?? undefined;
  const type           = url.searchParams.get("assessmentType") ?? undefined;
  const limit          = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  // Allow both admin (service-role) and anon reads; RLS enforces row visibility
  let q = svc
    .from("capital_readiness_assessments")
    .select("*")
    .order("assessed_at", { ascending: false })
    .limit(limit);

  if (companyId)    q = q.eq("company_id", companyId);
  if (jobReference) q = q.eq("job_reference", jobReference);
  if (status)       q = q.eq("readiness_status", status);
  if (type)         q = q.eq("assessment_type", type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assessments: data ?? [] });
}
