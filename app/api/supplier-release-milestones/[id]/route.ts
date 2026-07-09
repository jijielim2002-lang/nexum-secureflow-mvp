// ─── PATCH /api/supplier-release-milestones/[id]
// Admin: verify evidence, mark release eligible, mark released, mark disputed.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { SPP_AUDIT_ACTIONS } from "@/lib/supplierPaymentProtection";

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
    return NextResponse.json({ error: "Only admin can update milestones" }, { status: 403 });
  }

  const body = await req.json() as {
    action?: "verify" | "release_eligible" | "release" | "dispute" | "cancel" | "reset";
    // Manual field overrides (for partial edits without action)
    milestone_status?:     string;
    milestone_name?:       string;
    milestone_percentage?: number;
    milestone_amount?:     number;
    currency?:             string;
    required_evidence?:    string;
    evidence_document_id?: string;
  };

  // Fetch current milestone
  const { data: current, error: fetchError } = await svc
    .from("supplier_release_milestones")
    .select("*, supplier_payment_protections(job_reference, supplier_name, advance_required_amount, advance_currency)")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const jobRef: string = current.job_reference;
  const milestoneLabel: string = current.milestone_name ?? "Unnamed milestone";
  const supplierName: string = current.supplier_payment_protections?.supplier_name ?? "—";

  const updatePayload: Record<string, unknown> = { updated_at: now };
  let auditAction: string = SPP_AUDIT_ACTIONS.protection_updated;
  let auditDesc = "";

  // ── Action-based state machine ────────────────────────────────────────────

  if (body.action) {
    const currentStatus: string = current.milestone_status;

    switch (body.action) {

      case "verify": {
        // Evidence Uploaded → Verified
        const allowed = ["Evidence Uploaded", "Pending"];
        if (!allowed.includes(currentStatus)) {
          return NextResponse.json(
            { error: `Cannot verify a milestone in status "${currentStatus}". Expected: ${allowed.join(" or ")}.` },
            { status: 422 },
          );
        }
        updatePayload.milestone_status = "Verified";
        updatePayload.verified_by = caller.userId;
        updatePayload.verified_at = now;
        auditAction = SPP_AUDIT_ACTIONS.milestone_verified;
        auditDesc = `Milestone "${milestoneLabel}" verified by ${caller.fullName} for supplier "${supplierName}" on job ${jobRef}.`;
        break;
      }

      case "release_eligible": {
        // Verified → Release Eligible
        if (currentStatus !== "Verified") {
          return NextResponse.json(
            { error: `Cannot mark release-eligible: milestone status is "${currentStatus}". Expected: Verified.` },
            { status: 422 },
          );
        }
        updatePayload.milestone_status = "Release Eligible";
        auditAction = SPP_AUDIT_ACTIONS.milestone_release_eligible;
        auditDesc = `Milestone "${milestoneLabel}" marked Release Eligible by ${caller.fullName} for supplier "${supplierName}" on job ${jobRef}.`;
        break;
      }

      case "release": {
        // Release Eligible → Released
        if (currentStatus !== "Release Eligible") {
          // Block and log
          await insertAuditLogWithClient(svc, {
            job_reference: jobRef,
            actor_role:    caller.role,
            actor_name:    caller.fullName,
            action:        SPP_AUDIT_ACTIONS.release_blocked,
            description:   `Release blocked for milestone "${milestoneLabel}" — status is "${currentStatus}", expected "Release Eligible". Supplier: ${supplierName}, job: ${jobRef}.`,
            metadata:      { milestone_id: id, current_status: currentStatus, milestone_name: current.milestone_name },
          }).catch(() => {});
          return NextResponse.json(
            { error: `Cannot release: milestone status is "${currentStatus}". Milestone must be "Release Eligible" before releasing. Manual disbursement requires admin verification.` },
            { status: 422 },
          );
        }
        updatePayload.milestone_status = "Released";
        updatePayload.released_at = now;
        auditAction = SPP_AUDIT_ACTIONS.milestone_released;
        auditDesc = `Release instruction recorded for milestone "${milestoneLabel}" (${current.milestone_percentage ?? "—"}%) — ${current.currency ?? "USD"} ${current.milestone_amount ?? "—"} — for supplier "${supplierName}" on job ${jobRef}. Manual disbursement required.`;
        break;
      }

      case "dispute": {
        // Any non-terminal status → Disputed
        const terminal = ["Released", "Cancelled"];
        if (terminal.includes(currentStatus)) {
          return NextResponse.json(
            { error: `Cannot dispute a milestone in terminal status "${currentStatus}".` },
            { status: 422 },
          );
        }
        updatePayload.milestone_status = "Disputed";
        auditAction = SPP_AUDIT_ACTIONS.release_blocked;
        auditDesc = `Milestone "${milestoneLabel}" marked Disputed by ${caller.fullName} for supplier "${supplierName}" on job ${jobRef}. Release blocked pending resolution.`;
        break;
      }

      case "cancel": {
        const nonCancellable = ["Released"];
        if (nonCancellable.includes(currentStatus)) {
          return NextResponse.json(
            { error: `Cannot cancel a milestone that has already been Released.` },
            { status: 422 },
          );
        }
        updatePayload.milestone_status = "Cancelled";
        auditAction = SPP_AUDIT_ACTIONS.protection_updated;
        auditDesc = `Milestone "${milestoneLabel}" cancelled by ${caller.fullName} for supplier "${supplierName}" on job ${jobRef}.`;
        break;
      }

      case "reset": {
        // Admin override — reset back to Pending (only for non-terminal)
        const nonResettable = ["Released", "Cancelled"];
        if (nonResettable.includes(currentStatus)) {
          return NextResponse.json(
            { error: `Cannot reset a milestone in terminal status "${currentStatus}".` },
            { status: 422 },
          );
        }
        updatePayload.milestone_status = "Pending";
        updatePayload.verified_by = null;
        updatePayload.verified_at = null;
        updatePayload.released_at = null;
        auditAction = SPP_AUDIT_ACTIONS.protection_updated;
        auditDesc = `Milestone "${milestoneLabel}" reset to Pending by ${caller.fullName} on job ${jobRef}.`;
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }

  } else {
    // ── Field-level patch (no action) ───────────────────────────────────────
    if (body.milestone_status     !== undefined) updatePayload.milestone_status     = body.milestone_status;
    if (body.milestone_name       !== undefined) updatePayload.milestone_name       = body.milestone_name;
    if (body.milestone_percentage !== undefined) updatePayload.milestone_percentage = body.milestone_percentage;
    if (body.milestone_amount     !== undefined) updatePayload.milestone_amount     = body.milestone_amount;
    if (body.currency             !== undefined) updatePayload.currency             = body.currency;
    if (body.required_evidence    !== undefined) updatePayload.required_evidence    = body.required_evidence;
    if (body.evidence_document_id !== undefined) {
      updatePayload.evidence_document_id = body.evidence_document_id;
      // Auto-advance to Evidence Uploaded if still Pending
      if (current.milestone_status === "Pending") {
        updatePayload.milestone_status = "Evidence Uploaded";
      }
      auditAction = SPP_AUDIT_ACTIONS.milestone_evidence_uploaded;
      auditDesc = `Evidence document linked to milestone "${milestoneLabel}" for supplier "${supplierName}" on job ${jobRef}.`;
    }
    if (!auditDesc) {
      auditAction = SPP_AUDIT_ACTIONS.protection_updated;
      auditDesc = `Milestone "${milestoneLabel}" fields updated by ${caller.fullName} on job ${jobRef}.`;
    }
  }

  const { data: updated, error: updateError } = await svc
    .from("supplier_release_milestones")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await insertAuditLogWithClient(svc, {
    job_reference: jobRef,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description:   auditDesc,
    metadata:      {
      milestone_id:      id,
      milestone_name:    current.milestone_name,
      protection_id:     current.protection_id,
      previous_status:   current.milestone_status,
      new_status:        updated.milestone_status,
      milestone_amount:  current.milestone_amount,
      currency:          current.currency,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, data: updated });
}
