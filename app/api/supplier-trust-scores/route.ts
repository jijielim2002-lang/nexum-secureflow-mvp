// ─── GET /api/supplier-trust-scores ──────────────────────────────────────────
// Query params:
//   ?supplier_id=xxx       → single supplier score
//   ?job_reference=xxx     → scores for all suppliers linked to this job
//   (no filter, admin only) → all scores
//
// POST /api/supplier-trust-scores
// Body: { supplier_id: string }
// Admin only — triggers score recalculation and upsert.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  calculateTrustScore,
  TRUST_AUDIT_ACTIONS,
  type TrustScoreInput,
} from "@/lib/supplierTrustScore";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

interface CallerInfo {
  userId:   string;
  role:     string;
  fullName: string;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const supplierId   = searchParams.get("supplier_id");
  const jobReference = searchParams.get("job_reference");

  let supplierIds: string[] = [];

  if (supplierId) {
    supplierIds = [supplierId];
  } else if (jobReference) {
    // Resolve supplier IDs from job links + protections
    const [linksRes, protRes] = await Promise.all([
      svc.from("job_supplier_links")
        .select("supplier_id")
        .eq("job_reference", jobReference),
      svc.from("supplier_payment_protections")
        .select("supplier_id")
        .eq("job_reference", jobReference)
        .not("supplier_id", "is", null),
    ]);
    const fromLinks = (linksRes.data ?? []).map((r) => r.supplier_id).filter(Boolean) as string[];
    const fromProts = (protRes.data ?? []).map((r) => r.supplier_id).filter(Boolean) as string[];
    supplierIds = [...new Set([...fromLinks, ...fromProts])];
  } else if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const query = svc.from("supplier_trust_scores").select("*");

  if (supplierIds.length > 0) {
    query.in("supplier_id", supplierIds);
  } else {
    // Admin only — return all
    query.order("overall_supplier_trust_score", { ascending: true }).limit(200);
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
  const { supplier_id } = body as { supplier_id?: string };
  if (!supplier_id) return NextResponse.json({ error: "supplier_id required" }, { status: 400 });

  return recalculate(supplier_id, caller.userId, caller.fullName);
}

// ── Recalculation engine ──────────────────────────────────────────────────────

export async function recalculate(
  supplierId: string,
  actorId:   string,
  actorName: string,
): Promise<NextResponse> {

  // 1. Fetch supplier counterparty profile
  const { data: supplier, error: supErr } = await svc
    .from("supplier_counterparties")
    .select("id, supplier_name, supplier_country, supplier_status, risk_level")
    .eq("id", supplierId)
    .single();

  if (supErr || !supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  // 2. Fetch all protection flows for this supplier
  const { data: protections } = await svc
    .from("supplier_payment_protections")
    .select(`
      id, protection_status, job_reference,
      supplier_release_milestones (
        id, milestone_status, evidence_status
      )
    `)
    .eq("supplier_id", supplierId);

  const prots = (protections ?? []) as unknown as Array<{
    id: string; protection_status: string; job_reference: string;
    supplier_release_milestones: Array<{
      id: string; milestone_status: string; evidence_status: string | null;
    }> | null;
  }>;

  const totalProtectionFlows     = prots.length;
  const completedProtectionFlows = prots.filter((p) =>
    ["Fully Released", "Closed"].includes(p.protection_status)
  ).length;
  const activeProtectionFlows    = prots.filter((p) =>
    !["Fully Released", "Closed", "Cancelled"].includes(p.protection_status)
  ).length;
  const disputedFlows = prots.filter((p) =>
    p.protection_status === "Disputed"
  ).length;

  // Flatten milestones
  const allMilestones = prots.flatMap((p) => p.supplier_release_milestones ?? []);
  const totalMilestones    = allMilestones.length;
  const verifiedMilestones = allMilestones.filter((m) =>
    m.milestone_status === "Verified" || m.milestone_status === "Release Eligible" || m.milestone_status === "Released"
  ).length;
  const rejectedMilestones = allMilestones.filter((m) =>
    m.evidence_status === "Rejected"
  ).length;
  const pendingMilestones  = allMilestones.filter((m) =>
    m.milestone_status === "Pending" || m.evidence_status === "Not Uploaded"
  ).length;

  // 3. Total unique jobs
  const { data: jobLinks } = await svc
    .from("job_supplier_links")
    .select("job_reference")
    .eq("supplier_id", supplierId);
  const totalJobs = (jobLinks ?? []).length;

  // 4. Disputes across supplier's jobs
  const jobRefs = prots.map((p) => p.job_reference);
  let extraDisputedJobs = 0;
  if (jobRefs.length > 0) {
    const { data: disputes } = await svc
      .from("dispute_cases")
      .select("id")
      .in("job_reference", jobRefs)
      .not("status", "in", '("Resolved","Closed","Withdrawn")');
    extraDisputedJobs = (disputes ?? []).length;
  }
  const effectiveDisputedFlows = Math.max(disputedFlows, extraDisputedJobs > 0 ? 1 : 0);

  // 5. Document consistency: check for document extractions with conflicts
  //    Approximated as 0.75 (no detailed doc check in v1 — will improve in v2)
  const documentConsistencyScore: number | null =
    totalJobs > 0 ? 0.75 : null;

  // 6. Shipment completion: approximate from job_status of linked jobs
  //    Count completed / total secured_jobs
  let shipmentCompletionScore: number | null = null;
  if (jobRefs.length > 0) {
    const { data: jobs } = await svc
      .from("secured_jobs")
      .select("job_status")
      .in("job_reference", jobRefs);
    if (jobs && jobs.length > 0) {
      const completed = jobs.filter((j) =>
        j.job_status === "Completed" || j.job_status === "Settled"
      ).length;
      shipmentCompletionScore = completed / jobs.length;
    }
  }

  // 7. Calculate score
  const input: TrustScoreInput = {
    supplierStatus:          supplier.supplier_status,
    supplierRiskLevel:       supplier.risk_level ?? "Medium",
    totalProtectionFlows,
    completedProtectionFlows,
    activeProtectionFlows,
    disputedFlows:           effectiveDisputedFlows,
    totalMilestones,
    verifiedMilestones,
    rejectedMilestones,
    pendingMilestones,
    totalJobs,
    documentConsistencyScore,
    shipmentCompletionScore,
  };

  const result = calculateTrustScore(input);

  const now = new Date().toISOString();

  // 8. Fetch previous grade for change detection
  const { data: existing } = await svc
    .from("supplier_trust_scores")
    .select("supplier_grade, overall_supplier_trust_score")
    .eq("supplier_id", supplierId)
    .maybeSingle();

  const previousGrade = existing?.supplier_grade ?? null;
  const gradeChanged  = previousGrade !== null && previousGrade !== result.grade;

  // 9. Upsert
  const { error: upsertErr } = await svc
    .from("supplier_trust_scores")
    .upsert({
      supplier_id:                 supplierId,
      supplier_name:               supplier.supplier_name,
      supplier_country:            supplier.supplier_country,
      total_jobs:                  totalJobs,
      total_protection_flows:      totalProtectionFlows,
      completed_protection_flows:  completedProtectionFlows,
      active_protection_flows:     activeProtectionFlows,
      disputed_flows:              effectiveDisputedFlows,
      verified_milestones:         verifiedMilestones,
      rejected_milestones:         rejectedMilestones,
      average_evidence_confidence: null,
      on_time_milestone_rate:      result.onTimeMilestoneRate / 100,
      document_consistency_score:  documentConsistencyScore,
      evidence_quality_score:      result.evidenceQualityScore / 100,
      shipment_completion_score:   shipmentCompletionScore,
      dispute_score:               result.disputeScore / 100,
      overall_supplier_trust_score: result.overallScore,
      supplier_grade:              result.grade,
      risk_level:                  result.riskLevel,
      recommended_release_model:   result.recommendedReleaseModel,
      recommended_advance_limit:   result.recommendedAdvanceLimit,
      recommended_precaution:      result.recommendedPrecaution,
      last_calculated_at:          now,
      updated_at:                  now,
    }, { onConflict: "supplier_id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // 10. Audit logs (fire-and-forget)
  const supplierRef = `supplier:${supplierId}`;

  insertAuditLogWithClient(svc, {
    job_reference: supplierRef,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        TRUST_AUDIT_ACTIONS.score_calculated,
    description:   `Supplier trust score calculated for ${supplier.supplier_name ?? supplierId}: ${result.overallScore}/100 Grade ${result.grade} (${result.riskLevel}). ${result.scoringNarrative.join("; ")}.`,
  }).catch(() => {});

  if (gradeChanged) {
    insertAuditLogWithClient(svc, {
      job_reference: supplierRef,
      actor_role:    "admin",
      actor_name:    actorName,
      action:        TRUST_AUDIT_ACTIONS.grade_changed,
      description:   `Supplier ${supplier.supplier_name ?? supplierId} grade changed from ${previousGrade} to ${result.grade}.`,
    }).catch(() => {});
  }

  if (result.grade === "Watchlist" || result.grade === "Blocked") {
    insertAuditLogWithClient(svc, {
      job_reference: supplierRef,
      actor_role:    "admin",
      actor_name:    actorName,
      action:        TRUST_AUDIT_ACTIONS.risk_warning_generated,
      description:   `Supplier risk warning — ${supplier.supplier_name ?? supplierId} is ${result.grade}. Precaution: ${result.recommendedPrecaution}`,
    }).catch(() => {});
  }

  return NextResponse.json({
    data: {
      supplierId,
      supplierName:  supplier.supplier_name,
      score:         result.overallScore,
      grade:         result.grade,
      riskLevel:     result.riskLevel,
      releaseModel:  result.recommendedReleaseModel,
      precaution:    result.recommendedPrecaution,
      gradeChanged,
      previousGrade,
    }
  });
}
