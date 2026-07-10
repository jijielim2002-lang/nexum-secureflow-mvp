// ─── GET  /api/supplier-exposure-limits ───────────────────────────────────────
// Query params:
//   ?supplier_id=xxx          → records for one supplier
//   ?buyer_company_id=xxx     → records for one buyer
//   ?job_reference=xxx        → resolve supplier+buyer from job, return records
//   (no filter, admin only)   → all records
//
// POST /api/supplier-exposure-limits
// Body: { supplier_id: string; buyer_company_id?: string }
// Admin only — triggers recalculation and upsert.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  calculateExposureLimit,
  EXPOSURE_AUDIT_ACTIONS,
  type ExposureLimitInput,
} from "@/lib/supplierExposureLimit";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

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
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const supplierId     = searchParams.get("supplier_id");
  const buyerCompanyId = searchParams.get("buyer_company_id");
  const jobReference   = searchParams.get("job_reference");

  let resolvedSupplierIds: string[] = supplierId ? [supplierId] : [];
  let resolvedBuyerCompanyId: string | null = buyerCompanyId;

  if (jobReference) {
    // Resolve supplier ids from job
    const [linkRes, protRes, jobRes] = await Promise.all([
      svc.from("job_supplier_links").select("supplier_id").eq("job_reference", jobReference),
      svc.from("supplier_payment_protections").select("supplier_id").eq("job_reference", jobReference).not("supplier_id", "is", null),
      svc.from("secured_jobs").select("customer_company_id").eq("job_reference", jobReference).maybeSingle(),
    ]);
    const fromLinks = (linkRes.data ?? []).map((r) => r.supplier_id).filter(Boolean) as string[];
    const fromProts = (protRes.data ?? []).map((r) => r.supplier_id).filter(Boolean) as string[];
    resolvedSupplierIds = [...new Set([...fromLinks, ...fromProts])];
    if (!resolvedBuyerCompanyId && jobRes.data?.customer_company_id) {
      resolvedBuyerCompanyId = jobRes.data.customer_company_id;
    }
  }

  const query = svc.from("supplier_exposure_limits").select("*");

  if (resolvedSupplierIds.length > 0) {
    query.in("supplier_id", resolvedSupplierIds);
  } else if (resolvedBuyerCompanyId) {
    query.eq("buyer_company_id", resolvedBuyerCompanyId);
  } else if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    query.order("exposure_status", { ascending: false }).limit(200);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST (recalculate) ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { supplier_id, buyer_company_id } = body as {
    supplier_id?:     string;
    buyer_company_id?: string;
  };
  if (!supplier_id) return NextResponse.json({ error: "supplier_id required" }, { status: 400 });

  return recalculateExposure(supplier_id, buyer_company_id ?? null, caller.userId, caller.fullName, caller.role);
}

// ── Recalculation engine (exported for re-use) ────────────────────────────────

export async function recalculateExposure(
  supplierId:     string,
  buyerCompanyId: string | null,
  actorId:        string,
  actorName:      string,
  actorRole:      string,
): Promise<NextResponse> {

  // 1. Fetch supplier profile
  const { data: supplier, error: supErr } = await svc
    .from("supplier_counterparties")
    .select("id, supplier_name, supplier_country, supplier_status, risk_level")
    .eq("id", supplierId)
    .single();
  if (supErr || !supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  // 2. Fetch supplier trust score
  const { data: trustRow } = await svc
    .from("supplier_trust_scores")
    .select("overall_supplier_trust_score, supplier_grade, verified_milestones, rejected_milestones, disputed_flows, completed_protection_flows, total_protection_flows")
    .eq("supplier_id", supplierId)
    .maybeSingle();

  const supplierGrade      = trustRow?.supplier_grade ?? "C";
  const supplierTrustScore = trustRow?.overall_supplier_trust_score ?? null;
  const verifiedMilestones = trustRow?.verified_milestones ?? 0;
  const rejectedMilestones = trustRow?.rejected_milestones ?? 0;
  const disputedFlows      = trustRow?.disputed_flows ?? 0;
  const completedFlows     = trustRow?.completed_protection_flows ?? 0;
  const totalFlows         = trustRow?.total_protection_flows ?? 0;

  // 3. Fetch buyer name + payment score
  let buyerName: string | null = null;
  let buyerPaymentScore: number | null = 70; // default

  if (buyerCompanyId) {
    const { data: company } = await svc
      .from("companies")
      .select("name")
      .eq("id", buyerCompanyId)
      .maybeSingle();
    buyerName = company?.name ?? null;

    // Simple payment score: % of payment_obligations for this buyer's jobs that are Verified/Paid
    const { data: obligations } = await svc
      .from("payment_obligations")
      .select("status")
      .in("job_reference",
        svc.from("secured_jobs").select("job_reference").eq("customer_company_id", buyerCompanyId) as unknown as string[]
      );
    if (obligations && obligations.length > 0) {
      const paid = obligations.filter((o) => o.status === "Verified" || o.status === "Paid").length;
      buyerPaymentScore = Math.round((paid / obligations.length) * 100);
    }
  }

  // 4. Fetch open protection flows for this supplier
  const { data: protections } = await svc
    .from("supplier_payment_protections")
    .select("id, protection_status, advance_required_amount, advance_currency, cargo_value_amount, job_reference")
    .eq("supplier_id", supplierId);

  const prots = (protections ?? []) as Array<{
    id: string; protection_status: string;
    advance_required_amount: number | null; advance_currency: string | null;
    cargo_value_amount: number | null; job_reference: string;
  }>;

  const openStatuses = ["Draft","Pending Buyer Funding","Payment Secured","Milestone Release Active","Partially Released"];
  const openProts   = prots.filter((p) => openStatuses.includes(p.protection_status));
  const closedProts = prots.filter((p) => ["Fully Released","Closed","Cancelled"].includes(p.protection_status));

  const currentActiveExposure = openProts.reduce((s, p) => s + (p.advance_required_amount ?? 0), 0);
  const totalHistoricalExposure = prots.reduce((s, p) => s + (p.advance_required_amount ?? 0), 0);
  const openProtectionFlows   = openProts.length;

  // Average cargo value from non-cancelled protections
  const cargoValues = prots
    .filter((p) => p.cargo_value_amount && p.cargo_value_amount > 0)
    .map((p) => p.cargo_value_amount!);
  const averageCargoValue = cargoValues.length > 0
    ? cargoValues.reduce((s, v) => s + v, 0) / cargoValues.length
    : null;

  const currency = openProts[0]?.advance_currency ?? closedProts[0]?.advance_currency ?? "USD";

  // 5. Fetch active disputes
  const jobRefs = prots.map((p) => p.job_reference);
  let activeDisputes = 0;
  if (jobRefs.length > 0) {
    const { data: disputes } = await svc
      .from("dispute_cases")
      .select("id")
      .in("job_reference", jobRefs)
      .not("status", "in", '("Resolved","Closed","Withdrawn")');
    activeDisputes = (disputes ?? []).length;
  }

  // 6. Cargo + country risk from supplier's protections / job data
  let cargoRiskLevel: string | null = null;
  if (supplier.risk_level) {
    cargoRiskLevel = supplier.risk_level === "Critical" || supplier.risk_level === "High"
      ? supplier.risk_level : null;
  }

  // 7. Calculate
  const input: ExposureLimitInput = {
    supplierGrade,
    supplierStatus:      supplier.supplier_status,
    supplierTrustScore,
    verifiedMilestones,
    rejectedMilestones,
    disputedFlows:       Math.max(disputedFlows, activeDisputes > 0 ? 1 : 0),
    completedFlows,
    totalFlows,
    currentActiveExposure,
    averageCargoValue,
    currency,
    buyerPaymentScore,
    cargoRiskLevel,
    customsRiskLevel:   null,
    countryRisk:        null,
  };

  const result = calculateExposureLimit(input);

  const now = new Date().toISOString();

  // 8. Fetch existing record for change detection
  const existingQuery = svc.from("supplier_exposure_limits").select("exposure_status, advance_override_requested").eq("supplier_id", supplierId);
  if (buyerCompanyId) existingQuery.eq("buyer_company_id", buyerCompanyId);
  else existingQuery.is("buyer_company_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const prevStatus   = existing?.exposure_status ?? null;
  const statusChanged = prevStatus !== null && prevStatus !== result.exposureStatus;

  // 9. Upsert
  const upsertPayload: Record<string, unknown> = {
    supplier_id:                        supplierId,
    buyer_company_id:                   buyerCompanyId,
    supplier_name:                      supplier.supplier_name,
    buyer_name:                         buyerName,
    currency,
    recommended_max_advance_amount:     result.recommendedMaxAdvanceAmount,
    recommended_max_advance_percentage: result.recommendedMaxAdvancePercentage,
    current_active_exposure:            currentActiveExposure,
    total_historical_exposure:          totalHistoricalExposure,
    open_protection_flows:              openProtectionFlows,
    active_disputes:                    activeDisputes,
    supplier_trust_score:               supplierTrustScore,
    supplier_grade:                     supplierGrade,
    buyer_payment_score:                buyerPaymentScore,
    risk_level:                         result.riskLevel,
    recommended_release_model:          result.recommendedReleaseModel,
    exposure_status:                    result.exposureStatus,
    rationale:                          result.rationale,
    last_calculated_at:                 now,
    updated_at:                         now,
  };

  // Use upsert by supplier_id + buyer_company_id
  const { error: upsertErr } = await svc
    .from("supplier_exposure_limits")
    .upsert(upsertPayload, {
      onConflict: buyerCompanyId ? "supplier_id,buyer_company_id" : "supplier_id",
      ignoreDuplicates: false,
    });

  if (upsertErr) {
    // If unique constraint fails (e.g., null buyer_company_id can't use composite upsert), try insert/update
    // Check if record exists
    const checkQ = svc.from("supplier_exposure_limits").select("id").eq("supplier_id", supplierId);
    if (buyerCompanyId) checkQ.eq("buyer_company_id", buyerCompanyId);
    else checkQ.is("buyer_company_id", null);
    const { data: check } = await checkQ.maybeSingle();

    if (check?.id) {
      await svc.from("supplier_exposure_limits").update(upsertPayload).eq("id", check.id);
    } else {
      await svc.from("supplier_exposure_limits").insert({ ...upsertPayload, created_at: now });
    }
  }

  // 10. Audit logs (fire-and-forget)
  const supplierRef = `supplier:${supplierId}`;

  insertAuditLogWithClient(svc, {
    job_reference: supplierRef,
    actor_role:    actorRole,
    actor_name:    actorName,
    action:        EXPOSURE_AUDIT_ACTIONS.limit_calculated,
    description:   `Exposure limit calculated for ${supplier.supplier_name ?? supplierId}: ${result.recommendedMaxAdvancePercentage}% max advance${
      result.recommendedMaxAdvanceAmount != null ? ` (${currency} ${result.recommendedMaxAdvanceAmount.toLocaleString()})` : ""
    }. Status: ${result.exposureStatus}. ${result.adjustments.join("; ")}.`,
  }).catch(() => {});

  if (result.exposureStatus === "Exceeds Limit" || result.exposureStatus === "Blocked / Review Required") {
    insertAuditLogWithClient(svc, {
      job_reference: supplierRef,
      actor_role:    actorRole,
      actor_name:    actorName,
      action:        EXPOSURE_AUDIT_ACTIONS.limit_exceeded,
      description:   `Supplier ${supplier.supplier_name ?? supplierId} exposure is ${result.exposureStatus}. Current active: ${currency} ${currentActiveExposure.toLocaleString()}, recommended max: ${
        result.recommendedMaxAdvanceAmount != null ? `${currency} ${result.recommendedMaxAdvanceAmount.toLocaleString()}` : "N/A"
      }. Admin review required.`,
    }).catch(() => {});
  }

  return NextResponse.json({
    data: {
      supplierId,
      buyerCompanyId,
      supplierName:   supplier.supplier_name,
      percentage:     result.recommendedMaxAdvancePercentage,
      maxAmount:      result.recommendedMaxAdvanceAmount,
      currency,
      exposureStatus: result.exposureStatus,
      riskLevel:      result.riskLevel,
      statusChanged,
      previousStatus: prevStatus,
    }
  });
}
