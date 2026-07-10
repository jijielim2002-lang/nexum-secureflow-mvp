import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { postConfirmationUpdate, isFullPaymentJob } from "@/lib/deliveryConfirmation";
import { insertAuditLogWithClient } from "@/lib/auditLog";

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

// ─── POST /api/delivery-confirmations/sweep ───────────────────────────────────
// Admin-only. Finds all overdue Pending confirmations and auto-confirms them.
// Also fetches the related job data to determine payment path.

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db  = svc();
  const now = new Date().toISOString();

  // 1. Find overdue Pending confirmations
  const { data: overdue, error: fetchErr } = await db
    .from("delivery_confirmations")
    .select("*")
    .eq("status", "Pending")
    .lt("due_at", now);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!overdue || overdue.length === 0) {
    // Still write sweep audit log even if nothing to do
    await insertAuditLogWithClient(db, {
      job_reference: "SYSTEM",
      actor_role:    "admin",
      actor_name:    admin.full_name,
      action:        "delivery_confirmation_sweep_run",
      description:   "Delivery confirmation sweep ran — no overdue confirmations found.",
    });
    return NextResponse.json({ swept: 0, details: [] });
  }

  const details: Array<{ job_reference: string; status: string; isFullPay: boolean; error?: string }> = [];

  for (const dc of overdue) {
    try {
      // Fetch job to determine payment path
      const { data: job } = await db
        .from("secured_jobs")
        .select("payment_terms, required_deposit, job_value")
        .eq("job_reference", dc.job_reference)
        .maybeSingle();

      const payTerms   = (job as { payment_terms?: string })?.payment_terms ?? "";
      const reqDeposit = (job as { required_deposit?: number | null })?.required_deposit ?? null;
      const jobVal     = (job as { job_value?: number })?.job_value ?? 0;
      const isFullPay  = isFullPaymentJob(payTerms, reqDeposit, jobVal);
      const nextState  = postConfirmationUpdate(isFullPay);

      // Mark delivery_confirmations as Auto Confirmed
      await db
        .from("delivery_confirmations")
        .update({
          status:            "Auto Confirmed",
          auto_confirmed_at: now,
          updated_at:        now,
        })
        .eq("id", dc.id);

      // Update secured_jobs
      await db
        .from("secured_jobs")
        .update({
          delivery_confirmation_status: "Auto Confirmed",
          delivery_confirmed_at:        now,
          ...nextState,
          updated_at:                   now,
        })
        .eq("job_reference", dc.job_reference);

      // Audit log per job
      await insertAuditLogWithClient(db, {
        job_reference: dc.job_reference,
        actor_role:    "admin",
        actor_name:    "Nexum System",
        action:        "delivery_auto_confirmed_after_48_working_hours",
        description:   isFullPay
          ? `Delivery auto-confirmed after 48 working hours with no customer response. Full payment already confirmed — job is now Completed.`
          : `Delivery auto-confirmed after 48 working hours with no customer response. Balance payment is now eligible for release under agreed workflow.`,
      });

      // Close open workflow task
      await db
        .from("workflow_tasks")
        .update({ status: "Completed", updated_at: now })
        .eq("job_reference", dc.job_reference)
        .eq("task_type", "Confirm Delivery Receipt")
        .eq("status", "Open");

      // Notify customer
      await db.from("notifications").insert({
        job_reference:        dc.job_reference,
        recipient_role:       "customer",
        recipient_company_id: dc.customer_company_id ?? null,
        notification_type:    "Other",
        priority:             "High",
        title:                `Delivery auto-confirmed — Job ${dc.job_reference}`,
        message:              isFullPay
          ? `The 48-hour receipt confirmation window has passed for Job ${dc.job_reference}. Delivery has been auto-confirmed. The job is now closed.`
          : `The 48-hour receipt confirmation window has passed for Job ${dc.job_reference}. Delivery has been auto-confirmed. Balance payment is now eligible for release under agreed workflow. Please proceed with balance payment if not yet done.`,
        action_url:           `/customer/jobs/${dc.job_reference}`,
        actor_id:             admin.id,
        actor_name:           "Nexum System",
        actor_role:           "admin",
        is_read:              false,
        created_at:           now,
      });

      // Notify provider
      await db.from("notifications").insert({
        job_reference:        dc.job_reference,
        recipient_role:       "provider",
        recipient_company_id: dc.provider_company_id ?? null,
        notification_type:    "Other",
        priority:             "High",
        title:                `Delivery auto-confirmed — Job ${dc.job_reference}`,
        message:              isFullPay
          ? `Delivery for Job ${dc.job_reference} has been auto-confirmed after 48 working hours. The job is now Completed.`
          : `Delivery for Job ${dc.job_reference} has been auto-confirmed after 48 working hours. Balance payment is now eligible for release under agreed workflow once the customer pays and admin verifies.`,
        action_url:           `/provider/jobs/${dc.job_reference}`,
        actor_id:             admin.id,
        actor_name:           "Nexum System",
        actor_role:           "admin",
        is_read:              false,
        created_at:           now,
      });

      // Notify admin
      await db.from("notifications").insert({
        job_reference:     dc.job_reference,
        recipient_role:    "admin",
        notification_type: "Other",
        priority:          "Normal",
        title:             `Auto-confirmed: delivery — Job ${dc.job_reference}`,
        message:           isFullPay
          ? `Delivery auto-confirmed for Job ${dc.job_reference}. Job is now Completed.`
          : `Delivery auto-confirmed for Job ${dc.job_reference}. Balance payment is now eligible.`,
        action_url:        `/admin/delivery-confirmations`,
        actor_id:          admin.id,
        actor_name:        "Nexum System",
        actor_role:        "admin",
        is_read:           false,
        created_at:        now,
      });

      details.push({ job_reference: dc.job_reference, status: "auto_confirmed", isFullPay });
    } catch (err) {
      details.push({
        job_reference: dc.job_reference,
        status:        "error",
        isFullPay:     false,
        error:         err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Sweep audit log summary
  await insertAuditLogWithClient(db, {
    job_reference: "SYSTEM",
    actor_role:    "admin",
    actor_name:    admin.full_name,
    action:        "delivery_confirmation_sweep_run",
    description:   `Delivery confirmation sweep ran. ${details.filter((d) => d.status === "auto_confirmed").length} of ${overdue.length} overdue confirmations auto-confirmed.`,
  });

  return NextResponse.json({
    swept:   details.filter((d) => d.status === "auto_confirmed").length,
    total:   overdue.length,
    details,
  });
}
