import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildExecutiveSummary,
  STANDARD_DOC_TYPES,
  type CreditSummaryData,
  type EvidenceSummaryData,
  type RiskSummaryData,
} from "@/lib/creditPack";

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

// ─── POST — generate credit pack ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const adminId = await validateAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    offerId?:      string;
    assessmentId?: string;
    actorName?:    string;
  };
  const { offerId, assessmentId, actorName = "Admin" } = body;

  if (!offerId && !assessmentId) {
    return NextResponse.json({ error: "offerId or assessmentId is required" }, { status: 400 });
  }

  // ── 1. Fetch offer and/or assessment ────────────────────────────────────────

  const [offerRes, assessRes] = await Promise.all([
    offerId
      ? svc.from("simulated_financing_offers")
          .select("id, job_reference, company_id, company_name, product_type, offer_status, offer_amount, currency, tenure_days, estimated_fee, repayment_source, conditions, risk_notes, expires_at")
          .eq("id", offerId)
          .single()
      : Promise.resolve({ data: null }),
    assessmentId
      ? svc.from("capital_readiness_assessments")
          .select("id, job_reference, company_id, company_name, assessment_type, readiness_status, readiness_score, max_recommended_amount, currency, suggested_tenure_days, key_strengths, key_risks, required_conditions, assessed_at")
          .eq("id", assessmentId)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  // If only offerId given, try to find its latest assessment
  let assessment = assessRes.data as Record<string, unknown> | null;
  const offer    = offerRes.data as Record<string, unknown> | null;

  // Resolve identifiers
  const companyId    = (offer?.company_id    ?? assessment?.company_id)    as string | null;
  const jobReference = (offer?.job_reference ?? assessment?.job_reference) as string | null;
  const companyName  = (offer?.company_name  ?? assessment?.company_name)  as string | null;

  // If we have an offerId but no assessmentId, fetch latest assessment for this job/company
  if (offerId && !assessment && (jobReference || companyId)) {
    let q = svc.from("capital_readiness_assessments")
      .select("id, job_reference, company_id, company_name, assessment_type, readiness_status, readiness_score, max_recommended_amount, currency, suggested_tenure_days, key_strengths, key_risks, required_conditions, assessed_at")
      .order("assessed_at", { ascending: false })
      .limit(1);
    if (jobReference) q = q.eq("job_reference", jobReference);
    else if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.maybeSingle();
    assessment = data as Record<string, unknown> | null;
  }

  // ── 2. Parallel fetch of all supporting data ─────────────────────────────────

  const [intelRes, jobRes, docRes, extRes, shipRes, excRes, payRes, bizRes, tipRes] = await Promise.all([
    // Company intelligence
    companyId
      ? svc.from("company_intelligence_profiles")
          .select("overall_trust_score, payment_behavior_score, operational_reliability_score, risk_level, trend, financing_readiness, critical_exceptions, completed_jobs")
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Job
    jobReference
      ? svc.from("secured_jobs")
          .select("job_reference, service_type, job_status, payment_status, job_value, currency, customer, service_provider, route, current_milestone, created_at")
          .eq("job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Documents
    jobReference
      ? svc.from("documents")
          .select("document_type, uploaded_by_role, file_name, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),

    // Document extractions
    jobReference
      ? svc.from("document_extractions")
          .select("document_type, extraction_status, confidence_score")
          .eq("job_reference", jobReference)
      : Promise.resolve({ data: [] }),

    // Shipment
    jobReference
      ? svc.from("shipment_trackings")
          .select("tracking_status, transport_mode, eta, delay_days, bl_number, awb_number, container_number, vessel_name, flight_number, latest_event, latest_location, data_source, updated_at")
          .eq("job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Exceptions
    jobReference
      ? svc.from("job_exceptions")
          .select("id, exception_type, severity, status, due_date, description")
          .eq("job_reference", jobReference)
          .not("status", "in", '("Resolved","Closed")')
      : Promise.resolve({ data: [] }),

    // Payment obligations
    jobReference
      ? svc.from("payment_obligations")
          .select("id, obligation_type, amount, currency, due_date, status")
          .eq("job_reference", jobReference)
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] }),

    // Business context
    jobReference
      ? svc.from("business_context_profiles")
          .select("supply_disruption_risk, margin_percentage, inventory_days_cover, confirmed_order")
          .eq("job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // Trade intelligence
    jobReference
      ? svc.from("trade_intelligence_profiles")
          .select("estimated_margin, estimated_selling_price, overall_trade_risk")
          .eq("job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ── 3. Assemble credit_summary ────────────────────────────────────────────────

  const intel = intelRes.data as {
    overall_trust_score: number | null;
    payment_behavior_score: number | null;
    operational_reliability_score: number | null;
    risk_level: string | null;
    trend: string | null;
    financing_readiness: string | null;
    critical_exceptions: number | null;
    completed_jobs: number | null;
  } | null;

  const today  = new Date().toISOString().split("T")[0];
  const offerConditions = (offer?.conditions as string | null ?? "").split("\n").filter(Boolean);
  const offerRiskNotes  = (offer?.risk_notes as string | null ?? "").split("\n").filter(Boolean);
  const keyStrengths    = (assessment?.key_strengths    as string | null ?? "").split("\n").filter(Boolean);
  const keyRisks        = (assessment?.key_risks        as string | null ?? "").split("\n").filter(Boolean);
  const requiredConds   = (assessment?.required_conditions as string | null ?? "").split("\n").filter(Boolean);

  const creditSummary: CreditSummaryData = {
    companyName:          companyName,
    productType:          (offer?.product_type ?? assessment?.assessment_type ?? "—") as string,
    recommendedAmount:    (assessment?.max_recommended_amount as number | null) ?? null,
    offerAmount:          (offer?.offer_amount as number | null) ?? null,
    currency:             (offer?.currency ?? assessment?.currency ?? "MYR") as string,
    tenure:               (offer?.tenure_days ?? assessment?.suggested_tenure_days ?? null) as number | null,
    estimatedFee:         (offer?.estimated_fee as number | null) ?? null,
    repaymentSource:      (offer?.repayment_source as string | null) ?? null,
    offerConditions,
    offerRiskNotes,
    readinessScore:       (assessment?.readiness_score as number | null) ?? null,
    readinessStatus:      (assessment?.readiness_status as string | null) ?? null,
    assessmentType:       (assessment?.assessment_type as string | null) ?? null,
    keyStrengths,
    keyRisks,
    requiredConditions:   requiredConds,
    overallTrustScore:            intel?.overall_trust_score ?? null,
    paymentBehaviorScore:         intel?.payment_behavior_score ?? null,
    operationalReliabilityScore:  intel?.operational_reliability_score ?? null,
    riskLevel:            intel?.risk_level ?? null,
    trend:                intel?.trend ?? null,
    financingReadiness:   intel?.financing_readiness ?? null,
    completedJobs:        intel?.completed_jobs ?? null,
    criticalExceptions:   intel?.critical_exceptions ?? null,
  };

  // ── 4. Assemble evidence_summary ─────────────────────────────────────────────

  const job = jobRes.data as {
    job_reference: string; service_type: string; job_status: string; payment_status: string;
    job_value: number; currency: string; customer: string; service_provider: string;
    route: string | null; current_milestone: string; created_at: string;
  } | null;

  const documents = (docRes.data ?? []) as Array<{ document_type: string; uploaded_by_role: string; file_name: string; created_at: string }>;
  const extractions = (extRes.data ?? []) as Array<{ document_type: string; extraction_status: string; confidence_score: number | null }>;

  const verifiedDocTypes = documents.map((d) => d.document_type);
  const verifiedExtractions = extractions.filter((e) => e.extraction_status === "Verified");
  const avgConf = verifiedExtractions.length > 0
    ? verifiedExtractions.reduce((s, e) => s + (e.confidence_score ?? 0), 0) / verifiedExtractions.length
    : null;
  const missingDocTypes = STANDARD_DOC_TYPES.filter(
    (dt) => !verifiedDocTypes.some((vd) => vd.toLowerCase().includes(dt.toLowerCase())),
  );

  const shipment = shipRes.data as {
    tracking_status: string; transport_mode: string; eta: string | null; delay_days: number;
    bl_number: string | null; awb_number: string | null; container_number: string | null;
    vessel_name: string | null; flight_number: string | null; data_source: string | null;
  } | null;

  const payObs = (payRes.data ?? []) as Array<{ id: string; obligation_type: string; amount: number; currency: string; due_date: string | null; status: string }>;
  const pendingObs = payObs.filter((o) => o.status === "Pending" || o.status === "Overdue" || (o.status === "Pending" && o.due_date && o.due_date < today));
  const overdueObs = payObs.filter((o) => o.status === "Overdue" || (o.status === "Pending" && o.due_date && o.due_date < today));
  const verifiedObs = payObs.filter((o) => o.status === "Verified");
  const totalOutstanding = pendingObs.reduce((s, o) => s + Number(o.amount), 0);

  const tip = tipRes.data as { estimated_margin: number | null; estimated_selling_price: number | null; overall_trade_risk: string | null } | null;
  const biz = bizRes.data as { supply_disruption_risk: string | null; margin_percentage: number | null; inventory_days_cover: number | null; confirmed_order: boolean | null } | null;

  const evidenceSummary: EvidenceSummaryData = {
    jobReference:       job?.job_reference       ?? jobReference,
    jobValue:           job?.job_value            ?? null,
    jobCurrency:        job?.currency             ?? null,
    jobStatus:          job?.job_status           ?? null,
    paymentStatus:      job?.payment_status       ?? null,
    customer:           job?.customer             ?? null,
    serviceProvider:    job?.service_provider     ?? null,
    serviceType:        job?.service_type         ?? null,
    route:              job?.route                ?? null,
    commodity:          null, // populated from TIP if available
    verifiedDocTypes,
    extractionAvgConfidence: avgConf,
    missingDocTypes,
    trackingStatus:   shipment?.tracking_status  ?? null,
    delayDays:        shipment?.delay_days       ?? 0,
    eta:              shipment?.eta              ?? null,
    blNumber:         shipment?.bl_number        ?? null,
    awbNumber:        shipment?.awb_number       ?? null,
    containerNumber:  shipment?.container_number ?? null,
    vesselName:       shipment?.vessel_name      ?? null,
    flightNumber:     shipment?.flight_number    ?? null,
    dataSource:       shipment?.data_source      ?? null,
    paymentObRows:    payObs.map((o) => ({
      type: o.obligation_type, amount: Number(o.amount),
      currency: o.currency, status: o.status, dueDate: o.due_date,
    })),
    totalOutstanding,
    overdueCount:        overdueObs.length,
    verifiedObligations: verifiedObs.length,
  };

  // ── 5. Assemble risk_summary ──────────────────────────────────────────────────

  const exceptions = (excRes.data ?? []) as Array<{ id: string; exception_type: string; severity: string; status: string }>;
  const openExc    = exceptions.filter((e) => e.status !== "Resolved" && e.status !== "Closed");
  const critExc    = openExc.filter((e) => e.severity === "Critical");

  const marginPct = biz?.margin_percentage ??
    (tip?.estimated_margin != null && tip?.estimated_selling_price != null && tip.estimated_selling_price > 0
      ? (tip.estimated_margin / tip.estimated_selling_price) * 100
      : null);

  const riskSummary: RiskSummaryData = {
    openExceptions:       openExc.length,
    criticalExceptions:   critExc.length,
    overdueObligations:   overdueObs.length,
    shipmentDelay:        shipment?.delay_days ?? 0,
    exceptionTypes:       [...new Set(openExc.map((e) => e.exception_type))],
    keyRisks,
    requiredConditions:   requiredConds,
    offerRiskNotes,
    supplyDisruptionRisk: biz?.supply_disruption_risk ?? null,
    marginPercentage:     marginPct,
  };

  // ── 6. Build pack title + executive summary ───────────────────────────────────

  const packTitle =
    `Credit Pack — ${companyName ?? "Unknown Company"} — ${creditSummary.productType}` +
    ` — ${new Date().toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`;

  const executiveSummary = buildExecutiveSummary(creditSummary, evidenceSummary, riskSummary);

  // ── 7. Insert credit pack ─────────────────────────────────────────────────────

  const { data: pack, error: insertErr } = await svc
    .from("credit_packs")
    .insert({
      offer_id:               offerId     ?? null,
      assessment_id:          (assessment as Record<string, unknown> | null)?.id as string | null ?? assessmentId ?? null,
      job_reference:          jobReference,
      company_id:             companyId,
      pack_status:            "Generated",
      pack_title:             packTitle,
      executive_summary:      executiveSummary,
      credit_summary:         creditSummary,
      evidence_summary:       evidenceSummary,
      risk_summary:           riskSummary,
      recommended_conditions: requiredConds.join("\n") || null,
      generated_by:           adminId,
      generated_at:           new Date().toISOString(),
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // ── 8. Audit log ──────────────────────────────────────────────────────────────

  await svc.from("audit_logs").insert({
    job_reference: jobReference ?? "",
    actor_id:      adminId,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        "credit_pack_generated",
    description:   `Credit pack generated for ${companyName ?? "unknown"} — ${creditSummary.productType}`,
    metadata:      {
      pack_id:       (pack as Record<string, string>).id,
      offer_id:      offerId ?? null,
      assessment_id: (assessment as Record<string, unknown> | null)?.id ?? assessmentId ?? null,
      company_id:    companyId,
      pack_status:   "Generated",
    },
  });

  return NextResponse.json({ pack }, { status: 201 });
}

// ─── GET — list credit packs ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const adminId = await validateAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url     = new URL(req.url);
  const offerId      = url.searchParams.get("offerId");
  const assessmentId = url.searchParams.get("assessmentId");
  const companyId    = url.searchParams.get("companyId");
  const packStatus   = url.searchParams.get("packStatus");
  const limit        = parseInt(url.searchParams.get("limit") ?? "100");

  let query = svc
    .from("v_credit_packs_summary")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (offerId)      query = query.eq("offer_id",      offerId);
  if (assessmentId) query = query.eq("assessment_id", assessmentId);
  if (companyId)    query = query.eq("company_id",    companyId);
  if (packStatus)   query = query.eq("pack_status",   packStatus);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ packs: data ?? [] });
}
