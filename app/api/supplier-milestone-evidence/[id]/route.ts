// ─── PATCH /api/supplier-milestone-evidence/[id]
// Admin: verify, reject, or request more evidence for a milestone evidence item.
// Automatically sets milestone release eligibility when criteria are met.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  SMEV_AUDIT_ACTIONS,
  SMEV_COMPLIANCE_WORDING,
  isReleaseEligible,
} from "@/lib/supplierMilestoneEvidence";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
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
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admin can review milestone evidence" }, { status: 403 });
  }

  const body = await req.json() as {
    action:            "verify" | "reject" | "request_more";
    review_note?:      string;
    rejection_reason?: string;
    release_blocker_note?: string;
  };

  if (!body.action) {
    return NextResponse.json({ error: "action is required (verify | reject | request_more)" }, { status: 400 });
  }

  // Fetch evidence item + milestone + protection
  const { data: item, error: fetchErr } = await svc
    .from("supplier_milestone_evidence_items")
    .select(`
      id, milestone_id, job_reference, evidence_type, verification_status,
      supplier_release_milestones (
        id, milestone_name, milestone_status, evidence_status, protection_id,
        supplier_payment_protections (
          id, protection_status, supplier_name,
          supplier_id,
          supplier_counterparties: supplier_id (
            supplier_status
          )
        )
      )
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !item) {
    return NextResponse.json({ error: "Evidence item not found" }, { status: 404 });
  }

  // Type-narrow joined data
  const milestone = item.supplier_release_milestones as unknown as {
    id: string; milestone_name: string | null; milestone_status: string;
    evidence_status: string; protection_id: string;
    supplier_payment_protections: {
      id: string; protection_status: string; supplier_name: string | null;
      supplier_id: string | null;
      supplier_counterparties: { supplier_status: string } | null;
    } | null;
  } | null;

  if (!milestone) {
    return NextResponse.json({ error: "Associated milestone not found" }, { status: 404 });
  }

  const protection = milestone.supplier_payment_protections;
  const jobRef: string = item.job_reference;
  const milestoneName: string = milestone.milestone_name ?? "Unnamed";
  const supplierName: string = protection?.supplier_name ?? "—";
  const now = new Date().toISOString();

  // Check for open dispute on protection
  const { data: openDispute } = await svc
    .from("dispute_cases")
    .select("id")
    .eq("job_reference", jobRef)
    .in("status", ["Open", "Under Review", "Pending Admin"])
    .limit(1)
    .maybeSingle();

  const hasOpenDispute = !!openDispute;

  // Check supplier blocked status
  const supplierStatus = (milestone.supplier_payment_protections as unknown as { supplier_counterparties?: { supplier_status: string } | null })?.supplier_counterparties?.supplier_status ?? null;
  const supplierBlocked = supplierStatus === "Blocked";

  let evidenceItemUpdate: Record<string, unknown> = {};
  let milestoneUpdate: Record<string, unknown> = { updated_at: now };
  let auditAction: string = SMEV_AUDIT_ACTIONS.evidence_verified;
  let auditDesc = "";
  let notifyRole = "admin";
  let notifyTitle = "";
  let notifyMessage = "";
  let notifyPriority = "medium";

  switch (body.action) {

    case "verify": {
      // Update evidence item
      evidenceItemUpdate = { verification_status: "Verified" };

      // Update milestone evidence_status
      milestoneUpdate.evidence_status = "Verified";
      milestoneUpdate.reviewed_by     = caller.userId;
      milestoneUpdate.reviewed_at     = now;
      if (body.review_note) milestoneUpdate.review_note = body.review_note;

      // Check release eligibility
      const protectionStatus = protection?.protection_status ?? "Draft";
      const eligible = isReleaseEligible("Verified", protectionStatus, hasOpenDispute || supplierBlocked);

      if (eligible) {
        milestoneUpdate.milestone_status = "Release Eligible";
        auditAction = SMEV_AUDIT_ACTIONS.release_eligible;
        auditDesc = `Evidence verified and milestone "${milestoneName}" marked Release Eligible for supplier "${supplierName}" on job ${jobRef}. ${SMEV_COMPLIANCE_WORDING.release_eligible}`;
        notifyTitle = `Milestone Release Eligible — ${milestoneName}`;
        notifyMessage = `Evidence for "${milestoneName}" has been verified. Milestone is now Release Eligible. Manual release instruction required.`;
        notifyPriority = "high";
      } else {
        milestoneUpdate.milestone_status = "Verified";
        const blockerNote = hasOpenDispute
          ? "Open dispute — release blocked pending resolution."
          : supplierBlocked
          ? "Supplier is Blocked — admin override required before release."
          : `Protection status is "${protectionStatus}" — release eligible only when Payment Secured or Milestone Release Active.`;
        milestoneUpdate.release_blocker_note = blockerNote;
        auditAction = SMEV_AUDIT_ACTIONS.evidence_verified;
        auditDesc = `Evidence verified for milestone "${milestoneName}" on job ${jobRef}. Milestone set to Verified (not yet Release Eligible). Reason: ${blockerNote} ${SMEV_COMPLIANCE_WORDING.workflow_only}`;
        notifyTitle = `Evidence Verified — ${milestoneName}`;
        notifyMessage = `Evidence for "${milestoneName}" is verified. Release is pending: ${blockerNote}`;
      }
      break;
    }

    case "reject": {
      if (!body.rejection_reason) {
        return NextResponse.json({ error: "rejection_reason is required when rejecting evidence" }, { status: 400 });
      }
      evidenceItemUpdate = { verification_status: "Rejected" };
      milestoneUpdate.evidence_status  = "Rejected";
      milestoneUpdate.milestone_status = "Pending";
      milestoneUpdate.rejection_reason = body.rejection_reason;
      milestoneUpdate.reviewed_by      = caller.userId;
      milestoneUpdate.reviewed_at      = now;
      if (body.review_note) milestoneUpdate.review_note = body.review_note;

      auditAction = SMEV_AUDIT_ACTIONS.evidence_rejected;
      auditDesc   = `Evidence rejected for milestone "${milestoneName}" on job ${jobRef}. Reason: ${body.rejection_reason}. ${SMEV_COMPLIANCE_WORDING.rejection_notice}`;
      notifyRole  = "customer";
      notifyTitle = `Evidence Rejected — ${milestoneName}`;
      notifyMessage = `Evidence submitted for "${milestoneName}" has been rejected. Reason: ${body.rejection_reason}. Please resubmit corrected evidence.`;
      notifyPriority = "high";
      break;
    }

    case "request_more": {
      evidenceItemUpdate = { verification_status: "Needs Review" };
      milestoneUpdate.evidence_status  = "More Evidence Required";
      milestoneUpdate.milestone_status = "Pending";
      milestoneUpdate.reviewed_by      = caller.userId;
      milestoneUpdate.reviewed_at      = now;
      if (body.review_note)           milestoneUpdate.review_note = body.review_note;
      if (body.release_blocker_note)  milestoneUpdate.release_blocker_note = body.release_blocker_note;

      auditAction = SMEV_AUDIT_ACTIONS.more_evidence_required;
      auditDesc   = `Additional evidence requested for milestone "${milestoneName}" on job ${jobRef}. ${body.review_note ? `Note: ${body.review_note}. ` : ""}${SMEV_COMPLIANCE_WORDING.more_evidence}`;
      notifyRole  = "customer";
      notifyTitle = `More Evidence Required — ${milestoneName}`;
      notifyMessage = `Additional evidence is required for "${milestoneName}".${body.review_note ? ` Admin note: ${body.review_note}` : ""} Please upload supplementary documentation.`;
      notifyPriority = "high";
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }

  // Apply updates
  const [evRes, mRes] = await Promise.all([
    svc.from("supplier_milestone_evidence_items")
      .update(evidenceItemUpdate)
      .eq("id", id)
      .select()
      .single(),
    svc.from("supplier_release_milestones")
      .update(milestoneUpdate)
      .eq("id", milestone.id)
      .select()
      .single(),
  ]);

  if (evRes.error) return NextResponse.json({ error: evRes.error.message }, { status: 500 });
  if (mRes.error)  return NextResponse.json({ error: mRes.error.message },  { status: 500 });

  // Audit log
  await insertAuditLogWithClient(svc, {
    job_reference: jobRef,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description:   auditDesc,
    metadata: {
      evidence_item_id:  id,
      milestone_id:      milestone.id,
      milestone_name:    milestone.milestone_name,
      protection_id:     milestone.protection_id,
      action:            body.action,
      new_milestone_status: milestoneUpdate.milestone_status,
      new_evidence_status:  milestoneUpdate.evidence_status,
    },
  }).catch(() => {});

  // Notification (fire-and-forget)
  void svc.from("notifications").insert({
    job_reference:     jobRef,
    recipient_role:    notifyRole,
    notification_type: `supplier_evidence_${body.action}`,
    title:             notifyTitle,
    message:           notifyMessage,
    priority:          notifyPriority,
    delivery_channel:  "in_app",
    status:            "Sent",
    created_at:        now,
  });

  return NextResponse.json({
    success:       true,
    evidenceItem:  evRes.data,
    milestone:     mRes.data,
  });
}
