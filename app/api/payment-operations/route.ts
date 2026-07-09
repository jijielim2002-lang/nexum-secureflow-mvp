import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Thresholds ───────────────────────────────────────────────────────────────
const DUAL_APPROVAL_THRESHOLD    = 10_000;  // RM — second approver required for payout
const MANAGEMENT_REVIEW_THRESHOLD = 50_000; // RM — management sign-off required

// ─── Supabase service-role client ─────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function writeAudit(
  svc: ReturnType<typeof getSvc>,
  event_type: string,
  job_reference: string,
  actor_id: string,
  details: Record<string, unknown>,
) {
  await svc.from("audit_logs").insert({
    event_type,
    job_reference,
    actor_id,
    details,
    created_at: new Date().toISOString(),
  }).throwOnError();
}

// ─── Risk flag detection ──────────────────────────────────────────────────────

async function detectRiskFlag(
  svc: ReturnType<typeof getSvc>,
  body: Record<string, unknown>,
  obligationId?: string,
): Promise<string> {
  const amount    = Number(body.amount ?? 0);
  const currency  = String(body.currency ?? "RM");
  const payRef    = String(body.payment_reference ?? "");
  const payerName = String(body.bank_account_name ?? "");

  // Check obligation
  if (obligationId) {
    const { data: ob } = await svc
      .from("payment_obligations")
      .select("amount, currency")
      .eq("id", obligationId)
      .single();
    if (ob) {
      if (Math.abs(Number(ob.amount) - amount) > 0.01) return "Amount Mismatch";
      if (ob.currency && ob.currency !== currency)       return "Currency Mismatch";
    }
  }

  // Duplicate payment reference
  if (payRef) {
    const { data: dup } = await svc
      .from("manual_payment_operations")
      .select("id")
      .eq("payment_reference", payRef)
      .limit(1);
    if (dup && dup.length > 0) return "Duplicate Reference";
  }

  // No proof URL but no bank reference
  if (!body.proof_file_url && !body.bank_statement_reference) return "Unclear Proof";

  // Third-party payer heuristic (admin must check manually; default None)
  return "None";
}

// ─── Reference generator ──────────────────────────────────────────────────────

function genRef(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `MPO-${ts}-${rand}`;
}

// ─── GET /api/payment-operations ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();
    const url = req.nextUrl;

    const jobRef   = url.searchParams.get("jobReference") ?? undefined;
    const opType   = url.searchParams.get("operationType") ?? undefined;
    const status   = url.searchParams.get("status") ?? undefined;
    const riskFlag = url.searchParams.get("riskFlag") ?? undefined;
    const limit    = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500);

    let q = svc
      .from("manual_payment_operations")
      .select(`
        *,
        payer_company:payer_company_id(id, company_name),
        payee_company:payee_company_id(id, company_name)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (jobRef)   q = q.eq("job_reference", jobRef);
    if (opType)   q = q.eq("operation_type", opType);
    if (status)   q = q.eq("operation_status", status);
    if (riskFlag) q = q.eq("risk_flag", riskFlag);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      operations: data ?? [],
      thresholds: {
        dual_approval:    DUAL_APPROVAL_THRESHOLD,
        management_review: MANAGEMENT_REVIEW_THRESHOLD,
      },
    });
  } catch (err) {
    console.error("[payment-operations GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/payment-operations — create new operation ──────────────────────

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: Record<string, unknown> = await req.json();
    const svc = getSvc();

    const risk_flag = await detectRiskFlag(
      svc,
      body,
      body.payment_obligation_id as string | undefined,
    );

    const { data, error } = await svc
      .from("manual_payment_operations")
      .insert({
        operation_reference:  genRef(),
        job_reference:        body.job_reference,
        company_id:           body.company_id,
        payer_company_id:     body.payer_company_id,
        payee_company_id:     body.payee_company_id,
        payment_obligation_id: body.payment_obligation_id,
        held_payment_id:      body.held_payment_id,
        operation_type:       body.operation_type ?? "Customer Collection",
        amount:               Number(body.amount),
        currency:             body.currency ?? "RM",
        bank_account_name:    body.bank_account_name,
        bank_name:            body.bank_name,
        bank_account_last4:   body.bank_account_last4,
        payment_method:       body.payment_method ?? "Manual Bank Transfer",
        payment_reference:    body.payment_reference,
        payer_reference:      body.payer_reference,
        proof_file_url:       body.proof_file_url,
        risk_flag,
        created_by:           actor.userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(svc, "manual_payment_operation_created",
      String(body.job_reference), actor.userId,
      { operation_reference: (data as {operation_reference: string}).operation_reference, amount: body.amount, operation_type: body.operation_type });

    return NextResponse.json({ operation: data }, { status: 201 });
  } catch (err) {
    console.error("[payment-operations POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/payment-operations — admin actions ────────────────────────────
//
// action types:
//   verify_payment         → status=Verified, set verified_by/at/note, check risks
//   reject_payment         → status=Rejected
//   request_clarification  → status=In Review
//   mark_secured           → status=Secured (triggers held_payment update)
//   approve_release        → status=Approved for Release
//   put_on_hold            → status=On Hold
//   record_payout          → status=Paid Out, set payout fields (dual-control check)
//   second_approve_payout  → set second_approver_id (dual-control step)
//   mark_reconciled        → reconciliation_status=Reconciled
//   record_refund          → status=Cancelled + new Refund operation
//   add_verification_note  → append verification_note
//   add_payout_note        → append payout_note
//   add_reconciliation_note → append reconciliation_note
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      id:                   string;
      action:               string;
      verification_note?:   string;
      bank_statement_reference?: string;
      risk_flag?:           string;
      payout_reference?:    string;
      payout_bank_name?:    string;
      payout_account_name?: string;
      payout_account_last4?: string;
      payout_note?:         string;
      reconciliation_note?: string;
      second_approval_note?: string;
      refund_amount?:       number;
      refund_note?:         string;
    } = await req.json();

    if (!body.id || !body.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const svc = getSvc();

    // ── Live-mode gate checks ──────────────────────────────────────────────────
    // Read system_settings to enforce deployment safety gates.
    // These guard real pilot actions when live flags are disabled.

    const { data: sysRows } = await svc
      .from("system_settings")
      .select("key, value");
    const sys: Record<string, string> = {};
    for (const r of sysRows ?? []) sys[r.key] = r.value;

    const gatedPaymentActions  = ["verify_payment", "mark_secured"];
    const gatedReleaseActions  = ["approve_release", "record_payout", "second_approve_payout"];

    if (gatedPaymentActions.includes(body.action) && sys.live_payment_enabled === "false") {
      return NextResponse.json({
        error: "Live payment actions are currently disabled. Enable live_payment_enabled in Deployment Settings before proceeding.",
        code:  "LIVE_PAYMENT_DISABLED",
      }, { status: 403 });
    }

    if (gatedReleaseActions.includes(body.action) && sys.live_release_enabled === "false") {
      return NextResponse.json({
        error: "Live release/payout actions are currently disabled. Enable live_release_enabled in Deployment Settings before proceeding.",
        code:  "LIVE_RELEASE_DISABLED",
      }, { status: 403 });
    }

    // Fetch current operation
    const { data: op, error: fetchErr } = await svc
      .from("manual_payment_operations")
      .select("*")
      .eq("id", body.id)
      .single();

    if (fetchErr || !op) {
      return NextResponse.json({ error: "Operation not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    let patch: Record<string, unknown> = {};
    let auditEvent = "";

    // ── Risk guards ────────────────────────────────────────────────────────────

    if (body.action === "approve_release") {
      // Block if dispute open
      const { data: disputes } = await svc
        .from("disputes")
        .select("id")
        .eq("job_reference", op.job_reference)
        .in("status", ["Open", "Under Review"])
        .limit(1);
      if (disputes && disputes.length > 0) {
        return NextResponse.json({
          error: "Release blocked: an open dispute exists for this job. Resolve the dispute first.",
          code: "DISPUTE_OPEN",
        }, { status: 409 });
      }
    }

    if (body.action === "record_payout") {
      const amount = Number(op.amount ?? 0);
      // Dual-control check
      if (amount >= DUAL_APPROVAL_THRESHOLD && !op.second_approver_id) {
        return NextResponse.json({
          error: `Payout of ${op.currency} ${amount.toFixed(2)} requires a second approver (dual-control threshold: ${op.currency} ${DUAL_APPROVAL_THRESHOLD.toLocaleString()}).`,
          code: "REQUIRES_SECOND_APPROVAL",
          threshold: DUAL_APPROVAL_THRESHOLD,
        }, { status: 409 });
      }
      // Management review check
      if (amount >= MANAGEMENT_REVIEW_THRESHOLD && !op.second_approver_id) {
        return NextResponse.json({
          error: `Payout of ${op.currency} ${amount.toFixed(2)} requires management review (threshold: ${op.currency} ${MANAGEMENT_REVIEW_THRESHOLD.toLocaleString()}).`,
          code: "REQUIRES_MANAGEMENT_REVIEW",
          threshold: MANAGEMENT_REVIEW_THRESHOLD,
        }, { status: 409 });
      }
    }

    // ── Action dispatch ────────────────────────────────────────────────────────

    switch (body.action) {
      case "verify_payment":
        patch = {
          operation_status:        "Verified",
          verified_by:             actor.userId,
          verified_at:             now,
          verification_note:       body.verification_note ?? null,
          bank_statement_reference: body.bank_statement_reference ?? op.bank_statement_reference,
          risk_flag:               body.risk_flag ?? op.risk_flag,
        };
        auditEvent = "payment_proof_verified";
        break;

      case "reject_payment":
        patch = {
          operation_status:  "Rejected",
          verification_note: body.verification_note ?? null,
          risk_flag:         body.risk_flag ?? op.risk_flag,
          verified_by:       actor.userId,
          verified_at:       now,
        };
        auditEvent = "payment_proof_rejected";
        break;

      case "request_clarification":
        patch = {
          operation_status:  "In Review",
          verification_note: body.verification_note ?? op.verification_note,
        };
        auditEvent = "payment_clarification_requested";
        break;

      case "mark_secured":
        patch = {
          operation_status: "Secured",
          verified_by:      actor.userId,
          verified_at:      now,
        };
        // Also update held_payment if linked
        if (op.held_payment_id) {
          await svc.from("held_payments")
            .update({ holding_status: "Payment Secured" })
            .eq("id", op.held_payment_id);
        }
        // Update job payment_status
        await svc.from("secured_jobs")
          .update({ payment_status: "Payment Secured" })
          .eq("job_reference", op.job_reference);
        auditEvent = "payment_marked_secured";
        break;

      case "approve_release":
        patch = {
          operation_status: "Approved for Release",
          verified_by:      actor.userId,
          verified_at:      now,
          verification_note: body.verification_note ?? op.verification_note,
        };
        auditEvent = "release_approved";
        break;

      case "put_on_hold":
        patch = {
          operation_status:  "On Hold",
          verification_note: body.verification_note ?? op.verification_note,
        };
        auditEvent = "release_put_on_hold";
        break;

      case "second_approve_payout":
        patch = {
          second_approver_id:   actor.userId,
          second_approved_at:   now,
          second_approval_note: body.second_approval_note ?? null,
        };
        auditEvent = "payout_second_approved";
        break;

      case "record_payout":
        patch = {
          operation_status:     "Paid Out",
          payout_bank_name:     body.payout_bank_name ?? op.payout_bank_name,
          payout_account_name:  body.payout_account_name ?? op.payout_account_name,
          payout_account_last4: body.payout_account_last4 ?? op.payout_account_last4,
          payout_reference:     body.payout_reference ?? null,
          payout_processed_by:  actor.userId,
          payout_processed_at:  now,
          payout_note:          body.payout_note ?? null,
          reconciliation_status: "Pending",
        };
        auditEvent = "manual_payout_recorded";
        break;

      case "mark_reconciled":
        patch = {
          reconciliation_status: "Reconciled",
          reconciliation_note:   body.reconciliation_note ?? null,
        };
        auditEvent = "settlement_reconciled";
        break;

      case "record_refund": {
        patch = { operation_status: "Cancelled" };
        // Create a sibling Refund operation
        const { data: refundOp } = await svc
          .from("manual_payment_operations")
          .insert({
            operation_reference:  genRef(),
            job_reference:        op.job_reference,
            company_id:           op.company_id,
            payer_company_id:     op.payee_company_id, // reversed — Nexum pays back customer
            payee_company_id:     op.payer_company_id,
            payment_obligation_id: op.payment_obligation_id,
            held_payment_id:      op.held_payment_id,
            operation_type:       "Refund",
            amount:               body.refund_amount ?? op.amount,
            currency:             op.currency,
            payout_note:          body.refund_note ?? "Refund of original payment",
            created_by:           actor.userId,
          })
          .select()
          .single();
        auditEvent = "refund_recorded";
        await writeAudit(svc, auditEvent, op.job_reference, actor.userId, {
          original_op_id:   op.id,
          refund_op_ref:    (refundOp as {operation_reference: string} | null)?.operation_reference,
          refund_amount:    body.refund_amount,
        });
        break;
      }

      case "add_verification_note":
        patch = { verification_note: body.verification_note ?? op.verification_note };
        auditEvent = "";
        break;

      case "add_payout_note":
        patch = { payout_note: body.payout_note ?? op.payout_note };
        auditEvent = "";
        break;

      case "add_reconciliation_note":
        patch = { reconciliation_note: body.reconciliation_note ?? op.reconciliation_note };
        auditEvent = "";
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await svc
      .from("manual_payment_operations")
      .update(patch)
      .eq("id", body.id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (auditEvent) {
      await writeAudit(svc, auditEvent, op.job_reference, actor.userId, {
        operation_id:        op.id,
        operation_reference: op.operation_reference,
        action:              body.action,
        amount:              op.amount,
        currency:            op.currency,
      });
    }

    return NextResponse.json({ operation: updated });
  } catch (err) {
    console.error("[payment-operations PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
