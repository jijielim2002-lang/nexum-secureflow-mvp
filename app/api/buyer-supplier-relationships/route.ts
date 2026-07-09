// ─── GET  /api/buyer-supplier-relationships ───────────────────────────────────
// Query params:
//   ?buyer_company_id=xxx   → records for one buyer
//   ?supplier_id=xxx        → records for one supplier
//   ?job_reference=xxx      → resolve buyer+supplier from job, return record(s)
//   (no filter, admin only) → all records (max 200)
//
// POST /api/buyer-supplier-relationships
// Admin only.
// Body: { buyer_company_id: string; supplier_id: string }
// Triggers recalculation and upsert.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  calculateRelationshipScore,
  deriveRepurchaseFrequency,
  RELATIONSHIP_AUDIT_ACTIONS,
  type RelationshipStatus,
  type RelationshipScoreInput,
} from "@/lib/buyerSupplierRelationship";

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

  const { searchParams } = new URL(req.url);
  const buyerCompanyId = searchParams.get("buyer_company_id");
  const supplierId     = searchParams.get("supplier_id");
  const jobReference   = searchParams.get("job_reference");

  let resolvedBuyerCompanyId: string | null = buyerCompanyId;
  let resolvedSupplierIds: string[] = supplierId ? [supplierId] : [];

  if (jobReference) {
    const [jobRes, linkRes, protRes] = await Promise.all([
      svc.from("secured_jobs").select("customer_company_id").eq("job_reference", jobReference).maybeSingle(),
      svc.from("job_supplier_links").select("supplier_id").eq("job_reference", jobReference),
      svc.from("supplier_payment_protections").select("supplier_id").eq("job_reference", jobReference).not("supplier_id", "is", null),
    ]);
    if (!resolvedBuyerCompanyId && jobRes.data?.customer_company_id) {
      resolvedBuyerCompanyId = jobRes.data.customer_company_id;
    }
    const fromLinks = (linkRes.data ?? []).map((r) => r.supplier_id).filter(Boolean) as string[];
    const fromProts = (protRes.data ?? []).map((r) => r.supplier_id).filter(Boolean) as string[];
    resolvedSupplierIds = [...new Set([...fromLinks, ...fromProts])];
  }

  const query = svc.from("buyer_supplier_relationships").select("*");

  if (resolvedBuyerCompanyId && resolvedSupplierIds.length > 0) {
    query.eq("buyer_company_id", resolvedBuyerCompanyId).in("supplier_id", resolvedSupplierIds);
  } else if (resolvedBuyerCompanyId) {
    query.eq("buyer_company_id", resolvedBuyerCompanyId);
  } else if (resolvedSupplierIds.length > 0) {
    query.in("supplier_id", resolvedSupplierIds);
  } else if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    query.order("relationship_trust_score", { ascending: true }).limit(200);
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
  const { buyer_company_id, supplier_id } = body as {
    buyer_company_id?: string;
    supplier_id?:     string;
  };
  if (!buyer_company_id || !supplier_id) {
    return NextResponse.json({ error: "buyer_company_id and supplier_id required" }, { status: 400 });
  }

  return recalculateRelationship(
    buyer_company_id,
    supplier_id,
    caller.userId,
    caller.fullName,
    caller.role,
  );
}

// ── Recalculation engine (exported for re-use) ────────────────────────────────

export async function recalculateRelationship(
  buyerCompanyId: string,
  supplierId:     string,
  actorId:        string,
  actorName:      string,
  actorRole:      string,
): Promise<NextResponse> {

  // 1. Fetch buyer company
  const { data: buyer, error: buyerErr } = await svc
    .from("companies")
    .select("id, name")
    .eq("id", buyerCompanyId)
    .single();
  if (buyerErr || !buyer) return NextResponse.json({ error: "Buyer not found" }, { status: 404 });

  // 2. Fetch supplier counterparty
  const { data: supplier, error: supErr } = await svc
    .from("supplier_counterparties")
    .select("id, supplier_name, supplier_status")
    .eq("id", supplierId)
    .single();
  if (supErr || !supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  // 3. Find all job_references where this supplier is linked to any job
  const { data: supplierLinks } = await svc
    .from("job_supplier_links")
    .select("job_reference")
    .eq("supplier_id", supplierId);

  const allSupplierJobRefs = (supplierLinks ?? []).map((l) => l.job_reference).filter(Boolean) as string[];

  // Also add job refs from supplier_payment_protections
  const { data: sppJobRefs } = await svc
    .from("supplier_payment_protections")
    .select("job_reference")
    .eq("supplier_id", supplierId);
  const allSPPJobRefs = (sppJobRefs ?? []).map((l) => l.job_reference).filter(Boolean) as string[];
  const allSupplierJobs = [...new Set([...allSupplierJobRefs, ...allSPPJobRefs])];

  type JobRow = {
    job_reference: string;
    job_status: string;
    cargo_value_base_amount: number | null;
    cargo_value_amount: number | null;
    created_at: string;
  };
  let buyerJobs: JobRow[] = [];

  if (allSupplierJobs.length > 0) {
    const { data: jobs } = await svc
      .from("secured_jobs")
      .select("job_reference, job_status, cargo_value_base_amount, cargo_value_amount, created_at")
      .eq("customer_company_id", buyerCompanyId)
      .in("job_reference", allSupplierJobs);
    buyerJobs = (jobs ?? []) as JobRow[];
  }

  const jobRefs = buyerJobs.map((j) => j.job_reference);

  // 4. Fetch SPPs for these jobs (where supplier_id matches)
  type MilestoneRaw = { milestone_status: string; evidence_status: string | null };
  type SPPRaw = {
    advance_required_amount: number | null;
    protection_status: string;
    supplier_release_milestones: MilestoneRaw[] | null;
  };
  let spps: SPPRaw[] = [];

  if (jobRefs.length > 0) {
    const { data: sppData } = await svc
      .from("supplier_payment_protections")
      .select("advance_required_amount, protection_status, supplier_release_milestones(milestone_status, evidence_status)")
      .eq("supplier_id", supplierId)
      .in("job_reference", jobRefs);
    spps = (sppData ?? []) as unknown as SPPRaw[];
  }

  // 5. Fetch disputes for these jobs
  type DisputeRaw = { status: string; claim_amount: number | null };
  let disputes: DisputeRaw[] = [];
  if (jobRefs.length > 0) {
    const { data: dispData } = await svc
      .from("dispute_cases")
      .select("status, claim_amount")
      .in("job_reference", jobRefs);
    disputes = (dispData ?? []) as DisputeRaw[];
  }

  // 6. Fetch delivery confirmations for these jobs
  let deliveries: { status: string }[] = [];
  if (jobRefs.length > 0) {
    const { data: dcData } = await svc
      .from("delivery_confirmations")
      .select("status")
      .in("job_reference", jobRefs);
    deliveries = dcData ?? [];
  }

  // 7. Supplier exposure limit (this buyer + supplier)
  const { data: expLimit } = await svc
    .from("supplier_exposure_limits")
    .select("recommended_max_advance_percentage")
    .eq("supplier_id", supplierId)
    .eq("buyer_company_id", buyerCompanyId)
    .maybeSingle();

  // Fallback to global supplier exposure limit (no buyer filter)
  const { data: expLimitGlobal } = !expLimit
    ? await svc
        .from("supplier_exposure_limits")
        .select("recommended_max_advance_percentage")
        .eq("supplier_id", supplierId)
        .is("buyer_company_id", null)
        .maybeSingle()
    : { data: null };

  const supplierRecommendedAdvancePct =
    expLimit?.recommended_max_advance_percentage ??
    expLimitGlobal?.recommended_max_advance_percentage ??
    null;

  // 8. Calculate metrics
  const completedStatuses = ["Delivered", "Completed", "Closed", "POD Uploaded"];
  const activeStatuses    = ["Active", "In Progress", "Payment Secured", "Awaiting POD"];

  const totalJobs     = buyerJobs.length;
  const completedJobs = buyerJobs.filter((j) => completedStatuses.some((s) => j.job_status.includes(s))).length;
  const activeJobs    = buyerJobs.filter((j) => activeStatuses.some((s) => j.job_status.includes(s))).length;

  const totalCargoValue = buyerJobs.reduce(
    (s, j) => s + (j.cargo_value_base_amount ?? j.cargo_value_amount ?? 0),
    0,
  );
  const averageOrderValue = totalJobs > 0 ? totalCargoValue / totalJobs : null;

  const totalAdvancePaid = spps.reduce((s, p) => s + (p.advance_required_amount ?? 0), 0);
  const averageAdvancePct =
    totalAdvancePaid > 0 && totalCargoValue > 0
      ? Math.round((totalAdvancePaid / totalCargoValue) * 100 * 10) / 10
      : null;

  // Milestones
  const allMilestones = spps.flatMap(
    (p) => (p.supplier_release_milestones ?? []) as MilestoneRaw[],
  );
  const successfulMilestones = allMilestones.filter((m) =>
    ["Verified", "Release Eligible", "Released"].includes(m.milestone_status),
  ).length;
  const rejectedEvidenceCount = allMilestones.filter(
    (m) => m.evidence_status === "Rejected",
  ).length;

  // Disputes
  const activeDisputeStatuses = ["Open", "Under Review", "Pending", "Escalated"];
  const disputedFlows = disputes.filter((d) =>
    !["Resolved", "Closed", "Withdrawn"].includes(d.status),
  ).length;
  const totalDisputedAmount = disputes.reduce((s, d) => s + (d.claim_amount ?? 0), 0);

  // PPP success
  const successfulSPPs = spps.filter((p) =>
    ["Fully Released", "Closed"].includes(p.protection_status),
  ).length;
  const paymentProtectionSuccessRate =
    spps.length > 0 ? successfulSPPs / spps.length : null;

  // On-time delivery
  const onTimeDeliveries = deliveries.filter((d) =>
    ["Confirmed", "Auto Confirmed"].includes(d.status),
  ).length;
  const onTimeDeliveryRate =
    deliveries.length > 0 ? onTimeDeliveries / deliveries.length : null;

  // Transaction dates
  const sortedJobs = [...buyerJobs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const firstTransactionDate = sortedJobs.length > 0 ? sortedJobs[0].created_at.split("T")[0] : null;
  const lastTransactionDate  = sortedJobs.length > 0
    ? sortedJobs[sortedJobs.length - 1].created_at.split("T")[0]
    : null;
  const relationshipYears = firstTransactionDate
    ? Math.round(
        ((Date.now() - new Date(firstTransactionDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)) *
          10,
      ) / 10
    : null;

  // Purchase cycle days
  let purchaseCycleDays: number | null = null;
  if (totalJobs > 1 && firstTransactionDate && lastTransactionDate) {
    const span =
      (new Date(lastTransactionDate).getTime() - new Date(firstTransactionDate).getTime()) /
      (24 * 60 * 60 * 1000);
    purchaseCycleDays = Math.round(span / (totalJobs - 1));
  }
  const repurchaseFrequency = deriveRepurchaseFrequency(purchaseCycleDays);

  // 9. Fetch existing record for prior status
  const { data: existing } = await svc
    .from("buyer_supplier_relationships")
    .select("relationship_status, status_override_by, status_override_at, status_override_reason, recommendation_override_by, recommendation_override_at, recommendation_override_reason, recommendation_override_value")
    .eq("buyer_company_id", buyerCompanyId)
    .eq("supplier_id", supplierId)
    .maybeSingle();

  const priorStatus = (existing?.relationship_status ?? null) as RelationshipStatus | null;

  // 10. Calculate score
  const input: RelationshipScoreInput = {
    totalJobs,
    completedFlows:        completedJobs,
    disputedFlows,
    successfulMilestones,
    rejectedEvidenceCount,
    supplierStatus:        supplier.supplier_status,
    supplierRecommendedAdvancePct,
    priorStatus,
  };
  const result = calculateRelationshipScore(input);

  const now = new Date().toISOString();

  // 11. Upsert — preserve admin overrides
  const upsertPayload: Record<string, unknown> = {
    buyer_company_id:                buyerCompanyId,
    supplier_id:                     supplierId,
    buyer_name:                      buyer.name,
    supplier_name:                   supplier.supplier_name,
    relationship_status:             result.relationshipStatus,
    first_transaction_date:          firstTransactionDate,
    last_transaction_date:           lastTransactionDate,
    relationship_years:              relationshipYears,
    total_jobs:                      totalJobs,
    completed_jobs:                  completedJobs,
    active_jobs:                     activeJobs,
    total_cargo_value:               totalCargoValue,
    total_advance_paid:              totalAdvancePaid,
    total_released_amount:           0,
    total_disputed_amount:           totalDisputedAmount,
    average_advance_percentage:      averageAdvancePct,
    average_order_value:             averageOrderValue,
    repurchase_frequency:            repurchaseFrequency,
    purchase_cycle_days:             purchaseCycleDays,
    successful_milestones:           successfulMilestones,
    disputed_flows:                  disputedFlows,
    rejected_evidence_count:         rejectedEvidenceCount,
    on_time_delivery_rate:           onTimeDeliveryRate,
    payment_protection_success_rate: paymentProtectionSuccessRate,
    relationship_trust_score:        result.relationshipTrustScore,
    recommended_advance_percentage:  result.recommendedAdvancePct,
    recommended_release_model:       result.recommendedReleaseModel,
    last_calculated_at:              now,
    updated_at:                      now,
    // Preserve existing admin overrides
    status_override_by:              existing?.status_override_by ?? null,
    status_override_at:              existing?.status_override_at ?? null,
    status_override_reason:          existing?.status_override_reason ?? null,
    recommendation_override_by:      existing?.recommendation_override_by ?? null,
    recommendation_override_at:      existing?.recommendation_override_at ?? null,
    recommendation_override_reason:  existing?.recommendation_override_reason ?? null,
    recommendation_override_value:   existing?.recommendation_override_value ?? null,
  };

  const { error: upsertErr } = await svc
    .from("buyer_supplier_relationships")
    .upsert(upsertPayload, {
      onConflict:       "buyer_company_id,supplier_id",
      ignoreDuplicates: false,
    });

  if (upsertErr) {
    // Fallback: manual check + insert/update
    const { data: check } = await svc
      .from("buyer_supplier_relationships")
      .select("id")
      .eq("buyer_company_id", buyerCompanyId)
      .eq("supplier_id", supplierId)
      .maybeSingle();

    if (check?.id) {
      await svc.from("buyer_supplier_relationships").update(upsertPayload).eq("id", check.id);
    } else {
      await svc.from("buyer_supplier_relationships").insert({ ...upsertPayload, created_at: now });
    }
  }

  // 12. Audit logs
  const relRef = `buyer-supplier:${buyerCompanyId}:${supplierId}`;

  insertAuditLogWithClient(svc, {
    job_reference: relRef,
    actor_role:    actorRole,
    actor_name:    actorName,
    action:        RELATIONSHIP_AUDIT_ACTIONS.calculated,
    description:   `Buyer-supplier relationship calculated: ${buyer.name} ↔ ${supplier.supplier_name}. Status: ${result.relationshipStatus}. Trust score: ${result.relationshipTrustScore}/100. Recommended advance: ${result.recommendedAdvancePct}%. Jobs: ${totalJobs} total, ${completedJobs} completed, ${disputedFlows} disputed.`,
  }).catch(() => {});

  insertAuditLogWithClient(svc, {
    job_reference: relRef,
    actor_role:    actorRole,
    actor_name:    actorName,
    action:        RELATIONSHIP_AUDIT_ACTIONS.recommendation_generated,
    description:   `Advance recommendation generated: ${result.recommendedAdvancePct}% (${result.recommendedReleaseModel}). Adjustments: ${result.adjustments.join("; ")}.`,
  }).catch(() => {});

  return NextResponse.json({
    data: {
      buyerCompanyId,
      supplierId,
      buyerName:              buyer.name,
      supplierName:           supplier.supplier_name,
      relationshipStatus:     result.relationshipStatus,
      trustScore:             result.relationshipTrustScore,
      recommendedAdvancePct:  result.recommendedAdvancePct,
      recommendedReleaseModel: result.recommendedReleaseModel,
      totalJobs,
      completedJobs,
      disputedFlows,
      adjustments:            result.adjustments,
    },
  });
}
