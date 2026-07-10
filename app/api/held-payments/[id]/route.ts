// ─── PATCH /api/held-payments/[id] ────────────────────────────────────────────
// All state transitions for a held payment record.
//
// Actions:
//   mark_proof_uploaded    — customer uploaded payment proof
//   mark_funds_received    — admin: funds confirmed received, payment secured
//   mark_release_eligible  — system/admin: delivery confirmed, release eligible
//   approve_release        — admin: approve the release instruction
//   mark_release_instructed — admin: release instruction sent to bank/partner
//   mark_released          — admin: funds released, close job if complete
//   mark_disputed          — admin/system: dispute opened, release blocked
//   resolve_dispute        — admin: dispute resolved, resume or cancel

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { releaseTypeForPayment } from "@/lib/paymentHolding";

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

// ─── PATCH ────────────────────────────────────────────────────────────────────

type PatchAction =
  | "mark_proof_uploaded"
  | "mark_funds_received"
  | "mark_release_eligible"
  | "approve_release"
  | "mark_release_instructed"
  | "mark_released"
  | "mark_disputed"
  | "resolve_dispute";

interface PatchBody {
  action:           PatchAction;
  actorId?:         string;
  actorRole?:       string;
  actorName?:       string;
  // mark_proof_uploaded
  documentId?:      string;
  paymentReference?: string;
  // approve_release
  approvalReason?:  string;
  releaseInstructionId?: string;
  // mark_released
  releaseNote?:     string;
  // mark_disputed
  disputeCaseId?:   string;
  // resolve_dispute
  resolution?:      "resume" | "refund" | "cancel";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, actorId, actorRole, actorName } = body;

  // Admin-only actions
  const adminActions: PatchAction[] = [
    "mark_funds_received", "approve_release", "mark_release_instructed",
    "mark_released", "mark_disputed", "resolve_dispute",
  ];
  if (adminActions.includes(action)) {
    const adminUserId = await validateAdmin(req);
    if (!adminUserId) {
      return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
    }
  }

  // Fetch current held payment
  const { data: hp, error: fetchErr } = await svc
    .from("held_payments")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !hp) {
    return NextResponse.json({ error: "Held payment not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // ── mark_proof_uploaded ───────────────────────────────────────────────────
  if (action === "mark_proof_uploaded") {
    const { error } = await svc
      .from("held_payments")
      .update({
        holding_status:            "Proof Uploaded",
        payment_proof_document_id: body.documentId ?? hp.payment_proof_document_id,
        payment_reference:         body.paymentReference ?? hp.payment_reference,
        updated_at:                now,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update linked payment obligation
    if (hp.payment_obligation_id) {
      await svc.from("payment_obligations")
        .update({ status: "Proof Uploaded", updated_at: now })
        .eq("id", hp.payment_obligation_id);
    }

    await svc.from("audit_logs").insert({
      job_reference: hp.job_reference, actor_role: actorRole ?? "customer",
      actor_name: actorName ?? "Customer", action: "held_payment_proof_uploaded",
      description: `Payment proof uploaded for ${hp.payment_type ?? "payment"} of ${hp.currency} ${hp.amount}. Awaiting admin verification.`,
      created_at: now,
    });

    // Auto-create reconciliation row (if none exists for this held payment)
    const { data: existingRecon } = await svc
      .from("holding_account_reconciliations")
      .select("id")
      .eq("held_payment_id", id)
      .maybeSingle();

    if (!existingRecon) {
      const { error: reconErr } = await svc
        .from("holding_account_reconciliations")
        .insert({
          job_reference:         hp.job_reference,
          held_payment_id:       id,
          payment_obligation_id: hp.payment_obligation_id ?? null,
          holding_account_id:    hp.holding_account_id    ?? null,
          expected_amount:       hp.amount                ?? null,
          currency:              hp.currency              ?? "RM",
          payer_name:            hp.payer_name            ?? null,
          payer_company_id:      hp.payer_company_id      ?? null,
          payment_reference:     body.paymentReference    ?? hp.payment_reference ?? null,
          reconciliation_status: "Pending",
          updated_at:            now,
        });

      if (!reconErr) {
        await svc.from("audit_logs").insert({
          job_reference: hp.job_reference,
          actor_role:    "system",
          actor_name:    "Nexum SecureFlow",
          action:        "reconciliation_created",
          description:   `Reconciliation record created for ${hp.currency} ${hp.amount} (${hp.payment_type ?? "payment"}). Awaiting admin review.`,
          created_at:    now,
        });
      }
    }

    // Notify admin
    await svc.from("notifications").insert({
      job_reference: hp.job_reference, recipient_role: "admin",
      notification_type: "Payment Proof Uploaded", priority: "High",
      title: `Payment proof uploaded — Job ${hp.job_reference} awaiting verification`,
      message: `Customer uploaded ${hp.payment_type ?? "payment"} proof (${hp.currency} ${hp.amount}). Please verify funds and mark Payment Secured.`,
      action_url: `/admin/jobs/${hp.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole,
      created_at: now,
    });

    return NextResponse.json({ success: true });
  }

  // ── mark_funds_received ───────────────────────────────────────────────────
  if (action === "mark_funds_received") {
    const isFullPay  = hp.payment_type === "Full Payment";
    const isDeposit  = hp.payment_type === "Deposit";

    // Determine job updates
    let jobUpdate: Record<string, string> = { updated_at: now };
    if (isFullPay) {
      jobUpdate = {
        ...jobUpdate,
        payment_status:    "Fully Paid",
        job_status:        "Ready for Execution",
        current_milestone: "Full Payment Confirmed",
      };
    } else if (isDeposit) {
      jobUpdate = {
        ...jobUpdate,
        payment_status:    "Deposit Confirmed",
        job_status:        "Ready for Execution",
        current_milestone: "Deposit Confirmed",
      };
    }
    // Balance: don't change job status — job is already in progress

    const { error: hpErr } = await svc
      .from("held_payments")
      .update({
        holding_status:    "Payment Secured",
        funds_received_at: now,
        secured_at:        now,
        updated_at:        now,
      })
      .eq("id", id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    // Update linked payment obligation to Verified
    if (hp.payment_obligation_id) {
      await svc.from("payment_obligations")
        .update({ status: "Verified", verified_at: now, updated_at: now })
        .eq("id", hp.payment_obligation_id);
    }

    // Update secured_jobs
    if (Object.keys(jobUpdate).length > 1) {
      await svc.from("secured_jobs")
        .update(jobUpdate)
        .eq("job_reference", hp.job_reference);
    }

    await svc.from("audit_logs").insert([
      {
        job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
        actor_name: actorName ?? "Nexum Admin", action: "funds_marked_received",
        description: `Funds marked as received for ${hp.payment_type ?? "payment"} (${hp.currency} ${hp.amount}).`,
        created_at: now,
      },
      {
        job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
        actor_name: actorName ?? "Nexum Admin", action: "payment_secured",
        description: `Payment Secured — ${hp.currency} ${hp.amount} confirmed in Designated Holding Account. Provider may proceed.`,
        created_at: now,
      },
    ]);

    // Notify provider and customer
    await svc.from("notifications").insert([
      {
        job_reference: hp.job_reference, recipient_role: "service_provider",
        notification_type: "Payment Secured", priority: "High",
        title: `Payment secured — Job ${hp.job_reference} ready for execution`,
        message: `${hp.payment_type ?? "Payment"} of ${hp.currency} ${hp.amount} has been confirmed and secured. You may proceed with job execution under the agreed workflow.`,
        action_url: `/provider/jobs/${hp.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
      {
        job_reference: hp.job_reference, recipient_role: "customer",
        notification_type: "Payment Secured", priority: "Medium",
        title: `Your ${hp.payment_type ?? "payment"} for Job ${hp.job_reference} is secured`,
        message: `${hp.currency} ${hp.amount} has been confirmed by Nexum Admin and recorded in the Designated Holding Account. Your service provider has been notified to proceed.`,
        action_url: `/customer/jobs/${hp.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
    ]);

    return NextResponse.json({ success: true });
  }

  // ── mark_release_eligible ─────────────────────────────────────────────────
  if (action === "mark_release_eligible") {
    if (!["Payment Secured"].includes(hp.holding_status) &&
        !["Funds Received"].includes(hp.holding_status)) {
      // Allow if already at this status (idempotent)
      if (hp.holding_status !== "Release Eligible") {
        return NextResponse.json({
          error: `Cannot mark release eligible from status: ${hp.holding_status}`
        }, { status: 400 });
      }
    }

    const { error: hpErr } = await svc
      .from("held_payments")
      .update({
        holding_status:      "Release Eligible",
        release_eligible_at: now,
        updated_at:          now,
      })
      .eq("id", id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    // Create release instruction (Pending Checker Approval — governance v1)
    const releaseType = releaseTypeForPayment(hp.payment_type);
    const { data: ri, error: riErr } = await svc
      .from("release_instructions")
      .insert({
        job_reference:     hp.job_reference,
        held_payment_id:   id,
        payee_company_id:  hp.payee_company_id,
        amount:            hp.amount,
        currency:          hp.currency,
        release_type:      releaseType,
        release_status:    "Pending Approval",
        governance_status: "Pending Checker Approval",
        created_by:        actorId ?? null,
        created_at:        now,
        updated_at:        now,
      })
      .select()
      .single();
    if (riErr) return NextResponse.json({ error: riErr.message }, { status: 500 });

    await svc.from("audit_logs").insert([
      {
        job_reference: hp.job_reference, actor_role: actorRole ?? "system",
        actor_name: actorName ?? "Nexum SecureFlow", action: "release_became_eligible",
        description: `Payment of ${hp.currency} ${hp.amount} is now Release Eligible following delivery confirmation.`,
        created_at: now,
      },
      {
        job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
        actor_name: actorName ?? "Nexum Admin", action: "release_instruction_submitted_for_checker",
        description: `Release Instruction created and submitted for checker approval: ${releaseType} — ${hp.currency} ${hp.amount}. A different admin must approve before finance instruction can proceed. Instruction ID: ${ri.id}`,
        created_at: now,
      },
    ]);

    // Notify admin
    await svc.from("notifications").insert({
      job_reference: hp.job_reference, recipient_role: "admin",
      notification_type: "Release Eligible", priority: "High",
      title: `Release Eligible — Job ${hp.job_reference} (${hp.currency} ${hp.amount})`,
      message: `Delivery has been confirmed. ${hp.currency} ${hp.amount} is now eligible for release. A Release Instruction has been created and requires your approval.`,
      action_url: `/admin/jobs/${hp.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    return NextResponse.json({ success: true, releaseInstruction: ri });
  }

  // ── approve_release ───────────────────────────────────────────────────────
  if (action === "approve_release") {
    const adminUserId = (await svc.auth.getUser(
      req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
    )).data.user?.id;

    const { error: hpErr } = await svc
      .from("held_payments")
      .update({
        holding_status:      "Release Approved",
        release_approved_at: now,
        release_approved_by: adminUserId ?? null,
        updated_at:          now,
      })
      .eq("id", id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    // Update linked release instruction
    const riId = body.releaseInstructionId;
    if (riId) {
      await svc.from("release_instructions")
        .update({
          release_status: "Approved",
          approval_reason: body.approvalReason ?? null,
          approved_by:    adminUserId ?? null,
          approved_at:    now,
          updated_at:     now,
        })
        .eq("id", riId);
    } else {
      await svc.from("release_instructions")
        .update({
          release_status: "Approved",
          approval_reason: body.approvalReason ?? null,
          approved_by:    adminUserId ?? null,
          approved_at:    now,
          updated_at:     now,
        })
        .eq("held_payment_id", id)
        .eq("release_status", "Pending Approval");
    }

    await svc.from("audit_logs").insert({
      job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
      actor_name: actorName ?? "Nexum Admin", action: "release_approved",
      description: `Release Approved for ${hp.currency} ${hp.amount}. Admin has approved the release instruction. Awaiting release instruction to bank/partner.`,
      created_at: now,
    });

    // Notify admin finance team
    await svc.from("notifications").insert({
      job_reference: hp.job_reference, recipient_role: "admin",
      notification_type: "Release Approved", priority: "High",
      title: `Release Approved — Job ${hp.job_reference}: process release instruction`,
      message: `Release of ${hp.currency} ${hp.amount} has been approved. Please process the Release Instruction through the approved bank or payment partner.`,
      action_url: `/admin/jobs/${hp.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    return NextResponse.json({ success: true });
  }

  // ── mark_release_instructed ───────────────────────────────────────────────
  if (action === "mark_release_instructed") {
    const adminUserId = (await svc.auth.getUser(
      req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
    )).data.user?.id;

    const { error: hpErr } = await svc
      .from("held_payments")
      .update({
        holding_status:       "Release Instructed",
        release_instructed_at: now,
        updated_at:            now,
      })
      .eq("id", id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    // Update release instruction
    await svc.from("release_instructions")
      .update({
        release_status: "Instructed",
        instructed_by:  adminUserId ?? null,
        instructed_at:  now,
        updated_at:     now,
      })
      .eq("held_payment_id", id)
      .in("release_status", ["Approved", "Pending Approval"]);

    await svc.from("audit_logs").insert({
      job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
      actor_name: actorName ?? "Nexum Admin", action: "release_instructed",
      description: `Release Instruction recorded for ${hp.currency} ${hp.amount}. Actual transfer must be processed through approved bank or payment partner.`,
      created_at: now,
    });

    return NextResponse.json({ success: true });
  }

  // ── mark_released ─────────────────────────────────────────────────────────
  if (action === "mark_released") {
    const { error: hpErr } = await svc
      .from("held_payments")
      .update({
        holding_status: "Released",
        released_at:    now,
        release_note:   body.releaseNote ?? null,
        updated_at:     now,
      })
      .eq("id", id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    // Mark release instruction Completed
    await svc.from("release_instructions")
      .update({
        release_status: "Completed",
        completed_at:   now,
        updated_at:     now,
      })
      .eq("held_payment_id", id)
      .neq("release_status", "Cancelled");

    // Check if ALL held payments for this job are Released
    const { data: allHp } = await svc
      .from("held_payments")
      .select("id, holding_status, payment_type")
      .eq("job_reference", hp.job_reference);

    const allReleased = (allHp ?? []).every(
      (r: { id: string; holding_status: string }) =>
        r.id === id || r.holding_status === "Released" || r.holding_status === "Cancelled"
    );

    if (allReleased) {
      await svc.from("secured_jobs")
        .update({
          job_status:        "Completed",
          payment_status:    "Fully Paid",
          current_milestone: "Job Closed",
          updated_at:        now,
        })
        .eq("job_reference", hp.job_reference);
    }

    await svc.from("audit_logs").insert({
      job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
      actor_name: actorName ?? "Nexum Admin", action: "payment_released",
      description: `Payment Released — ${hp.currency} ${hp.amount} for ${hp.payment_type ?? "payment"}. Transfer processed through designated channel.${body.releaseNote ? ` Note: ${body.releaseNote}` : ""}`,
      created_at: now,
    });

    // Notify provider and customer
    await svc.from("notifications").insert([
      {
        job_reference: hp.job_reference, recipient_role: "service_provider",
        notification_type: "Payment Released", priority: "High",
        title: `Payment released — Job ${hp.job_reference}`,
        message: `${hp.currency} ${hp.amount} has been released and the transfer instruction has been processed through the designated account. Please allow time for your bank to process.`,
        action_url: `/provider/jobs/${hp.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
      {
        job_reference: hp.job_reference, recipient_role: "customer",
        notification_type: "Payment Released", priority: "Low",
        title: `Payment release confirmed — Job ${hp.job_reference}`,
        message: `${hp.currency} ${hp.amount} has been released to the service provider. ${allReleased ? "This job is now fully closed." : ""}`,
        action_url: `/customer/jobs/${hp.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
    ]);

    return NextResponse.json({ success: true, jobClosed: allReleased });
  }

  // ── mark_disputed ─────────────────────────────────────────────────────────
  if (action === "mark_disputed") {
    const { error: hpErr } = await svc
      .from("held_payments")
      .update({
        holding_status:  "Disputed",
        dispute_case_id: body.disputeCaseId ?? null,
        updated_at:      now,
      })
      .eq("id", id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    // Block any pending release instructions
    await svc.from("release_instructions")
      .update({ release_status: "Rejected", rejection_reason: "Release blocked by active dispute.", updated_at: now })
      .eq("held_payment_id", id)
      .in("release_status", ["Draft", "Pending Approval", "Approved"]);

    await svc.from("audit_logs").insert({
      job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
      actor_name: actorName ?? "Nexum Admin", action: "release_blocked_by_dispute",
      description: `Release blocked — payment of ${hp.currency} ${hp.amount} is now Disputed. Release instructions cancelled pending dispute resolution.`,
      created_at: now,
    });

    // Notify provider
    await svc.from("notifications").insert({
      job_reference: hp.job_reference, recipient_role: "service_provider",
      notification_type: "Payment Disputed", priority: "Critical",
      title: `Release blocked — dispute raised on Job ${hp.job_reference}`,
      message: `A dispute has been raised on the payment of ${hp.currency} ${hp.amount}. Release is suspended until the dispute is resolved by Nexum Admin.`,
      action_url: `/provider/jobs/${hp.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    return NextResponse.json({ success: true });
  }

  // ── resolve_dispute ───────────────────────────────────────────────────────
  if (action === "resolve_dispute") {
    const resolution = body.resolution ?? "resume";
    let newStatus: string;
    if (resolution === "resume")  newStatus = "Payment Secured";
    else if (resolution === "refund") newStatus = "Refund Pending";
    else newStatus = "Cancelled";

    const { error: hpErr } = await svc
      .from("held_payments")
      .update({ holding_status: newStatus, dispute_case_id: null, updated_at: now })
      .eq("id", id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    await svc.from("audit_logs").insert({
      job_reference: hp.job_reference, actor_role: actorRole ?? "admin",
      actor_name: actorName ?? "Nexum Admin", action: "release_blocked_by_dispute",
      description: `Dispute resolved — payment status updated to ${newStatus}. Resolution: ${resolution}.`,
      created_at: now,
    });

    return NextResponse.json({ success: true, newStatus });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
