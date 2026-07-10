// ─── GET  /api/payment-terms-recommendations  — list (role-scoped)
// ─── POST /api/payment-terms-recommendations  — generate new recommendation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  generateRecommendation,
  PTR_AUDIT_ACTIONS,
  type PTRInput,
  type PaymentTermsRecommendationRow,
} from "@/lib/paymentTermsRecommendation";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url   = new URL(req.url);
  const jobRef = url.searchParams.get("job_reference");
  const quotRef = url.searchParams.get("quotation_reference");
  const limit  = parseInt(url.searchParams.get("limit") ?? "200", 10);

  let q = svc
    .from("payment_terms_recommendations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobRef)  q = q.eq("job_reference", jobRef);
  if (quotRef) q = q.eq("quotation_reference", quotRef);

  // Provider can only see their own
  if (isProvider && caller.companyId) {
    q = q.eq("provider_company_id", caller.companyId);
  }
  // Customer can only see their own
  if (isCustomer && caller.companyId) {
    q = q.eq("customer_company_id", caller.companyId);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST — generate recommendation ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  if (!isAdmin && !isProvider) {
    return NextResponse.json({ error: "Only admins and providers can generate recommendations" }, { status: 403 });
  }

  const body = await req.json() as {
    action?:              string;
    customer_company_id?: string;
    provider_company_id?: string;
    job_reference?:       string;
    quotation_reference?: string;
    rfq_reference?:       string;
    job_value?:           number;
    currency?:            string;
    incoterm?:            string;
    service_type?:        string;
    // Optional override of benchmark data (client can pass pre-fetched scores)
    customer_grade?:      string;
    customer_score?:      number;
    provider_grade?:      string;
    provider_score?:      number;
    route_risk_level?:    string;
    payment_risk_level?:  string;
    document_risk_level?: string;
    overall_trade_risk?:  string;
  };

  if (body.action !== "generate") {
    return NextResponse.json({ error: "Invalid action. Use action: 'generate'" }, { status: 400 });
  }

  const customerCompanyId = body.customer_company_id;
  const providerCompanyId = body.provider_company_id ?? (isProvider ? caller.companyId ?? undefined : undefined);

  // ── Fetch customer benchmark ──────────────────────────────────────────────────
  let customerGrade:           string | null = body.customer_grade ?? null;
  let customerScore:           number | null = body.customer_score ?? null;
  let customerDisputeRate:     number | null = null;
  let customerOverdueRate:     number | null = null;
  let customerPayDispute:      number | null = null;
  let customerAutoConfirm:     number | null = null;

  if (customerCompanyId && !customerGrade) {
    const { data: cbm } = await svc
      .from("customer_performance_benchmarks")
      .select("customer_grade, overall_customer_score, dispute_rate, overdue_payment_rate, payment_dispute_rate, auto_confirmation_rate")
      .eq("customer_company_id", customerCompanyId)
      .maybeSingle();

    if (cbm) {
      customerGrade      = cbm.customer_grade;
      customerScore      = cbm.overall_customer_score;
      customerDisputeRate = cbm.dispute_rate;
      customerOverdueRate = cbm.overdue_payment_rate;
      customerPayDispute  = cbm.payment_dispute_rate;
      customerAutoConfirm = cbm.auto_confirmation_rate;
    }
  }

  // ── Fetch provider benchmark ──────────────────────────────────────────────────
  let providerGrade:    string | null = body.provider_grade ?? null;
  let providerScore:    number | null = body.provider_score ?? null;
  let providerDispute:  number | null = null;
  let providerTracking: number | null = null;

  if (providerCompanyId && !providerGrade) {
    const { data: pbm } = await svc
      .from("provider_performance_benchmarks")
      .select("reliability_grade, overall_provider_score, dispute_rate, tracking_update_score")
      .eq("provider_company_id", providerCompanyId)
      .maybeSingle();

    if (pbm) {
      providerGrade    = pbm.reliability_grade;
      providerScore    = pbm.overall_provider_score;
      providerDispute  = pbm.dispute_rate;
      providerTracking = pbm.tracking_update_score;
    }
  }

  // ── Fetch TIP risk data if job_reference provided ─────────────────────────────
  let routeRisk:    string | null = body.route_risk_level ?? null;
  let paymentRisk:  string | null = body.payment_risk_level ?? null;
  let documentRisk: string | null = body.document_risk_level ?? null;
  let tradeRisk:    string | null = body.overall_trade_risk ?? null;

  if (body.job_reference && !routeRisk) {
    const { data: tip } = await svc
      .from("trade_intelligence_profiles")
      .select("route_risk_level, payment_risk_level, document_risk_level, overall_trade_risk")
      .eq("job_reference", body.job_reference)
      .maybeSingle();

    if (tip) {
      routeRisk    = tip.route_risk_level;
      paymentRisk  = tip.payment_risk_level;
      documentRisk = tip.document_risk_level;
      tradeRisk    = tip.overall_trade_risk;
    }
  }

  // ── Run recommendation engine ────────────────────────────────────────────────
  const ptrInput: PTRInput = {
    customerCompanyId,
    providerCompanyId,
    jobReference:       body.job_reference,
    quotationReference: body.quotation_reference,
    rfqReference:       body.rfq_reference,
    customerGrade,
    customerScore,
    customerDisputeRate:     customerDisputeRate,
    customerOverdueRate:     customerOverdueRate,
    customerPaymentDisputeRate: customerPayDispute,
    customerAutoConfirmRate: customerAutoConfirm,
    providerGrade,
    providerScore,
    providerDisputeRate:  providerDispute,
    providerTrackingScore: providerTracking,
    jobValue:      body.job_value,
    currency:      body.currency ?? "RM",
    incoterm:      body.incoterm,
    serviceType:   body.service_type,
    routeRiskLevel:   routeRisk,
    paymentRiskLevel: paymentRisk,
    documentRiskLevel: documentRisk,
    overallTradeRisk:  tradeRisk,
  };

  const output = generateRecommendation(ptrInput);

  // ── Store in DB ───────────────────────────────────────────────────────────────
  const { data: stored, error: storeErr } = await svc
    .from("payment_terms_recommendations")
    .insert({
      job_reference:          body.job_reference ?? null,
      quotation_reference:    body.quotation_reference ?? null,
      rfq_reference:          body.rfq_reference ?? null,
      customer_company_id:    customerCompanyId ?? null,
      provider_company_id:    providerCompanyId ?? null,
      recommendation_type:    output.recommendation_type,
      recommended_deposit_percentage: output.recommended_deposit_percentage,
      recommended_deposit_amount:     output.recommended_deposit_amount,
      recommended_balance_amount:     output.recommended_balance_amount,
      recommended_release_condition:  output.recommended_release_condition,
      recommended_delivery_confirmation_window_hours: output.recommended_delivery_confirmation_window_hours,
      risk_level:             output.risk_level,
      rationale:              output.rationale,
      key_risk_factors:       output.key_risk_factors,
      customer_score:         customerScore,
      provider_score:         providerScore,
      incoterm:               body.incoterm ?? null,
      job_value:              body.job_value ?? null,
      currency:               body.currency ?? "RM",
      created_by_system:      true,
    })
    .select()
    .single();

  if (storeErr) return NextResponse.json({ error: storeErr.message }, { status: 500 });

  // Audit log
  await insertAuditLogWithClient(svc, {
    job_reference: body.job_reference ?? (customerCompanyId ?? "unknown"),
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        PTR_AUDIT_ACTIONS.generated,
    description:   `Payment terms recommendation generated: ${output.recommendation_type} (${output.recommended_deposit_percentage}% deposit, risk: ${output.risk_level}). Factors: ${output.key_risk_factors.slice(0, 3).join("; ") || "none"}.`,
  }).catch(() => { /* silent */ });

  return NextResponse.json({ success: true, data: stored as PaymentTermsRecommendationRow });
}
