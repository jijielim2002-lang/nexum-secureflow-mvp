import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { calcDueAt, postConfirmationUpdate, isFullPaymentJob } from "@/lib/deliveryConfirmation";
import { calculateWorkingHoursDeadline } from "@/lib/workingHours";
import { insertAuditLogWithClient }   from "@/lib/auditLog";
import type { DisputeType }           from "@/lib/disputes";

// ─── Service-role Supabase client ─────────────────────────────────────────────

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthenticatedProfile(req: NextRequest) {
  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const db = svc();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    ...(profile as { id: string; full_name: string; role: string; company_id: string | null }),
    // Email comes from auth.users — add it alongside the profile fields
    email: user.email ?? null,
  };
}

// ─── GET /api/delivery-confirmations ─────────────────────────────────────────
// Returns delivery confirmations. Optionally filtered by ?status=Pending or
// ?job_reference=NSF-2025-001

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status           = searchParams.get("status");
  const jobRef           = searchParams.get("job_reference");
  const limit            = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  const db = svc();
  let query = db
    .from("delivery_confirmations")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (status)  query = query.eq("status", status);
  if (jobRef)  query = query.eq("job_reference", jobRef);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ confirmations: data ?? [] });
}

// ─── POST /api/delivery-confirmations ────────────────────────────────────────
// action: "request"  — called by provider POD upload
// action: "confirm"  — called by customer confirming receipt
// action: "dispute"  — called by customer raising dispute

export async function POST(req: NextRequest) {
  const profile = await getAuthenticatedProfile(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action:          "request" | "confirm" | "dispute" | "clarify";
    job_reference:   string;
    confirmation_id?: string;
    dispute_reason?: string;
    dispute_type?:   DisputeType;
    claim_amount?:   number | null;
    response_note?:  string;
    clarify_note?:   string;
    pod_document_id?: string;
    customer_company_id?: string;
    provider_company_id?: string;
    // job metadata needed for post-confirmation updates
    payment_terms?:    string;
    required_deposit?: number | null;
    job_value?:        number;
  };

  const db = svc();
  const now = new Date().toISOString();

  // ── REQUEST (provider triggers confirmation on POD upload) ─────────────────
  if (body.action === "request") {
    if (!["admin", "provider"].includes(profile.role)) {
      return NextResponse.json({ error: "Only providers or admins can request delivery confirmation" }, { status: 403 });
    }

    const due = calcDueAt(new Date(), 48).toISOString();

    // Insert delivery_confirmations row
    const { data: dcRow, error: dcErr } = await db
      .from("delivery_confirmations")
      .insert({
        job_reference:        body.job_reference,
        customer_company_id:  body.customer_company_id ?? null,
        provider_company_id:  body.provider_company_id ?? null,
        pod_document_id:      body.pod_document_id ?? null,
        status:               "Pending",
        requested_at:         now,
        due_at:               due,
        updated_at:           now,
      })
      .select()
      .single();

    if (dcErr) return NextResponse.json({ error: dcErr.message }, { status: 500 });

    // Calculate the 48 working-hour deadline (Malaysia working hours: Mon-Fri 09:00-18:00 MYT)
    const workingDeadline = calculateWorkingHoursDeadline(new Date(), 48).toISOString();

    // Update secured_jobs — include automation columns
    const { error: jobErr } = await db
      .from("secured_jobs")
      .update({
        delivery_confirmation_status:        "Pending Customer Confirmation",
        delivery_confirmation_requested_at:   now,
        delivery_confirmation_due_at:         due,
        pod_uploaded_at:                      now,
        customer_confirmation_deadline_at:    workingDeadline,
        customer_confirmation_status:         "Pending",
        auto_confirmation_eligible:           true,
        dispute_status:                       "None",
        job_status:                          "Pending Customer Confirmation",
        current_milestone:                   "POD Uploaded — Awaiting Customer Confirmation",
        updated_at:                           now,
      })
      .eq("job_reference", body.job_reference);

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

    // Record delivery_confirmation_events entry for POD upload
    void db.from("delivery_confirmation_events").insert({
      job_reference: body.job_reference,
      event_type:    "pod_uploaded",
      actor_id:      profile.id,
      actor_name:    profile.full_name,
      actor_role:    profile.role,
      metadata:      { pod_document_id: body.pod_document_id ?? null, deadline_at: workingDeadline },
      created_at:    now,
    });

    // Audit log
    await insertAuditLogWithClient(db, {
      job_reference: body.job_reference,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "pod_uploaded_confirmation_window_started",
      description:   `POD uploaded. 48 working-hour confirmation window started. Customer deadline: ${workingDeadline.slice(0, 16).replace("T", " ")} UTC. Auto-confirmation eligible.`,
    });

    // Notify customer
    await db.from("notifications").insert({
      job_reference:     body.job_reference,
      recipient_role:    "customer",
      recipient_company_id: body.customer_company_id ?? null,
      notification_type: "Delivery Confirmation Required",
      priority:          "High",
      title:             `Please confirm cargo receipt — Job ${body.job_reference}`,
      message:           `Your service provider has uploaded Proof of Delivery for Job ${body.job_reference}. Please confirm receipt or raise a dispute by ${workingDeadline.slice(0, 16).replace("T", " ")} UTC (48 working hours, Mon–Fri 09:00–18:00 MYT). If no response is received, delivery will be auto-confirmed for release review.`,
      action_url:        `/customer/jobs/${body.job_reference}`,
      actor_id:          profile.id,
      actor_name:        profile.full_name,
      actor_role:        profile.role,
      is_read:           false,
      created_at:        now,
    });

    // Create customer workflow task
    await db.from("workflow_tasks").insert({
      job_reference:  body.job_reference,
      task_type:      "Confirm Delivery Receipt",
      title:          "Confirm cargo receipt",
      description:    `Provider has uploaded POD for Job ${body.job_reference}. Please confirm you have received the cargo, or raise a dispute if there is an issue.`,
      assigned_role:  "customer",
      company_id:     body.customer_company_id ?? null,
      priority:       "High",
      status:         "Open",
      due_at:         due,
      created_at:     now,
      updated_at:     now,
    });

    return NextResponse.json({ confirmation: dcRow, due_at: due });
  }

  // ── CONFIRM (customer confirms receipt) ────────────────────────────────────
  if (body.action === "confirm") {
    if (profile.role !== "customer" && profile.role !== "admin") {
      return NextResponse.json({ error: "Only customers or admins can confirm delivery" }, { status: 403 });
    }

    // ── Determine payment path ────────────────────────────────────────────────
    const payTerms   = body.payment_terms ?? "";
    const reqDeposit = body.required_deposit ?? null;
    const jobVal     = body.job_value ?? 0;
    const isFullPay  = isFullPaymentJob(payTerms, reqDeposit, jobVal);

    const newMilestone = isFullPay
      ? "Receipt Confirmed — Job Closed"
      : "Receipt Confirmed — Awaiting Release Approval";
    const newJobStatus = isFullPay
      ? "Completed"
      : "Receipt Confirmed — Awaiting Release Approval";

    // ── 1. Update secured_jobs (PRIMARY — only blocking call) ─────────────────
    // Split into two layers:
    //   corePayload  — columns guaranteed to exist in the base schema
    //   extPayload   — columns added by migrations 010–013 (may not exist yet)
    //
    // Strategy: attempt full update. If Postgres returns "column does not exist"
    // (error code 42703), fall back to core-only so confirmation never fails due
    // to a missing optional column. Run migration 013 to add all ext columns.

    const corePayload: Record<string, unknown> = {
      delivery_confirmation_status:  "Confirmed by Customer",
      delivery_confirmed_at:         now,
      customer_confirmed_at:         now,
      customer_confirmation_status:  "Confirmed",
      customer_confirmation_method:  "Customer Manual Confirmation",
      auto_confirmation_eligible:    false,
      release_blocked:               false,
      current_milestone:             newMilestone,
      job_status:                    newJobStatus,
      updated_at:                    now,
    };

    // Optional columns added by migrations — included only when values exist
    const extPayload: Record<string, unknown> = {
      workflow_status:               newJobStatus,
      ...(profile.id      ? { customer_confirmed_by:       profile.id }         : { customer_confirmed_by: null }),
      ...(profile.id      ? { delivery_confirmed_by:       profile.id }         : {}),
      ...(profile.email   ? { customer_confirmed_by_email: profile.email }      : {}),
      ...(profile.full_name ? { customer_confirmed_by_name: profile.full_name } : {}),
      ...(body.response_note ? { customer_confirmation_note: body.response_note } : {}),
    };

    let jobErr: { message: string; code?: string; details?: string; hint?: string } | null = null;

    // Attempt 1 — full payload (works after migration 013)
    const { error: fullErr } = await db
      .from("secured_jobs")
      .update({ ...corePayload, ...extPayload })
      .eq("job_reference", body.job_reference);

    if (fullErr) {
      const isColumnMissing =
        fullErr.code === "42703" ||
        (fullErr.message ?? "").toLowerCase().includes("column");

      if (isColumnMissing) {
        // Attempt 2 — core-only fallback (works even before migration is applied)
        const { error: coreErr } = await db
          .from("secured_jobs")
          .update(corePayload)
          .eq("job_reference", body.job_reference);
        jobErr = coreErr
          ? { message: coreErr.message, code: coreErr.code, details: coreErr.details, hint: coreErr.hint }
          : null;
      } else {
        jobErr = { message: fullErr.message, code: fullErr.code, details: fullErr.details, hint: fullErr.hint };
      }
    }

    if (jobErr) {
      return NextResponse.json({
        error:   jobErr.message,
        table:   "secured_jobs",
        code:    jobErr.code    ?? null,
        details: jobErr.details ?? null,
        hint:    jobErr.hint    ?? null,
      }, { status: 500 });
    }

    // ── 2. Non-blocking: delivery_confirmations table ─────────────────────────
    // Find existing Pending row and mark it Confirmed, or insert a new Confirmed row.
    // Failure here does NOT fail the confirmation — secured_jobs is the source of truth.
    void (async () => {
      try {
        const { data: existingDC } = await db
          .from("delivery_confirmations")
          .select("id")
          .eq("job_reference", body.job_reference)
          .eq("status", "Pending")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingDC) {
          await db
            .from("delivery_confirmations")
            .update({
              status:        "Confirmed",
              responded_at:  now,
              responded_by:  profile.id,
              response_note: body.response_note ?? null,
              updated_at:    now,
            })
            .eq("id", (existingDC as Record<string, unknown>)["id"] as string);
        } else {
          await db
            .from("delivery_confirmations")
            .insert({
              job_reference: body.job_reference,
              status:        "Confirmed",
              requested_at:  now,
              responded_at:  now,
              responded_by:  profile.id,
              response_note: body.response_note ?? null,
              due_at:        now,
              updated_at:    now,
            });
        }
      } catch { /* non-blocking — secured_jobs already updated */ }
    })();

    // ── 3. Non-blocking: delivery_confirmation_events ─────────────────────────
    void (async () => {
      try {
        await db.from("delivery_confirmation_events").insert({
          job_reference: body.job_reference,
          event_type:    "Customer Confirmed",
          actor_id:      profile.id,
          actor_name:    profile.full_name,
          actor_role:    profile.role,
          metadata:      { milestone: newMilestone, response_note: body.response_note ?? null },
          created_at:    now,
        });
      } catch { /* non-blocking */ }
    })();

    // ── 4. Non-blocking: audit log ────────────────────────────────────────────
    void Promise.allSettled([
      insertAuditLogWithClient(db, {
        job_reference: body.job_reference,
        actor_role:    profile.role,
        actor_name:    profile.full_name,
        action:        "customer_delivery_confirmed",
        description:   isFullPay
          ? "Customer confirmed cargo receipt. Full payment already confirmed — job is now closed."
          : "Customer confirmed cargo receipt. Receipt Confirmed — Awaiting Release Approval. Nexum Admin will review and process release.",
      }),
      isFullPay
        ? insertAuditLogWithClient(db, {
            job_reference: body.job_reference,
            actor_role:    profile.role,
            actor_name:    profile.full_name,
            action:        "full_payment_job_closed_after_receipt_confirmation",
            description:   `Full payment job ${body.job_reference} closed after customer receipt confirmation. No balance payment required.`,
          })
        : insertAuditLogWithClient(db, {
            job_reference: body.job_reference,
            actor_role:    profile.role,
            actor_name:    profile.full_name,
            action:        "balance_obligation_unlocked_after_delivery_confirmation",
            description:   `Balance payment obligation unlocked for Job ${body.job_reference} following customer receipt confirmation.`,
          }),
    ]);

    // ── 5. Non-blocking: release_instructions update + workflow task + notifications ──
    void (async () => {
      try {
        // Mark existing release_instructions as customer-confirmed
        await db
          .from("release_instructions")
          .update({
            release_eligibility_status: "Eligible",
            customer_confirmed:         true,
            customer_confirmed_at:      now,
            updated_at:                 now,
          })
          .eq("job_reference", body.job_reference)
          .not("release_status", "in", '("Rejected","Cancelled")');
      } catch { /* non-blocking */ }

      try {
        // Close open "Confirm Delivery Receipt" workflow task
        await db
          .from("workflow_tasks")
          .update({ status: "Completed", updated_at: now })
          .eq("job_reference", body.job_reference)
          .eq("task_type", "Confirm Delivery Receipt")
          .eq("status", "Open");
      } catch { /* non-blocking */ }

      // Notify provider, admin, and customer (all non-blocking)
      void Promise.allSettled([
        db.from("notifications").insert({
          job_reference:        body.job_reference,
          recipient_role:       "provider",
          notification_type:    "Other",
          priority:             "High",
          title:                `Delivery confirmed by customer — Job ${body.job_reference}`,
          message:              isFullPay
            ? `Customer has confirmed cargo receipt for Job ${body.job_reference}. The job is now closed.`
            : `Customer has confirmed cargo receipt for Job ${body.job_reference}. Eligible for release under agreed workflow once admin verifies.`,
          action_url:           `/provider/jobs/${body.job_reference}`,
          actor_id:             profile.id,
          actor_name:           profile.full_name,
          actor_role:           profile.role,
          is_read:              false,
          created_at:           now,
        }),
        db.from("notifications").insert({
          job_reference:     body.job_reference,
          recipient_role:    "admin",
          notification_type: "Other",
          priority:          "High",
          title:             `Delivery confirmed — Job ${body.job_reference} — ${isFullPay ? "Job Closed" : "Awaiting Release Approval"}`,
          message:           isFullPay
            ? `Customer confirmed receipt for Job ${body.job_reference}. Full payment was already confirmed. Job is now Completed.`
            : `Customer confirmed receipt for Job ${body.job_reference}. Status: Receipt Confirmed — Awaiting Release Approval. Please review and approve release.`,
          action_url:        `/admin/jobs/${body.job_reference}`,
          actor_id:          profile.id,
          actor_name:        profile.full_name,
          actor_role:        profile.role,
          is_read:           false,
          created_at:        now,
        }),
        ...(isFullPay ? [] : [
          db.from("notifications").insert({
            job_reference:     body.job_reference,
            recipient_role:    "customer",
            notification_type: "Other",
            priority:          "High",
            title:             `Balance payment now payable — Job ${body.job_reference}`,
            message:           `You have confirmed cargo receipt for Job ${body.job_reference}. Balance payment is now payable. Please upload your balance payment proof when ready.`,
            action_url:        `/customer/jobs/${body.job_reference}`,
            actor_id:          profile.id,
            actor_name:        profile.full_name,
            actor_role:        profile.role,
            is_read:           false,
            created_at:        now,
          }),
        ]),
      ]);
    })();

    // ── 6. Non-blocking: held payment release eligibility ─────────────────────
    void (async () => {
      try {
        const { data: securedHp } = await db
          .from("held_payments")
          .select("id")
          .eq("job_reference", body.job_reference)
          .eq("holding_status", "Payment Secured");

        for (const hp of (securedHp ?? [])) {
          await db
            .from("held_payments")
            .update({
              holding_status:      "Release Eligible",
              release_eligible_at: now,
              updated_at:          now,
            })
            .eq("id", hp.id);

          const { data: hpRow } = await db
            .from("held_payments")
            .select("payment_type, amount, currency, payee_company_id")
            .eq("id", hp.id)
            .single();

          if (hpRow) {
            const releaseType = isFullPay
              ? "Full Payment Release"
              : (hpRow.payment_type === "Deposit" ? "Deposit Release" : "Balance Release");

            await db.from("release_instructions").insert({
              job_reference:    body.job_reference,
              held_payment_id:  hp.id,
              payee_company_id: (hpRow as Record<string, unknown>)["payee_company_id"] as string | null,
              amount:           (hpRow as Record<string, unknown>)["amount"] as number,
              currency:         (hpRow as Record<string, unknown>)["currency"] as string,
              release_type:     releaseType,
              release_status:   "Pending Approval",
              created_at:       now,
              updated_at:       now,
            });
          }
        }

        if ((securedHp ?? []).length > 0) {
          await insertAuditLogWithClient(db, {
            job_reference: body.job_reference,
            actor_role:    "system",
            actor_name:    "Nexum SecureFlow",
            action:        "release_became_eligible",
            description:   `${(securedHp ?? []).length} held payment(s) marked Release Eligible following delivery confirmation. Release Instructions created — pending admin approval.`,
          });
        }
      } catch { /* non-blocking */ }
    })();

    return NextResponse.json({ success: true, isFullPay, milestone: newMilestone });
  }

  // ── DISPUTE (customer raises dispute) ─────────────────────────────────────
  if (body.action === "dispute") {
    if (profile.role !== "customer" && profile.role !== "admin") {
      return NextResponse.json({ error: "Only customers or admins can raise delivery disputes" }, { status: 403 });
    }
    if (!body.dispute_reason?.trim()) {
      return NextResponse.json({ error: "dispute_reason is required" }, { status: 400 });
    }

    // Resolve DC row — same fallback as confirm
    let existing: Record<string, unknown> | null = null;

    if (body.confirmation_id) {
      const { data } = await db
        .from("delivery_confirmations")
        .select("*")
        .eq("id", body.confirmation_id)
        .maybeSingle();
      existing = data as Record<string, unknown> | null;
    } else {
      const { data } = await db
        .from("delivery_confirmations")
        .select("*")
        .eq("job_reference", body.job_reference)
        .eq("status", "Pending")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existing = data as Record<string, unknown> | null;

      if (!existing) {
        const due = calcDueAt(new Date(), 48).toISOString();
        const { data: newDC, error: createErr } = await db
          .from("delivery_confirmations")
          .insert({
            job_reference: body.job_reference,
            status:        "Pending",
            requested_at:  now,
            due_at:        due,
            updated_at:    now,
          })
          .select()
          .single();
        if (createErr || !newDC) return NextResponse.json({ error: "Failed to create delivery confirmation record" }, { status: 500 });
        existing = newDC as Record<string, unknown>;
      }
    }

    if (!existing) return NextResponse.json({ error: "Confirmation not found" }, { status: 404 });
    if (existing["status"] !== "Pending") {
      return NextResponse.json({ error: `Cannot dispute — status is already '${existing["status"] as string}'` }, { status: 409 });
    }

    const disputeExistingId             = existing["id"] as string;
    const disputeProviderCompId = (existing["provider_company_id"] ?? null) as string | null;

    // Update delivery_confirmations
    await db
      .from("delivery_confirmations")
      .update({
        status:         "Disputed",
        responded_at:   now,
        responded_by:   profile.id,
        dispute_reason: body.dispute_reason,
        updated_at:     now,
      })
      .eq("id", disputeExistingId);

    // Update secured_jobs — block release, disable auto-confirmation
    await db
      .from("secured_jobs")
      .update({
        delivery_confirmation_status: "Disputed",
        delivery_dispute_reason:      body.dispute_reason,
        customer_confirmation_status: "Disputed",
        customer_confirmation_method: "Customer Disputed",
        auto_confirmation_eligible:   false,
        dispute_status:               "Open",
        release_blocked:              true,
        job_status:                   "Delivery Disputed",
        current_milestone:            "Dispute Raised",
        updated_at:                   now,
      })
      .eq("job_reference", body.job_reference);

    // Record delivery_confirmation_events
    void db.from("delivery_confirmation_events").insert({
      job_reference: body.job_reference,
      event_type:    "customer_disputed",
      actor_id:      profile.id,
      actor_name:    profile.full_name,
      actor_role:    profile.role,
      metadata:      { dispute_type: body.dispute_type ?? null, dispute_reason: body.dispute_reason, claim_amount: body.claim_amount ?? null },
      created_at:    now,
    });

    // Create exception
    await db.from("job_exceptions").insert({
      job_reference:  body.job_reference,
      exception_type: "Customer Dispute",
      severity:       "High",
      status:         "Open",
      title:          `Delivery disputed by customer — Job ${body.job_reference}`,
      description:    `Customer raised a delivery dispute. Reason: ${body.dispute_reason}`,
      reported_by_id: profile.id,
      reported_by:    profile.full_name,
      reported_at:    now,
      created_at:     now,
      updated_at:     now,
    });

    // Audit log — matching required event name
    await insertAuditLogWithClient(db, {
      job_reference: body.job_reference,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "customer_dispute_raised",
      description:   `Customer raised delivery dispute. Type: ${body.dispute_type ?? "—"}. Reason: ${body.dispute_reason}. Release is blocked pending resolution.`,
    });

    // Close workflow task
    await db
      .from("workflow_tasks")
      .update({ status: "Cancelled", updated_at: now })
      .eq("job_reference", body.job_reference)
      .eq("task_type", "Confirm Delivery Receipt")
      .eq("status", "Open");

    // Notify admin
    await db.from("notifications").insert({
      job_reference:     body.job_reference,
      recipient_role:    "admin",
      notification_type: "Other",
      priority:          "High",
      title:             `⚠ Delivery disputed — Job ${body.job_reference}`,
      message:           `Customer has raised a delivery dispute for Job ${body.job_reference}. Reason: ${body.dispute_reason}. Balance payment is on hold. Please review and resolve.`,
      action_url:        `/admin/jobs/${body.job_reference}`,
      actor_id:          profile.id,
      actor_name:        profile.full_name,
      actor_role:        profile.role,
      is_read:           false,
      created_at:        now,
    });

    // Notify provider
    await db.from("notifications").insert({
      job_reference:        body.job_reference,
      recipient_role:       "provider",
      recipient_company_id: disputeProviderCompId,
      notification_type:    "Other",
      priority:             "High",
      title:                `⚠ Customer disputed delivery — Job ${body.job_reference}`,
      message:              `Customer has raised a delivery dispute for Job ${body.job_reference}. Reason: ${body.dispute_reason}. Nexum Admin has been notified. Balance payment is on hold.`,
      action_url:           `/provider/jobs/${body.job_reference}`,
      actor_id:             profile.id,
      actor_name:           profile.full_name,
      actor_role:           profile.role,
      is_read:              false,
      created_at:           now,
    });

    // Also create a dispute_cases row so the Dispute & Claims module tracks this
    const disputeType: DisputeType = body.dispute_type ?? "Delivery Not Received";
    await db.from("dispute_cases").insert({
      job_reference:        body.job_reference,
      dispute_type:         disputeType,
      raised_by_role:       profile.role,
      raised_by_user_id:    profile.id,
      raised_by_company_id: profile.company_id ?? null,
      against_company_id:   disputeProviderCompId,
      status:               "Open",
      severity:             "High",
      claim_amount:         body.claim_amount ?? null,
      currency:             "RM",
      dispute_reason:       body.dispute_reason,
      created_at:           now,
      updated_at:           now,
    });

    // Workflow task for provider to respond
    await db.from("workflow_tasks").insert({
      job_reference:  body.job_reference,
      task_type:      "Respond to Dispute",
      title:          `Respond to delivery dispute — Job ${body.job_reference}`,
      description:    `Customer raised a delivery dispute. Reason: ${body.dispute_reason}. Submit your response in the job page.`,
      assigned_role:  "provider",
      company_id:     disputeProviderCompId,
      priority:       "High",
      status:         "Open",
      created_at:     now,
      updated_at:     now,
    });

    // Workflow task for admin to review
    await db.from("workflow_tasks").insert({
      job_reference:  body.job_reference,
      task_type:      "Review Dispute",
      title:          `Review delivery dispute — Job ${body.job_reference}`,
      description:    `Customer raised a ${disputeType} dispute. Reason: ${body.dispute_reason}. Review evidence and resolve.`,
      assigned_role:  "admin",
      priority:       "High",
      status:         "Open",
      created_at:     now,
      updated_at:     now,
    });

    // ── Block held payments due to dispute ────────────────────────────────────
    void (async () => {
      try {
        const { data: securedHp } = await db
          .from("held_payments")
          .select("id")
          .eq("job_reference", body.job_reference)
          .in("holding_status", ["Payment Secured", "Release Eligible", "Release Approved"]);

        for (const hp of (securedHp ?? [])) {
          await db.from("held_payments").update({
            holding_status: "Disputed",
            updated_at:     now,
          }).eq("id", hp.id);

          // Cancel any pending/approved release instructions
          await db.from("release_instructions")
            .update({ release_status: "Rejected", rejection_reason: "Release blocked by delivery dispute.", updated_at: now })
            .eq("held_payment_id", hp.id)
            .in("release_status", ["Draft", "Pending Approval", "Approved"]);
        }

        if ((securedHp ?? []).length > 0) {
          await insertAuditLogWithClient(db, {
            job_reference: body.job_reference,
            actor_role:    profile.role,
            actor_name:    profile.full_name,
            action:        "release_blocked_by_dispute",
            description:   `Payment release blocked for ${(securedHp ?? []).length} held payment(s) due to delivery dispute. Release instructions cancelled.`,
          });
        }
      } catch {
        // Non-blocking — log silently
      }
    })();

    return NextResponse.json({ success: true });
  }

  // ── CLARIFY (customer requests more information) ──────────────────────────
  if (body.action === "clarify") {
    if (profile.role !== "customer" && profile.role !== "admin") {
      return NextResponse.json({ error: "Only customers can request clarification" }, { status: 403 });
    }
    if (!body.clarify_note?.trim()) {
      return NextResponse.json({ error: "clarify_note is required" }, { status: 400 });
    }

    // Record clarification note on secured_jobs
    await db
      .from("secured_jobs")
      .update({
        customer_clarification_note: body.clarify_note,
        updated_at: now,
      })
      .eq("job_reference", body.job_reference);

    // Audit log
    await insertAuditLogWithClient(db, {
      job_reference: body.job_reference,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "customer_requested_clarification",
      description:   `Customer requested clarification before confirming delivery. Note: ${body.clarify_note}`,
    });

    // Notify provider and admin (non-blocking — failures do not block)
    void Promise.allSettled([
      db.from("notifications").insert({
        job_reference:     body.job_reference,
        recipient_role:    "provider",
        notification_type: "Other",
        priority:          "Medium",
        title:             `Customer requested clarification — Job ${body.job_reference}`,
        message:           `Customer has a question before confirming delivery for Job ${body.job_reference}: "${body.clarify_note}". Confirmation is still pending.`,
        action_url:        `/provider/jobs/${body.job_reference}`,
        actor_id:          profile.id,
        actor_name:        profile.full_name,
        actor_role:        profile.role,
        is_read:           false,
        created_at:        now,
      }),
      db.from("notifications").insert({
        job_reference:     body.job_reference,
        recipient_role:    "admin",
        notification_type: "Other",
        priority:          "Medium",
        title:             `Customer clarification request — Job ${body.job_reference}`,
        message:           `Customer requested clarification for Job ${body.job_reference}: "${body.clarify_note}"`,
        action_url:        `/admin/jobs/${body.job_reference}`,
        actor_id:          profile.id,
        actor_name:        profile.full_name,
        actor_role:        profile.role,
        is_read:           false,
        created_at:        now,
      }),
    ]);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
