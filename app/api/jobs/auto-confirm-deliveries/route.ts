import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { isFullPaymentJob }          from "@/lib/deliveryConfirmation";
import { insertAuditLogWithClient }  from "@/lib/auditLog";

// ─── Service-role Supabase client ─────────────────────────────────────────────

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Auth helper — admin only ─────────────────────────────────────────────────

async function requireAdmin(req: NextRequest) {
  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const db = svc();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return profile as { id: string; full_name: string; role: string };
}

// ─── POST /api/jobs/auto-confirm-deliveries ───────────────────────────────────
// Admin-only sweep. Finds eligible jobs past their 48-working-hour deadline
// and auto-confirms receipt. Does NOT release or disburse any funds.
// Auto-confirmation = customer receipt is deemed completed.
// Admin release approval is still required before payout.

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db  = svc();
  const now = new Date().toISOString();

  type EligibleJob = {
    job_reference:                     string;
    customer_company_id:               string | null;
    provider_company_id:               string | null;
    payment_terms:                     string | null;
    required_deposit:                  number | null;
    job_value:                         number | null;
    customer_confirmation_deadline_at: string | null;
  };

  // 1. Find jobs eligible for auto-confirmation
  //    Criteria: Pending, eligible, deadline passed, not disputed, not blocked
  const { data: rawEligible, error: fetchErr } = await db
    .from("secured_jobs")
    .select(
      "job_reference, customer_company_id, provider_company_id, " +
      "payment_terms, required_deposit, job_value, " +
      "customer_confirmation_deadline_at",
    )
    .eq("customer_confirmation_status", "Pending")
    .eq("auto_confirmation_eligible", true)
    .eq("release_blocked", false)
    .in("dispute_status", ["None", ""])
    .lte("customer_confirmation_deadline_at", now);

  const eligible = (rawEligible ?? []) as unknown as EligibleJob[];

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (eligible.length === 0) {
    await insertAuditLogWithClient(db, {
      job_reference: "SYSTEM",
      actor_role:    "admin",
      actor_name:    admin.full_name,
      action:        "auto_confirm_sweep_ran",
      description:   "Auto-confirmation sweep ran — no eligible jobs found.",
    });
    return NextResponse.json({ auto_confirmed: 0, details: [] });
  }

  type Detail = {
    job_reference: string;
    status:        "auto_confirmed" | "error";
    isFullPay?:    boolean;
    milestone?:    string;
    error?:        string;
  };
  const details: Detail[] = [];

  for (const job of eligible) {
    try {
      const payTerms   = job.payment_terms ?? "";
      const reqDeposit = job.required_deposit ?? null;
      const jobVal     = job.job_value ?? 0;
      const isFullPay  = isFullPaymentJob(payTerms, reqDeposit, jobVal);

      const newMilestone = isFullPay
        ? "Receipt Auto-Confirmed — Job Closed"
        : "Receipt Auto-Confirmed — Awaiting Release Approval";
      const newJobStatus = isFullPay
        ? "Completed"
        : "Receipt Auto-Confirmed — Awaiting Release Approval";

      // 2. Update secured_jobs
      const { error: updateErr } = await db
        .from("secured_jobs")
        .update({
          customer_confirmation_status:  "Auto Confirmed",
          customer_confirmation_method:  "48 Working Hours Auto Confirmation",
          auto_confirmed_at:             now,
          auto_confirmation_eligible:    false,
          current_milestone:             newMilestone,
          job_status:                    newJobStatus,
          updated_at:                    now,
        })
        .eq("job_reference", job.job_reference)
        .eq("customer_confirmation_status", "Pending"); // optimistic lock

      if (updateErr) throw new Error(updateErr.message);

      // 3. Update delivery_confirmations row (if one exists)
      void db
        .from("delivery_confirmations")
        .update({
          status:           "Auto Confirmed",
          responded_at:     now,
          auto_confirmed_at: now,
          updated_at:       now,
        })
        .eq("job_reference", job.job_reference)
        .eq("status", "Pending");

      // 4. Record delivery_confirmation_events
      void db.from("delivery_confirmation_events").insert({
        job_reference: job.job_reference,
        event_type:    "auto_confirmed",
        actor_id:      null,
        actor_name:    "Nexum SecureFlow (System)",
        actor_role:    "system",
        metadata:      {
          triggered_by:       admin.full_name,
          milestone:          newMilestone,
          is_full_pay:        isFullPay,
        },
        created_at:    now,
      });

      // 5. Audit log — primary event
      await insertAuditLogWithClient(db, {
        job_reference: job.job_reference,
        actor_role:    "system",
        actor_name:    "Nexum SecureFlow (System)",
        action:        "customer_delivery_auto_confirmed",
        description:   `No customer response received within 48 working hours. Delivery auto-confirmed for release review. ` +
                       `Method: 48 Working Hours Auto Confirmation. Milestone: ${newMilestone}. ` +
                       `Admin release approval is still required before any payout.`,
      });

      // 6. Notify customer
      void db.from("notifications").insert({
        job_reference:        job.job_reference,
        recipient_role:       "customer",
        recipient_company_id: job.customer_company_id,
        notification_type:    "Other",
        priority:             "High",
        title:                `Delivery auto-confirmed for release review — Job ${job.job_reference}`,
        message:              `No response was received within 48 working hours for Job ${job.job_reference}. ` +
                              `Delivery receipt has been auto-confirmed for release review. ` +
                              `Nexum Admin will review before any release action is taken. ` +
                              `If you have any concerns, please contact Nexum immediately.`,
        action_url:           `/customer/jobs/${job.job_reference}`,
        actor_id:             null,
        actor_name:           "Nexum SecureFlow (System)",
        actor_role:           "system",
        is_read:              false,
        created_at:           now,
      });

      // 7. Notify provider
      void db.from("notifications").insert({
        job_reference:        job.job_reference,
        recipient_role:       "provider",
        recipient_company_id: job.provider_company_id,
        notification_type:    "Other",
        priority:             "High",
        title:                `Delivery auto-confirmed for release review — Job ${job.job_reference}`,
        message:              `The 48-working-hour confirmation window has elapsed for Job ${job.job_reference}. ` +
                              `Delivery receipt has been auto-confirmed for release review. ` +
                              `Nexum Admin will review and process release approval separately.`,
        action_url:           `/provider/jobs/${job.job_reference}`,
        actor_id:             null,
        actor_name:           "Nexum SecureFlow (System)",
        actor_role:           "system",
        is_read:              false,
        created_at:           now,
      });

      // 8. Notify admin
      void db.from("notifications").insert({
        job_reference:     job.job_reference,
        recipient_role:    "admin",
        notification_type: "Other",
        priority:          "High",
        title:             `Auto-confirmed — Job ${job.job_reference} — ${isFullPay ? "Job Closed" : "Awaiting Release Approval"}`,
        message:           `Job ${job.job_reference} has been auto-confirmed after 48 working hours. ` +
                           `Admin release approval is required before any payout. ` +
                           `Milestone: ${newMilestone}.`,
        action_url:        `/admin/jobs/${job.job_reference}`,
        actor_id:          null,
        actor_name:        "Nexum SecureFlow (System)",
        actor_role:        "system",
        is_read:           false,
        created_at:        now,
      });

      // 9. Mark held payments as Release Eligible (same pattern as manual confirm)
      void (async () => {
        try {
          const { data: securedHp } = await db
            .from("held_payments")
            .select("id, payment_type, amount, currency, payee_company_id")
            .eq("job_reference", job.job_reference)
            .eq("holding_status", "Payment Secured");

          for (const hp of (securedHp ?? [])) {
            await db.from("held_payments").update({
              holding_status:      "Release Eligible",
              release_eligible_at: now,
              updated_at:          now,
            }).eq("id", hp.id);

            const releaseType = isFullPay
              ? "Full Payment Release"
              : (hp.payment_type === "Deposit" ? "Deposit Release" : "Balance Release");

            await db.from("release_instructions").insert({
              job_reference:    job.job_reference,
              held_payment_id:  hp.id,
              payee_company_id: hp.payee_company_id ?? null,
              amount:           hp.amount,
              currency:         hp.currency,
              release_type:     releaseType,
              release_status:   "Pending Approval",
              created_at:       now,
              updated_at:       now,
            });
          }

          if ((securedHp ?? []).length > 0) {
            await insertAuditLogWithClient(db, {
              job_reference: job.job_reference,
              actor_role:    "system",
              actor_name:    "Nexum SecureFlow (System)",
              action:        "release_became_eligible_after_auto_confirm",
              description:   `${(securedHp ?? []).length} held payment(s) marked Release Eligible following auto-confirmation. Release Instructions created — pending admin approval.`,
            });
          }
        } catch { /* non-blocking */ }
      })();

      details.push({ job_reference: job.job_reference, status: "auto_confirmed", isFullPay, milestone: newMilestone });
    } catch (err) {
      details.push({ job_reference: job.job_reference, status: "error", error: String(err) });
    }
  }

  const succeeded = details.filter((d) => d.status === "auto_confirmed").length;

  // Sweep audit log
  await insertAuditLogWithClient(db, {
    job_reference: "SYSTEM",
    actor_role:    "admin",
    actor_name:    admin.full_name,
    action:        "auto_confirm_sweep_ran",
    description:   `Auto-confirmation sweep completed. ${succeeded} of ${eligible.length} eligible job(s) auto-confirmed for release review.`,
  });

  return NextResponse.json({
    auto_confirmed: succeeded,
    total_eligible: eligible.length,
    details,
  });
}

// ─── GET /api/jobs/auto-confirm-deliveries ────────────────────────────────────
// Preview: returns jobs that are currently eligible for auto-confirmation
// without actually confirming them.

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db  = svc();
  const now = new Date().toISOString();

  const { data: rawData, error } = await db
    .from("secured_jobs")
    .select(
      "job_reference, customer_confirmation_status, customer_confirmation_deadline_at, " +
      "pod_uploaded_at, dispute_status, auto_confirmation_eligible, current_milestone",
    )
    .eq("customer_confirmation_status", "Pending")
    .eq("auto_confirmation_eligible", true)
    .eq("release_blocked", false)
    .in("dispute_status", ["None", ""])
    .lte("customer_confirmation_deadline_at", now)
    .order("customer_confirmation_deadline_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (rawData ?? []) as unknown as Record<string, unknown>[];
  return NextResponse.json({ eligible: rows, count: rows.length });
}
