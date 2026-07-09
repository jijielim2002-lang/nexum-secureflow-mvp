// ─── PATCH /api/release-instructions/[id] ─────────────────────────────────────
// Admin actions on a release instruction.
//
// Actions: approve | instruct | complete | reject | cancel

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAdminUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

interface PatchBody {
  action:           "approve" | "checker_approve" | "checker_reject" | "instruct" | "complete" | "reject" | "cancel";
  actorId?:         string;
  actorRole?:       string;
  actorName?:       string;
  approvalReason?:  string;
  rejectionReason?: string;
  releaseNote?:     string;
  checkerNote?:     string;   // required for checker_reject
  governanceNote?:  string;   // optional note for governance actions
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, actorId, actorRole, actorName } = body;
  const now = new Date().toISOString();

  // Fetch current instruction
  const { data: ri, error: fetchErr } = await svc
    .from("release_instructions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !ri) {
    return NextResponse.json({ error: "Release instruction not found" }, { status: 404 });
  }

  let update: Record<string, unknown> = { updated_at: now };
  let auditDesc = "";
  let hpStatusUpdate: string | null = null;

  switch (action) {
    case "approve":
    case "checker_approve": {
      // Governance: checker must be different from maker
      if (ri.created_by && ri.created_by === adminId) {
        await svc.from("audit_logs").insert({
          job_reference: ri.job_reference,
          actor_role:    actorRole ?? "admin",
          actor_name:    actorName ?? "Nexum Admin",
          action:        "release_governance_violation_detected",
          description:   `Governance violation: admin ${adminId} attempted to checker-approve their own release instruction ${id}. Maker-checker control requires a different operator.`,
          created_at:    now,
        });
        return NextResponse.json({
          error: "Governance violation: the checker must be a different person from the release maker. Release approved under workflow requires dual approval.",
          code:  "GOVERNANCE_VIOLATION",
        }, { status: 400 });
      }
      update = {
        ...update,
        release_status:    "Approved",
        governance_status: "Checker Approved",
        approved_by:       adminId,
        approved_at:       now,
        checked_by:        adminId,
        checked_at:        now,
        approval_reason:   body.approvalReason ?? null,
        checker_note:      body.checkerNote    ?? null,
      };
      hpStatusUpdate = "Release Approved";
      auditDesc = `Release approved under workflow — checker approval granted by ${actorName ?? "Admin"} for ${ri.currency} ${ri.amount} (${ri.release_type}). Maker-checker control satisfied.`;
      break;
    }

    case "instruct": {
      // Governance gate: must be Checker Approved (or legacy records without governance_status)
      if (ri.governance_status && ri.governance_status !== "Checker Approved" && ri.governance_status !== "Ready for Finance Instruction") {
        return NextResponse.json({
          error: `Finance instruction blocked: governance status is '${ri.governance_status}'. Release must be approved by a checker (different admin) before finance instruction can proceed.`,
          code:  "GOVERNANCE_NOT_APPROVED",
        }, { status: 400 });
      }
      // Soft governance warning: log if same user as maker
      if (ri.created_by && ri.created_by === adminId) {
        await svc.from("audit_logs").insert({
          job_reference: ri.job_reference,
          actor_role:    actorRole ?? "admin",
          actor_name:    actorName ?? "Nexum Admin",
          action:        "release_governance_violation_detected",
          description:   `Governance warning: finance instructor (${adminId}) is the same as the release maker. A different operator should instruct for optimal dual-control. Instruction proceeds with warning.`,
          created_at:    now,
        });
      }
      update = {
        ...update,
        release_status:    "Instructed",
        governance_status: "Instructed",
        instructed_by:     adminId,
        instructed_at:     now,
      };
      hpStatusUpdate = "Release Instructed";
      auditDesc = `Finance instruction recorded — ${ri.currency} ${ri.amount} (${ri.release_type}). Actual transfer must be processed through approved bank or payment partner. Settlement record updated to Processing.`;
      break;
    }

    case "checker_reject": {
      if (!body.checkerNote) {
        return NextResponse.json({ error: "checkerNote is required for checker rejection." }, { status: 400 });
      }
      update = {
        ...update,
        release_status:    "Rejected",
        governance_status: "Checker Rejected",
        rejection_reason:  body.rejectionReason ?? body.checkerNote,
        checker_note:      body.checkerNote,
        checked_by:        adminId,
        checked_at:        now,
      };
      hpStatusUpdate = "Release Eligible"; // revert to eligible pending re-review
      auditDesc = `Release checker rejected — ${ri.currency} ${ri.amount} (${ri.release_type}). Checker note: ${body.checkerNote}. Release maker must address and resubmit. Payment remains secured.`;
      break;
    }

    case "complete":
      // Note: in the settlement reconciliation flow, "Completed" is set automatically
      // by the settlement mark_reconciled action. This action is kept for backward compat.
      update = { ...update, release_status: "Completed", governance_status: "Completed", completed_at: now };
      hpStatusUpdate = null; // held_payment status managed by settlement reconciliation
      auditDesc = `Release Instruction marked Completed for ${ri.currency} ${ri.amount} (${ri.release_type}).`;
      break;

    case "reject":
      update = {
        ...update,
        release_status:    "Rejected",
        governance_status: "Cancelled",
        rejection_reason:  body.rejectionReason ?? null,
      };
      hpStatusUpdate = "Payment Secured"; // revert to secured pending re-review
      auditDesc = `Release Instruction rejected. Reason: ${body.rejectionReason ?? "not specified"}. Payment remains secured.`;
      break;

    case "cancel":
      update = { ...update, release_status: "Cancelled", governance_status: "Cancelled" };
      auditDesc = `Release Instruction cancelled for ${ri.currency} ${ri.amount}.`;
      break;

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // ── instruct: gate on verified payout profile ────────────────────────────
  if (action === "instruct" && ri.payee_company_id) {
    const { data: payoutProfile } = await svc
      .from("provider_payout_profiles")
      .select("id, verification_status")
      .eq("provider_company_id", ri.payee_company_id)
      .eq("verification_status", "Verified")
      .maybeSingle();

    if (!payoutProfile) {
      // Audit the block
      await svc.from("audit_logs").insert({
        job_reference: ri.job_reference,
        actor_role:    actorRole ?? "admin",
        actor_name:    actorName ?? "Nexum Admin",
        action:        "release_blocked_unverified_payout_profile",
        description:   `Release instruction blocked — provider payout profile is not verified for company ${ri.payee_company_id}. Instruct action cannot proceed until payout profile is verified.`,
        created_at:    now,
      });

      // Notify admin and provider
      await svc.from("notifications").insert([
        {
          job_reference:     ri.job_reference,
          recipient_role:    "admin",
          notification_type: "Release Blocked",
          priority:          "High",
          title:             `Release blocked — unverified payout profile (Job ${ri.job_reference})`,
          message:           `Cannot issue release instruction for ${ri.currency} ${ri.amount} — provider payout profile must be verified first. Review payout profiles at /admin/payout-profiles.`,
          action_url:        `/admin/payout-profiles`,
          actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
        },
        {
          job_reference:     ri.job_reference,
          recipient_role:    "service_provider",
          notification_type: "Release Blocked",
          priority:          "High",
          title:             `Release blocked — payout profile required (Job ${ri.job_reference})`,
          message:           `Release of ${ri.currency} ${ri.amount} cannot be instructed until your payout profile is submitted and verified. Please update your payout profile to allow payment processing.`,
          action_url:        `/provider/payout-profile`,
          actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
        },
      ]);

      return NextResponse.json({
        error: "Provider payout profile must be verified before release instruction.",
        code:  "UNVERIFIED_PAYOUT_PROFILE",
      }, { status: 400 });
    }
  }

  const { error: updErr } = await svc
    .from("release_instructions")
    .update(update)
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // ── approve: create release_settlement row ────────────────────────────────
  if (action === "approve") {
    const { data: existingSettlement } = await svc
      .from("release_settlements")
      .select("id")
      .eq("release_instruction_id", id)
      .maybeSingle();

    if (!existingSettlement) {
      const { error: settlErr } = await svc.from("release_settlements").insert({
        release_instruction_id:  id,
        held_payment_id:         ri.held_payment_id         ?? null,
        job_reference:           ri.job_reference,
        payee_company_id:        ri.payee_company_id        ?? null,
        expected_release_amount: ri.amount,
        currency:                ri.currency                ?? "RM",
        release_reference:       `RI-${id.slice(0, 8).toUpperCase()}`,
        settlement_status:       "Pending",
        updated_at:              now,
      });

      if (!settlErr) {
        await svc.from("audit_logs").insert({
          job_reference: ri.job_reference,
          actor_role:    actorRole ?? "admin",
          actor_name:    actorName ?? "Nexum Admin",
          action:        "release_settlement_created",
          description:   `Settlement record created for ${ri.currency} ${ri.amount} following release approval. Awaiting release instruction and payout processing.`,
          created_at:    now,
        });

        // Notify admin finance team to process payout
        await svc.from("notifications").insert({
          job_reference:     ri.job_reference,
          recipient_role:    "admin",
          notification_type: "Release Approved",
          priority:          "High",
          title:             `Release approved — Job ${ri.job_reference}: process payout`,
          message:           `Release Instruction for ${ri.currency} ${ri.amount} has been approved. A settlement record has been created. Please issue the Mark Release Instructed action and process the actual payout through the approved bank/payment partner.`,
          action_url:        `/admin/jobs/${ri.job_reference}`,
          actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
        });

        await svc.from("workflow_tasks").insert({
          job_reference:  ri.job_reference,
          task_type:      "Process Release Payout",
          title:          `Process payout — Job ${ri.job_reference} (${ri.currency} ${ri.amount})`,
          description:    `Release Instruction approved. Process actual payout of ${ri.currency} ${ri.amount} through designated bank/payment partner. Then mark Release Instructed and record settlement details.`,
          assigned_role:  "admin",
          priority:       "High",
          status:         "Open",
          created_at:     now, updated_at: now,
        });
      }
    }
  }

  // ── instruct: update linked settlement to Processing + notify provider ────
  if (action === "instruct") {
    await svc.from("release_settlements")
      .update({ settlement_status: "Processing", updated_at: now })
      .eq("release_instruction_id", id)
      .in("settlement_status", ["Pending"]);

    // Notify provider that release has been instructed
    await svc.from("notifications").insert({
      job_reference:     ri.job_reference,
      recipient_role:    "service_provider",
      notification_type: "Release Instructed",
      priority:          "High",
      title:             `Release Instructed — Job ${ri.job_reference} (${ri.currency} ${ri.amount})`,
      message:           `Release instruction for ${ri.currency} ${ri.amount} has been issued to the designated bank/payment partner. Settlement is now being processed. You will be notified when settlement is reconciled.`,
      action_url:        `/provider/jobs/${ri.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });
  }

  // Sync held_payment status
  if (hpStatusUpdate && ri.held_payment_id) {
    const hpUpdate: Record<string, unknown> = { holding_status: hpStatusUpdate, updated_at: now };
    if (action === "complete") {
      hpUpdate["released_at"] = now;
      if (body.releaseNote) hpUpdate["release_note"] = body.releaseNote;
    }
    await svc.from("held_payments").update(hpUpdate).eq("id", ri.held_payment_id);

    // If completed, check job closure
    if (action === "complete") {
      const { data: allHp } = await svc
        .from("held_payments")
        .select("id, holding_status")
        .eq("job_reference", ri.job_reference);

      const allReleased = (allHp ?? []).every(
        (r: { id: string; holding_status: string }) =>
          r.id === ri.held_payment_id ||
          r.holding_status === "Released" ||
          r.holding_status === "Cancelled"
      );
      if (allReleased) {
        await svc.from("secured_jobs").update({
          job_status:        "Completed",
          payment_status:    "Fully Paid",
          current_milestone: "Job Closed",
          updated_at:        now,
        }).eq("job_reference", ri.job_reference);
      }
    }
  }

  const auditAction =
    action === "checker_approve" ? "release_checker_approved" :
    action === "checker_reject"  ? "release_checker_rejected"  :
    action === "instruct"        ? "release_finance_instructed" :
    `release_${action}`;

  await svc.from("audit_logs").insert({
    job_reference: ri.job_reference,
    actor_role:    actorRole ?? "admin",
    actor_name:    actorName ?? "Nexum Admin",
    action:        auditAction,
    description:   auditDesc,
    created_at:    now,
  });

  // ── Governance notifications ──────────────────────────────────────────────

  if (action === "checker_approve" || action === "approve") {
    // Notify admin finance team to process instruction
    await svc.from("notifications").insert({
      job_reference:     ri.job_reference,
      recipient_role:    "admin",
      notification_type: "Release Checker Approved",
      priority:          "High",
      title:             `Release approved — Job ${ri.job_reference}: proceed to finance instruction`,
      message:           `Release Instruction for ${ri.currency} ${ri.amount} has been checker-approved under dual-control workflow. Finance admin may now issue the Mark Release Instructed action and process payout through approved bank/partner.`,
      action_url:        `/admin/release-approvals`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });
  }

  if (action === "checker_reject") {
    await svc.from("notifications").insert({
      job_reference:     ri.job_reference,
      recipient_role:    "admin",
      notification_type: "Release Checker Rejected",
      priority:          "High",
      title:             `Release rejected by checker — Job ${ri.job_reference}`,
      message:           `Release Instruction for ${ri.currency} ${ri.amount} was rejected by the checker. Reason: ${body.checkerNote ?? "See audit log"}. The release maker must review and resubmit.`,
      action_url:        `/admin/jobs/${ri.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });
  }

  return NextResponse.json({ success: true });
}
