// ─── PATCH /api/release-settlements/[id] ─────────────────────────────────────
// Admin actions on a release settlement record.
//
// Actions:
//   update_fields        — save actual_released_amount, bank refs, dates, notes
//   mark_processing      — transfer being processed through bank/partner
//   mark_released        — transfer processed (admin records it, not yet reconciled)
//   mark_reconciled      — settlement confirmed: cascade to held_payment Released + job closure
//   mark_amount_mismatch — actual ≠ expected, admin review required
//   mark_reference_mismatch — reference cannot be verified
//   mark_failed          — transfer failed
//   mark_cancelled       — settlement cancelled
//
// COMPLIANCE:
//   Do not say "Nexum transferred funds automatically."
//   Transfer must be performed through approved bank or payment partner.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SETTLEMENT_AUDIT_ACTIONS } from "@/lib/releaseSettlement";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

type PatchAction =
  | "update_fields"
  | "mark_processing"
  | "mark_released"
  | "mark_reconciled"
  | "mark_amount_mismatch"
  | "mark_reference_mismatch"
  | "mark_failed"
  | "mark_cancelled";

interface PatchBody {
  action:                   PatchAction;
  actorId?:                 string;
  actorRole?:               string;
  actorName?:               string;
  // field updates
  actualReleasedAmount?:    number;
  payeeName?:               string;
  payeeBankName?:           string;
  payeeAccountReference?:   string;
  releaseReference?:        string;
  bankTransactionReference?: string;
  releasedAt?:              string;
  reconciliationNote?:      string;
}

const STATUS_MAP: Partial<Record<PatchAction, string>> = {
  mark_processing:        "Processing",
  mark_released:          "Released",
  mark_reconciled:        "Reconciled",
  mark_amount_mismatch:   "Amount Mismatch",
  mark_reference_mismatch: "Reference Mismatch",
  mark_failed:            "Failed",
  mark_cancelled:         "Cancelled",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, actorId, actorRole, actorName } = body;
  const now = new Date().toISOString();

  // Fetch current settlement
  const { data: settlement, error: fetchErr } = await svc
    .from("release_settlements")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !settlement) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }

  // ── update_fields — save form inputs without changing status ──────────────
  if (action === "update_fields") {
    const update: Record<string, unknown> = { updated_at: now };
    if (body.actualReleasedAmount    !== undefined) update["actual_released_amount"]    = body.actualReleasedAmount;
    if (body.payeeName               !== undefined) update["payee_name"]               = body.payeeName;
    if (body.payeeBankName           !== undefined) update["payee_bank_name"]           = body.payeeBankName;
    if (body.payeeAccountReference   !== undefined) update["payee_account_reference"]   = body.payeeAccountReference;
    if (body.releaseReference        !== undefined) update["release_reference"]         = body.releaseReference;
    if (body.bankTransactionReference !== undefined) update["bank_transaction_reference"] = body.bankTransactionReference;
    if (body.releasedAt              !== undefined) update["released_at"]              = body.releasedAt;
    if (body.reconciliationNote      !== undefined) update["reconciliation_note"]       = body.reconciliationNote;

    const { error } = await svc.from("release_settlements").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── Status-changing actions ───────────────────────────────────────────────

  const newStatus = STATUS_MAP[action];
  if (!newStatus) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Build settlement update
  const settlementUpdate: Record<string, unknown> = {
    settlement_status: newStatus,
    updated_at:        now,
  };

  // Merge any field updates submitted alongside the status change
  if (body.actualReleasedAmount    !== undefined) settlementUpdate["actual_released_amount"]    = body.actualReleasedAmount;
  if (body.payeeName               !== undefined) settlementUpdate["payee_name"]               = body.payeeName;
  if (body.payeeBankName           !== undefined) settlementUpdate["payee_bank_name"]           = body.payeeBankName;
  if (body.payeeAccountReference   !== undefined) settlementUpdate["payee_account_reference"]   = body.payeeAccountReference;
  if (body.releaseReference        !== undefined) settlementUpdate["release_reference"]         = body.releaseReference;
  if (body.bankTransactionReference !== undefined) settlementUpdate["bank_transaction_reference"] = body.bankTransactionReference;
  if (body.releasedAt              !== undefined) settlementUpdate["released_at"]              = body.releasedAt;
  if (body.reconciliationNote      !== undefined) settlementUpdate["reconciliation_note"]       = body.reconciliationNote;

  // On Reconciled: stamp reconciled_by + reconciled_at + governance fields
  if (action === "mark_reconciled") {
    settlementUpdate["reconciled_by"]          = adminId;
    settlementUpdate["reconciled_at"]          = now;
    settlementUpdate["reconciled_checker_by"]  = adminId;
    settlementUpdate["reconciled_checker_at"]  = now;
    if (body.reconciliationNote) settlementUpdate["governance_note"] = body.reconciliationNote;
  }
  // On Released: stamp released_at if not supplied
  if (action === "mark_released" && !body.releasedAt) {
    settlementUpdate["released_at"] = now;
  }

  const { error: settlErr } = await svc
    .from("release_settlements")
    .update(settlementUpdate)
    .eq("id", id);
  if (settlErr) return NextResponse.json({ error: settlErr.message }, { status: 500 });

  // ── Audit log ─────────────────────────────────────────────────────────────

  const auditAction = SETTLEMENT_AUDIT_ACTIONS[newStatus as keyof typeof SETTLEMENT_AUDIT_ACTIONS]
    ?? "release_settlement_updated";

  const actualAmt  = body.actualReleasedAmount ?? settlement.actual_released_amount;
  const expectedAmt = settlement.expected_release_amount;
  const currency   = settlement.currency;
  let auditDesc = `Settlement ${newStatus} for job ${settlement.job_reference}.`;
  auditDesc += ` Expected: ${currency} ${Number(expectedAmt).toFixed(2)}.`;
  if (actualAmt != null) auditDesc += ` Actual: ${currency} ${Number(actualAmt).toFixed(2)}.`;
  if (body.bankTransactionReference) auditDesc += ` Bank TX Ref: ${body.bankTransactionReference}.`;
  if (body.reconciliationNote) auditDesc += ` Note: ${body.reconciliationNote}.`;

  await svc.from("audit_logs").insert({
    job_reference: settlement.job_reference,
    actor_role:    actorRole ?? "admin",
    actor_name:    actorName ?? "Nexum Admin",
    action:        auditAction,
    description:   auditDesc,
    created_at:    now,
  });

  // ── Notifications per outcome ─────────────────────────────────────────────

  if (action === "mark_failed") {
    await svc.from("notifications").insert({
      job_reference:     settlement.job_reference,
      recipient_role:    "admin",
      notification_type: "Settlement Failed",
      priority:          "Critical",
      title:             `⚠ Settlement Failed — Job ${settlement.job_reference}`,
      message:           `Settlement of ${currency} ${expectedAmt} has failed. Admin must investigate and retry through the designated bank/payment partner. ${body.reconciliationNote ? `Note: ${body.reconciliationNote}` : ""}`,
      action_url:        `/admin/jobs/${settlement.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    await svc.from("workflow_tasks").insert({
      job_reference:  settlement.job_reference,
      task_type:      "Resolve Settlement Failure",
      title:          `Resolve failed settlement — Job ${settlement.job_reference}`,
      description:    `Settlement of ${currency} ${expectedAmt} has failed. Investigate with bank/partner and retry. ${body.reconciliationNote ? body.reconciliationNote : ""}`,
      assigned_role:  "admin",
      priority:       "Critical",
      status:         "Open",
      created_at:     now, updated_at: now,
    });
  }

  if (action === "mark_amount_mismatch") {
    const delta = actualAmt != null ? Number(actualAmt) - Number(expectedAmt) : null;
    const deltaStr = delta != null
      ? ` Shortfall/Excess: ${delta >= 0 ? "+" : ""}${currency} ${Math.abs(delta).toFixed(2)}.`
      : "";
    await svc.from("notifications").insert({
      job_reference:     settlement.job_reference,
      recipient_role:    "admin",
      notification_type: "Settlement Amount Mismatch",
      priority:          "High",
      title:             `⚠ Settlement Amount Mismatch — Job ${settlement.job_reference}`,
      message:           `Settlement actual amount (${currency} ${actualAmt ?? "?"}) does not match expected (${currency} ${expectedAmt}).${deltaStr} Admin review required before financial closure.`,
      action_url:        `/admin/jobs/${settlement.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    await svc.from("workflow_tasks").insert({
      job_reference:  settlement.job_reference,
      task_type:      "Resolve Settlement Mismatch",
      title:          `Resolve settlement amount mismatch — Job ${settlement.job_reference}`,
      description:    `Settlement actual amount does not match expected.${deltaStr} Investigate with bank/partner. Settlement cannot be reconciled until resolved.`,
      assigned_role:  "admin",
      priority:       "High",
      status:         "Open",
      created_at:     now, updated_at: now,
    });
  }

  if (action === "mark_reference_mismatch") {
    await svc.from("notifications").insert({
      job_reference:     settlement.job_reference,
      recipient_role:    "admin",
      notification_type: "Settlement Reference Mismatch",
      priority:          "High",
      title:             `⚠ Settlement Reference Mismatch — Job ${settlement.job_reference}`,
      message:           `Settlement bank reference cannot be verified for ${currency} ${expectedAmt}. Admin review required.`,
      action_url:        `/admin/jobs/${settlement.job_reference}`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });
  }

  // ── mark_reconciled: full downstream cascade ──────────────────────────────

  if (action === "mark_reconciled") {
    // 1. Mark held payment as Released
    if (settlement.held_payment_id) {
      await svc.from("held_payments")
        .update({ holding_status: "Released", released_at: now, updated_at: now })
        .eq("id", settlement.held_payment_id);
    }

    // 2. Mark release instruction as Completed + governance_status = Completed
    if (settlement.release_instruction_id) {
      await svc.from("release_instructions")
        .update({ release_status: "Completed", governance_status: "Completed", completed_at: now, updated_at: now })
        .eq("id", settlement.release_instruction_id);
    }

    // 3. Check if ALL held payments for the job are Released or Cancelled → close job
    const { data: allHp } = await svc
      .from("held_payments")
      .select("id, holding_status")
      .eq("job_reference", settlement.job_reference);

    const allReleased = (allHp ?? []).every(
      (r: { id: string; holding_status: string }) =>
        r.id === settlement.held_payment_id ||
        r.holding_status === "Released" ||
        r.holding_status === "Cancelled"
    );

    if (allReleased) {
      await svc.from("secured_jobs").update({
        job_status:        "Completed",
        payment_status:    "Fully Paid",
        current_milestone: "Job Closed",
        updated_at:        now,
      }).eq("job_reference", settlement.job_reference);
    }

    // 4. Additional audit log for financial closure (governance-named action)
    await svc.from("audit_logs").insert({
      job_reference: settlement.job_reference,
      actor_role:    actorRole ?? "admin",
      actor_name:    actorName ?? "Nexum Admin",
      action:        "release_settlement_reconciled_checker",
      description:   `Settlement reconciled — ${currency} ${actualAmt ?? expectedAmt} confirmed released to provider under governance workflow. Reconciler: ${actorName ?? "Admin"}. ${allReleased ? "All payments settled. Job financially closed." : ""}`,
      created_at:    now,
    });

    // 5. Notify provider and customer
    await svc.from("notifications").insert([
      {
        job_reference:     settlement.job_reference,
        recipient_role:    "service_provider",
        notification_type: "Payment Released",
        priority:          "High",
        title:             `Settlement reconciled — Job ${settlement.job_reference}`,
        message:           `${currency} ${actualAmt ?? expectedAmt} settlement has been reconciled and confirmed released. Actual transfer was processed through the designated bank/payment partner. ${allReleased ? "This job is now fully and financially closed." : ""}`,
        action_url:        `/provider/jobs/${settlement.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
      {
        job_reference:     settlement.job_reference,
        recipient_role:    "customer",
        notification_type: "Payment Released",
        priority:          "Low",
        title:             `Payment settlement confirmed — Job ${settlement.job_reference}`,
        message:           `Settlement of ${currency} ${actualAmt ?? expectedAmt} to the service provider has been reconciled and confirmed. ${allReleased ? "This job is now financially closed." : ""}`,
        action_url:        `/customer/jobs/${settlement.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
      {
        job_reference:     settlement.job_reference,
        recipient_role:    "admin",
        notification_type: "Settlement Reconciled",
        priority:          "Medium",
        title:             `Settlement reconciled — Job ${settlement.job_reference}`,
        message:           `${currency} ${actualAmt ?? expectedAmt} settlement reconciled. ${allReleased ? "Job is now financially closed." : "Additional settlements may remain."}`,
        action_url:        `/admin/jobs/${settlement.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
    ]);

    return NextResponse.json({ success: true, action: "reconciled", jobClosed: allReleased });
  }

  return NextResponse.json({ success: true, newStatus });
}
