// ─── GET  /api/liability-reviews/[id]   — single review + evidence
// ─── PATCH /api/liability-reviews/[id]  — update review (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  LR_AUDIT_ACTIONS,
  isReleaseBlocked,
  type LiabilityReviewStatus,
  type IncidentType,
  type InsuranceClaimStatus,
} from "@/lib/liabilityReview";

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

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch review
  const { data: review, error: reviewErr } = await svc
    .from("liability_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (reviewErr) return NextResponse.json({ error: reviewErr.message }, { status: 500 });
  if (!review)   return NextResponse.json({ error: "Review not found" }, { status: 404 });

  // Scope check for non-admins
  if (isProvider && caller.companyId && review.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isCustomer && caller.companyId && review.customer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Strip admin-only fields for non-admins
  if (!isAdmin) {
    delete (review as Record<string, unknown>).admin_review_note;
    delete (review as Record<string, unknown>).preliminary_position;
    delete (review as Record<string, unknown>).reviewed_by;
  }

  // Fetch evidence
  const { data: evidence } = await svc
    .from("liability_evidence")
    .select("*")
    .eq("liability_review_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: { review, evidence: evidence ?? [] } });
}

// ── PATCH — update review ──────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can update liability reviews" }, { status: 403 });
  }

  const body = await req.json() as {
    liability_review_status?:   LiabilityReviewStatus;
    incident_type?:             IncidentType;
    claimed_amount?:            number | null;
    currency?:                  string;
    cargo_value?:               number | null;
    liability_limit_note?:      string | null;
    insurance_available?:       boolean | null;
    insurance_policy_reference?: string | null;
    insurance_claim_status?:    InsuranceClaimStatus;
    evidence_summary?:          string | null;
    admin_review_note?:         string | null;
    preliminary_position?:      string | null;
    resolution_note?:           string | null;
  };

  // Fetch existing
  const { data: existing, error: fetchErr } = await svc
    .from("liability_reviews")
    .select("id, job_reference, liability_review_status, insurance_claim_status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  const updatePayload: Record<string, unknown> = { ...body };

  // Handle resolved/closed timestamps
  const newStatus = body.liability_review_status;
  if (newStatus === "Resolved" || newStatus === "Closed") {
    updatePayload.resolved_at = new Date().toISOString();
  }
  if (body.liability_review_status && body.liability_review_status !== "Pending Review") {
    updatePayload.reviewed_by = caller.userId;
    updatePayload.reviewed_at = new Date().toISOString();
  }

  const { data: updated, error: updateErr } = await svc
    .from("liability_reviews")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Determine audit action
  const prevStatus = existing.liability_review_status as LiabilityReviewStatus;
  const action =
    (newStatus === "Resolved" || newStatus === "Closed")
      ? LR_AUDIT_ACTIONS.resolved
      : body.insurance_claim_status && body.insurance_claim_status !== existing.insurance_claim_status
        ? LR_AUDIT_ACTIONS.insurance_status_updated
        : LR_AUDIT_ACTIONS.status_updated;

  const description =
    newStatus && newStatus !== prevStatus
      ? `Liability review status updated: ${prevStatus} → ${newStatus} for job ${existing.job_reference}.${body.preliminary_position ? ` Preliminary position: ${body.preliminary_position}.` : ""}${body.resolution_note ? ` Resolution: ${body.resolution_note}.` : ""}`
      : body.insurance_claim_status
        ? `Insurance claim status updated to "${body.insurance_claim_status}" for job ${existing.job_reference}.`
        : `Liability review updated for job ${existing.job_reference}.`;

  await insertAuditLogWithClient(svc, {
    job_reference: existing.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action,
    description,
  }).catch(() => { /* silent */ });

  // Check if release should be blocked — log separately
  if (newStatus && isReleaseBlocked(newStatus)) {
    await insertAuditLogWithClient(svc, {
      job_reference: existing.job_reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        LR_AUDIT_ACTIONS.release_blocked,
      description:   `Payment release is blocked for job ${existing.job_reference} due to active liability review (status: ${newStatus}). Admin override required to proceed.`,
    }).catch(() => { /* silent */ });
  }

  return NextResponse.json({ success: true, data: updated });
}
