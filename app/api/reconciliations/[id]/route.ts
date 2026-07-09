// ─── PATCH /api/reconciliations/[id] ─────────────────────────────────────────
// Admin actions on a reconciliation record.
//
// Actions:
//   update_fields      — save received_amount, bank_reference, received_at, etc.
//   mark_matched       — reconciliation matches, payment can be secured
//   mark_amount_mismatch
//   mark_reference_mismatch
//   mark_duplicate_suspected
//   mark_unclear
//   mark_rejected
//   mark_payment_secured — shortcut: reconciliation matched + mark held payment secured

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RECON_AUDIT_ACTIONS } from "@/lib/holdingReconciliation";

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
  | "mark_matched"
  | "mark_amount_mismatch"
  | "mark_reference_mismatch"
  | "mark_duplicate_suspected"
  | "mark_unclear"
  | "mark_rejected"
  | "mark_payment_secured";

interface PatchBody {
  action:             PatchAction;
  actorId?:           string;
  actorRole?:         string;
  actorName?:         string;
  // field updates
  receivedAmount?:    number;
  bankReference?:     string;
  paymentReference?:  string;
  payerName?:         string;
  receivedAt?:        string;
  reconciliationNote?: string;
  // release note for mark_payment_secured
  releaseNote?:       string;
}

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

  // Fetch current reconciliation
  const { data: recon, error: fetchErr } = await svc
    .from("holding_account_reconciliations")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !recon) {
    return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 });
  }

  // ── update_fields — save form inputs without changing status ──────────────
  if (action === "update_fields") {
    const update: Record<string, unknown> = { updated_at: now };
    if (body.receivedAmount    !== undefined) update["received_amount"]    = body.receivedAmount;
    if (body.bankReference     !== undefined) update["bank_reference"]     = body.bankReference;
    if (body.paymentReference  !== undefined) update["payment_reference"]  = body.paymentReference;
    if (body.payerName         !== undefined) update["payer_name"]         = body.payerName;
    if (body.receivedAt        !== undefined) update["received_at"]        = body.receivedAt;
    if (body.reconciliationNote !== undefined) update["reconciliation_note"] = body.reconciliationNote;

    const { error } = await svc
      .from("holding_account_reconciliations")
      .update(update)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── Status-changing actions ───────────────────────────────────────────────

  const STATUS_MAP: Partial<Record<PatchAction, string>> = {
    mark_matched:               "Matched",
    mark_amount_mismatch:       "Amount Mismatch",
    mark_reference_mismatch:    "Reference Mismatch",
    mark_duplicate_suspected:   "Duplicate Suspected",
    mark_unclear:               "Unclear",
    mark_rejected:              "Rejected",
    mark_payment_secured:       "Matched",   // mark_payment_secured first sets Matched, then secures
  };

  const newStatus = STATUS_MAP[action];
  if (!newStatus && action !== "mark_payment_secured") {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Build the reconciliation update
  const reconUpdate: Record<string, unknown> = {
    reconciliation_status: newStatus,
    reconciled_by:         adminId,
    reconciled_at:         now,
    updated_at:            now,
  };
  // Merge any field updates submitted alongside the status change
  if (body.receivedAmount    !== undefined) reconUpdate["received_amount"]    = body.receivedAmount;
  if (body.bankReference     !== undefined) reconUpdate["bank_reference"]     = body.bankReference;
  if (body.paymentReference  !== undefined) reconUpdate["payment_reference"]  = body.paymentReference;
  if (body.payerName         !== undefined) reconUpdate["payer_name"]         = body.payerName;
  if (body.receivedAt        !== undefined) reconUpdate["received_at"]        = body.receivedAt;
  if (body.reconciliationNote !== undefined) reconUpdate["reconciliation_note"] = body.reconciliationNote;

  const { error: reconErr } = await svc
    .from("holding_account_reconciliations")
    .update(reconUpdate)
    .eq("id", id);
  if (reconErr) return NextResponse.json({ error: reconErr.message }, { status: 500 });

  // Determine audit action
  const finalStatus = newStatus as keyof typeof RECON_AUDIT_ACTIONS;
  const auditAction = RECON_AUDIT_ACTIONS[finalStatus] ?? "reconciliation_updated";

  // Build audit description
  const receivedAmt = body.receivedAmount ?? recon.received_amount;
  const expectedAmt = recon.expected_amount;
  const currency    = recon.currency;
  let auditDesc = `Reconciliation ${newStatus} for job ${recon.job_reference}.`;
  if (receivedAmt != null) auditDesc += ` Received: ${currency} ${Number(receivedAmt).toFixed(2)}.`;
  if (expectedAmt != null) auditDesc += ` Expected: ${currency} ${Number(expectedAmt).toFixed(2)}.`;
  if (body.bankReference) auditDesc += ` Bank ref: ${body.bankReference}.`;
  if (body.reconciliationNote) auditDesc += ` Note: ${body.reconciliationNote}.`;

  await svc.from("audit_logs").insert({
    job_reference: recon.job_reference,
    actor_role:    actorRole ?? "admin",
    actor_name:    actorName ?? "Nexum Admin",
    action:        auditAction,
    description:   auditDesc,
    created_at:    now,
  });

  // ── Notifications and downstream effects per outcome ─────────────────────

  if (action === "mark_matched") {
    // Notify admin to proceed to Mark Payment Secured
    await svc.from("notifications").insert({
      job_reference:     recon.job_reference,
      recipient_role:    "admin",
      notification_type: "Payment Secured",
      priority:          "High",
      title:             `Reconciliation matched — Job ${recon.job_reference}: proceed to secure payment`,
      message:           `Payment reconciliation has been marked as Matched for ${currency} ${expectedAmt ?? "—"}. You may now proceed to Mark Payment Secured.`,
      action_url:        `/admin/jobs/${recon.job_reference}`,
      actor_id:          actorId, actor_name: actorName, actor_role: actorRole,
      created_at:        now,
    });
  }

  if (action === "mark_amount_mismatch") {
    const delta = receivedAmt != null && expectedAmt != null
      ? Number(receivedAmt) - Number(expectedAmt)
      : null;
    const deltaStr = delta != null
      ? ` Shortfall/Excess: ${delta >= 0 ? "+" : ""}${currency} ${Math.abs(delta).toFixed(2)}.`
      : "";

    // Notify admin and customer
    await svc.from("notifications").insert([
      {
        job_reference:     recon.job_reference,
        recipient_role:    "admin",
        notification_type: "Payment Proof Uploaded",
        priority:          "High",
        title:             `⚠ Amount Mismatch — Job ${recon.job_reference}`,
        message:           `Received ${currency} ${receivedAmt ?? "?"} does not match expected ${currency} ${expectedAmt ?? "?"}.${deltaStr} Admin review required. Payment cannot be secured until resolved.`,
        action_url:        `/admin/jobs/${recon.job_reference}`,
        actor_id:          actorId, actor_name: actorName, actor_role: actorRole,
        created_at:        now,
      },
      {
        job_reference:     recon.job_reference,
        recipient_role:    "customer",
        notification_type: "Payment Proof Uploaded",
        priority:          "High",
        title:             `Payment amount mismatch — Job ${recon.job_reference}`,
        message:           `Your payment proof was reviewed but the received amount does not match the expected amount.${deltaStr} Please contact Nexum Admin or submit a corrected payment.`,
        action_url:        `/customer/jobs/${recon.job_reference}`,
        actor_id:          actorId, actor_name: actorName, actor_role: actorRole,
        created_at:        now,
      },
    ]);

    // Create admin workflow task
    await svc.from("workflow_tasks").insert({
      job_reference:  recon.job_reference,
      task_type:      "Resolve Payment Mismatch",
      title:          `Resolve amount mismatch — Job ${recon.job_reference}`,
      description:    `Received amount does not match expected.${deltaStr} Contact customer and resolve before securing payment.`,
      assigned_role:  "admin",
      priority:       "High",
      status:         "Open",
      created_at:     now, updated_at: now,
    });
  }

  if (action === "mark_reference_mismatch" || action === "mark_duplicate_suspected" || action === "mark_unclear") {
    await svc.from("notifications").insert({
      job_reference:     recon.job_reference,
      recipient_role:    "admin",
      notification_type: "Payment Proof Uploaded",
      priority:          "High",
      title:             `⚠ ${newStatus} — Job ${recon.job_reference}`,
      message:           `Payment reconciliation flagged as ${newStatus}. Admin review required before payment can be secured.`,
      action_url:        `/admin/jobs/${recon.job_reference}`,
      actor_id:          actorId, actor_name: actorName, actor_role: actorRole,
      created_at:        now,
    });
  }

  if (action === "mark_rejected") {
    await svc.from("notifications").insert([
      {
        job_reference:     recon.job_reference,
        recipient_role:    "admin",
        notification_type: "Payment Proof Uploaded",
        priority:          "Critical",
        title:             `Payment rejected — Job ${recon.job_reference}`,
        message:           `Reconciliation rejected. Payment proof has been rejected. Customer must be notified. Payment will not be secured.`,
        action_url:        `/admin/jobs/${recon.job_reference}`,
        actor_id:          actorId, actor_name: actorName, actor_role: actorRole,
        created_at:        now,
      },
      {
        job_reference:     recon.job_reference,
        recipient_role:    "customer",
        notification_type: "Payment Proof Uploaded",
        priority:          "Critical",
        title:             `Payment proof rejected — Job ${recon.job_reference}`,
        message:           `Your payment proof has been reviewed and rejected. Reason: ${body.reconciliationNote ?? "Please contact Nexum Admin for details"}. Please resubmit a valid payment proof.`,
        action_url:        `/customer/jobs/${recon.job_reference}`,
        actor_id:          actorId, actor_name: actorName, actor_role: actorRole,
        created_at:        now,
      },
    ]);
  }

  // ── mark_payment_secured: also secure the held payment ────────────────────
  if (action === "mark_payment_secured") {
    if (!recon.held_payment_id) {
      return NextResponse.json({
        error: "Cannot secure payment — no held payment linked to this reconciliation"
      }, { status: 400 });
    }

    // Fetch the held payment to determine type
    const { data: hp } = await svc
      .from("held_payments")
      .select("id, payment_type, amount, currency, payment_obligation_id")
      .eq("id", recon.held_payment_id)
      .single();

    if (!hp) {
      return NextResponse.json({ error: "Linked held payment not found" }, { status: 404 });
    }

    const isFullPay = hp.payment_type === "Full Payment";
    const isDeposit = hp.payment_type === "Deposit";

    // Determine job updates
    let jobUpdate: Record<string, string> = { updated_at: now };
    if (isFullPay) {
      jobUpdate = { ...jobUpdate, payment_status: "Fully Paid", job_status: "Ready for Execution", current_milestone: "Full Payment Confirmed" };
    } else if (isDeposit) {
      jobUpdate = { ...jobUpdate, payment_status: "Deposit Confirmed", job_status: "Ready for Execution", current_milestone: "Deposit Confirmed" };
    }

    // Secure the held payment
    const { error: hpErr } = await svc
      .from("held_payments")
      .update({ holding_status: "Payment Secured", funds_received_at: now, secured_at: now, updated_at: now })
      .eq("id", recon.held_payment_id);
    if (hpErr) return NextResponse.json({ error: hpErr.message }, { status: 500 });

    // Update linked payment obligation
    if (hp.payment_obligation_id) {
      await svc.from("payment_obligations")
        .update({ status: "Verified", verified_at: now, updated_at: now })
        .eq("id", hp.payment_obligation_id as string);
    }

    // Update secured_jobs
    if (Object.keys(jobUpdate).length > 1) {
      await svc.from("secured_jobs")
        .update(jobUpdate)
        .eq("job_reference", recon.job_reference);
    }

    await svc.from("audit_logs").insert([
      {
        job_reference: recon.job_reference, actor_role: actorRole ?? "admin",
        actor_name: actorName ?? "Nexum Admin", action: "funds_marked_received",
        description: `Funds marked received following reconciliation match. ${hp.currency} ${hp.amount} (${hp.payment_type ?? "payment"}).`,
        created_at: now,
      },
      {
        job_reference: recon.job_reference, actor_role: actorRole ?? "admin",
        actor_name: actorName ?? "Nexum Admin", action: "payment_secured",
        description: `Payment Secured — ${hp.currency} ${hp.amount} confirmed in Designated Holding Account after reconciliation. Provider may proceed.`,
        created_at: now,
      },
    ]);

    // Notify provider and customer
    await svc.from("notifications").insert([
      {
        job_reference: recon.job_reference, recipient_role: "service_provider",
        notification_type: "Payment Secured", priority: "High",
        title: `Payment secured — Job ${recon.job_reference} ready for execution`,
        message: `${hp.payment_type ?? "Payment"} of ${hp.currency} ${hp.amount} has been reconciled and secured. You may proceed with job execution under the agreed workflow.`,
        action_url: `/provider/jobs/${recon.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
      {
        job_reference: recon.job_reference, recipient_role: "customer",
        notification_type: "Payment Secured", priority: "Medium",
        title: `Your ${hp.payment_type ?? "payment"} for Job ${recon.job_reference} is secured`,
        message: `${hp.currency} ${hp.amount} has been reconciled and confirmed in the Designated Holding Account. Your service provider has been notified to proceed.`,
        action_url: `/customer/jobs/${recon.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      },
    ]);

    return NextResponse.json({ success: true, action: "payment_secured" });
  }

  return NextResponse.json({ success: true, newStatus });
}
