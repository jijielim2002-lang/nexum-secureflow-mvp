// ─── PATCH /api/bank-statement-transactions/[txId] ───────────────────────────
// Admin actions on a single bank statement transaction.
//
// Actions:
//   confirm_match   — admin confirms the suggested or manual match
//                     incoming: updates holding_account_reconciliations
//                     outgoing: updates release_settlements (cascade)
//   reject_match    — reset to Unmatched, clear candidate links
//   ignore          — mark as Ignored (no reconciliation needed)
//   manual_link     — set matched_held_payment_id or matched_release_settlement_id
//                     and recompute confidence (marks as Suggested Match)
//
// COMPLIANCE: No funds are moved by this API. It only records admin confirmation
//             of a match between a bank statement row and an existing record.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreIncomingMatch, scoreOutgoingMatch, BANK_IMPORT_AUDIT_ACTIONS } from "@/lib/bankImport";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

type PatchAction = "confirm_match" | "reject_match" | "ignore" | "manual_link";

interface PatchBody {
  action:                         PatchAction;
  actorId?:                       string;
  actorRole?:                     string;
  actorName?:                     string;
  // manual_link
  matchedHeldPaymentId?:          string | null;
  matchedReleaseSettlementId?:    string | null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ txId: string }> },
) {
  const { txId } = await params;
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, actorId, actorRole, actorName } = body;
  const now = new Date().toISOString();

  const { data: tx, error: txErr } = await svc
    .from("bank_statement_transactions")
    .select("*")
    .eq("id", txId)
    .single();

  if (txErr || !tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  // ── reject_match ──────────────────────────────────────────────────────────────

  if (action === "reject_match") {
    await svc.from("bank_statement_transactions").update({
      match_status:                  "Unmatched",
      matched_held_payment_id:       null,
      matched_release_settlement_id: null,
      confidence_score:              null,
      match_reasons:                 null,
    }).eq("id", txId);

    await svc.from("audit_logs").insert({
      actor_role:  actorRole ?? "admin",
      actor_name:  actorName ?? "Nexum Admin",
      action:      BANK_IMPORT_AUDIT_ACTIONS.rejected,
      description: `Bank transaction match rejected by admin. TX: ${tx.reference ?? tx.description ?? txId}. Reset to Unmatched.`,
      created_at:  now,
    });

    await _updateImportStats(tx.import_id);
    return NextResponse.json({ success: true });
  }

  // ── ignore ────────────────────────────────────────────────────────────────────

  if (action === "ignore") {
    await svc.from("bank_statement_transactions").update({
      match_status:                  "Ignored",
      matched_held_payment_id:       null,
      matched_release_settlement_id: null,
    }).eq("id", txId);

    await svc.from("audit_logs").insert({
      actor_role:  actorRole ?? "admin",
      actor_name:  actorName ?? "Nexum Admin",
      action:      BANK_IMPORT_AUDIT_ACTIONS.ignored,
      description: `Bank transaction ignored. TX: ${tx.reference ?? tx.description ?? txId}. No reconciliation will be applied.`,
      created_at:  now,
    });

    await _updateImportStats(tx.import_id);
    return NextResponse.json({ success: true });
  }

  // ── manual_link ───────────────────────────────────────────────────────────────

  if (action === "manual_link") {
    const hpId    = body.matchedHeldPaymentId    ?? null;
    const settlId = body.matchedReleaseSettlementId ?? null;

    if (!hpId && !settlId) {
      return NextResponse.json({ error: "Provide matchedHeldPaymentId or matchedReleaseSettlementId" }, { status: 400 });
    }

    // Re-compute confidence for the manual link
    let score = 50;
    let reasons = "Manually linked by admin";

    if (hpId) {
      const { data: hp } = await svc.from("held_payments").select("id, job_reference, amount, currency, holding_status").eq("id", hpId).single();
      if (hp) {
        const r = scoreIncomingMatch(tx, hp as Parameters<typeof scoreIncomingMatch>[1]);
        score   = Math.max(r.score, 50);
        reasons = r.reasons.length ? r.reasons.join("; ") + "; Manually linked" : "Manually linked by admin";
      }
    }

    if (settlId) {
      const { data: rs } = await svc.from("release_settlements").select("id, job_reference, expected_release_amount, currency, settlement_status, payee_name, release_reference").eq("id", settlId).single();
      if (rs) {
        const r = scoreOutgoingMatch(tx, rs as Parameters<typeof scoreOutgoingMatch>[1]);
        score   = Math.max(r.score, 50);
        reasons = r.reasons.length ? r.reasons.join("; ") + "; Manually linked" : "Manually linked by admin";
      }
    }

    await svc.from("bank_statement_transactions").update({
      match_status:                  "Suggested Match",
      matched_held_payment_id:       hpId,
      matched_release_settlement_id: settlId,
      confidence_score:              score,
      match_reasons:                 reasons,
    }).eq("id", txId);

    return NextResponse.json({ success: true, newStatus: "Suggested Match", score });
  }

  // ── confirm_match ─────────────────────────────────────────────────────────────

  if (action === "confirm_match") {
    if (!tx.matched_held_payment_id && !tx.matched_release_settlement_id) {
      return NextResponse.json({ error: "No match to confirm — link a candidate first" }, { status: 400 });
    }

    // ── Incoming: update holding_account_reconciliations ──────────────────────

    if (tx.transaction_type === "Incoming" && tx.matched_held_payment_id) {
      const { data: hp } = await svc
        .from("held_payments")
        .select("id, job_reference, amount, currency, holding_status")
        .eq("id", tx.matched_held_payment_id)
        .single();

      if (!hp) return NextResponse.json({ error: "Linked held payment not found" }, { status: 404 });

      // Upsert reconciliation row: set received_amount, bank reference, status = Matched
      const { data: existingRecon } = await svc
        .from("holding_account_reconciliations")
        .select("id, reconciliation_status")
        .eq("held_payment_id", hp.id)
        .maybeSingle();

      if (existingRecon) {
        await svc.from("holding_account_reconciliations").update({
          received_amount:        tx.credit,
          payment_reference:      tx.reference ?? existingRecon.id,
          reconciliation_status:  "Matched",
          reconciled_at:          now,
          updated_at:             now,
        }).eq("id", existingRecon.id);
      } else {
        await svc.from("holding_account_reconciliations").insert({
          job_reference:         hp.job_reference,
          held_payment_id:       hp.id,
          expected_amount:       hp.amount,
          received_amount:       tx.credit,
          currency:              hp.currency,
          payment_reference:     tx.reference ?? null,
          payer_name:            tx.counterparty_name ?? null,
          reconciliation_status: "Matched",
          reconciled_at:         now,
          updated_at:            now,
        });
      }

      await svc.from("bank_statement_transactions").update({
        match_status: "Matched",
      }).eq("id", txId);

      await svc.from("audit_logs").insert({
        job_reference: hp.job_reference,
        actor_role:    actorRole ?? "admin",
        actor_name:    actorName ?? "Nexum Admin",
        action:        BANK_IMPORT_AUDIT_ACTIONS.confirmed,
        description:   `Incoming bank transaction matched to held payment (Job ${hp.job_reference}). Amount: ${hp.currency} ${tx.credit.toFixed(2)}. Reference: ${tx.reference ?? "—"}. Reconciliation status: Matched. Admin can now Mark Payment Secured.`,
        created_at:    now,
      });

      await svc.from("notifications").insert({
        job_reference:     hp.job_reference,
        recipient_role:    "admin",
        notification_type: "Payment Reconciled",
        priority:          "Medium",
        title:             `Bank statement match confirmed — Job ${hp.job_reference}`,
        message:           `Incoming bank transaction of ${hp.currency} ${tx.credit.toFixed(2)} matched to held payment. Reference: ${tx.reference ?? "—"}. Holding account reconciliation updated. You may now Mark Payment Secured.`,
        action_url:        `/admin/jobs/${hp.job_reference}`,
        actor_id:  actorId, actor_name: actorName, actor_role: actorRole,
        created_at: now,
      });
    }

    // ── Outgoing: update release_settlements (cascade per existing rules) ─────

    if (tx.transaction_type === "Outgoing" && tx.matched_release_settlement_id) {
      const { data: rs } = await svc
        .from("release_settlements")
        .select("*")
        .eq("id", tx.matched_release_settlement_id)
        .single();

      if (!rs) return NextResponse.json({ error: "Linked release settlement not found" }, { status: 404 });

      // Update settlement: record actual amount and bank reference; set Reconciled
      await svc.from("release_settlements").update({
        actual_released_amount:    tx.debit,
        bank_transaction_reference: tx.reference ?? null,
        settlement_status:         "Reconciled",
        reconciled_by:             adminId,
        reconciled_at:             now,
        reconciled_checker_by:     adminId,
        reconciled_checker_at:     now,
        released_at:               rs.released_at ?? now,
        updated_at:                now,
      }).eq("id", rs.id);

      // Mark held payment as Released
      if (rs.held_payment_id) {
        await svc.from("held_payments").update({
          holding_status: "Released",
          released_at:    now,
          updated_at:     now,
        }).eq("id", rs.held_payment_id);
      }

      // Mark release instruction as Completed
      if (rs.release_instruction_id) {
        await svc.from("release_instructions").update({
          release_status:    "Completed",
          governance_status: "Completed",
          completed_at:      now,
          updated_at:        now,
        }).eq("id", rs.release_instruction_id);
      }

      // Check if all held payments for the job are done → close job
      const { data: allHp } = await svc
        .from("held_payments")
        .select("id, holding_status")
        .eq("job_reference", rs.job_reference);

      const allReleased = (allHp ?? []).every(
        (r: { id: string; holding_status: string }) =>
          r.id === rs.held_payment_id ||
          r.holding_status === "Released" ||
          r.holding_status === "Cancelled",
      );

      if (allReleased) {
        await svc.from("secured_jobs").update({
          job_status:        "Completed",
          payment_status:    "Fully Paid",
          current_milestone: "Job Closed",
          updated_at:        now,
        }).eq("job_reference", rs.job_reference);
      }

      await svc.from("bank_statement_transactions").update({
        match_status: "Matched",
      }).eq("id", txId);

      await svc.from("audit_logs").insert({
        job_reference: rs.job_reference,
        actor_role:    actorRole ?? "admin",
        actor_name:    actorName ?? "Nexum Admin",
        action:        BANK_IMPORT_AUDIT_ACTIONS.confirmed,
        description:   `Outgoing bank transaction matched to release settlement (Job ${rs.job_reference}). Actual: ${rs.currency} ${tx.debit.toFixed(2)}. Bank TX Ref: ${tx.reference ?? "—"}. Settlement status: Reconciled. ${allReleased ? "All payments settled — job financially closed." : ""}`,
        created_at:    now,
      });

      await svc.from("notifications").insert([
        {
          job_reference:     rs.job_reference,
          recipient_role:    "service_provider",
          notification_type: "Payment Released",
          priority:          "High",
          title:             `Bank-reconciled settlement — Job ${rs.job_reference}`,
          message:           `Outgoing bank transaction of ${rs.currency} ${tx.debit.toFixed(2)} confirmed against your release settlement. Bank reference: ${tx.reference ?? "—"}. ${allReleased ? "Job is now financially closed." : ""}`,
          action_url:        `/provider/jobs/${rs.job_reference}`,
          actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
        },
        {
          job_reference:     rs.job_reference,
          recipient_role:    "admin",
          notification_type: "Settlement Reconciled",
          priority:          "Low",
          title:             `Release settlement bank-reconciled — Job ${rs.job_reference}`,
          message:           `${rs.currency} ${tx.debit.toFixed(2)} outgoing transaction confirmed. Settlement reconciled via bank statement import. ${allReleased ? "Job financially closed." : ""}`,
          action_url:        `/admin/jobs/${rs.job_reference}`,
          actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
        },
      ]);
    }

    await _updateImportStats(tx.import_id);
    return NextResponse.json({ success: true, newStatus: "Matched" });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// ─── Helper: recompute import stats ──────────────────────────────────────────

async function _updateImportStats(importId: string) {
  const { data } = await svc
    .from("bank_statement_transactions")
    .select("match_status")
    .eq("import_id", importId);

  const rows       = data ?? [];
  const totalRows  = rows.length;
  const matchedRows  = rows.filter((r: { match_status: string }) => r.match_status === "Matched").length;
  const unmatchedRows = rows.filter((r: { match_status: string }) => r.match_status === "Unmatched").length;

  await svc.from("bank_statement_imports").update({
    total_rows:     totalRows,
    matched_rows:   matchedRows,
    unmatched_rows: unmatchedRows,
  }).eq("id", importId);
}
