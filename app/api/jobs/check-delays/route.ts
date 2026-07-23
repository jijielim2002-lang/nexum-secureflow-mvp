// ─── GET /api/jobs/check-delays ───────────────────────────────────────────────
// Cron endpoint — detects delayed jobs and fires notifications.
// Triggers:
//   1. ETA Exceeded — job past expected_completion_date, not Completed/Cancelled
//   2. No Update — In Progress job with no status change in N days
//   3. Already flagged — skip (don't double-notify)
//
// Secure with CRON_SECRET header: x-cron-secret: <CRON_SECRET env>
// Schedule in Vercel Cron (vercel.json) or call manually from admin.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { notifyJobEvent }            from "@/lib/jobs/notify";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const NO_UPDATE_DAYS = parseInt(process.env.DELAY_NO_UPDATE_DAYS ?? "3", 10);
const ACTIVE_STATUSES = [
  "Ready for Execution",
  "In Progress",
  "Delivered",
  "Awaiting Customer Confirmation",
];

export async function GET(req: NextRequest) {
  // Auth: cron secret or admin key
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    // Also allow internal API key
    const internalKey = req.headers.get("x-internal-key");
    if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin  = adminClient();
  const now    = new Date();
  const flagged: string[] = [];
  const skipped: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nexumsecure.com";

  // ── Fetch active non-delayed jobs ────────────────────────────────────────────
  const { data: jobs } = await admin
    .from("secured_jobs")
    .select([
      "job_reference",
      "job_status",
      "customer_company_id",
      "service_provider_company_id",
      "expected_completion_date",
      "last_status_update_at",
      "is_delayed",
      "delay_notified_at",
    ].join(","))
    .in("job_status", ACTIVE_STATUSES)
    .eq("is_delayed", false);

  for (const job of jobs ?? []) {
    let delayType: "ETA Exceeded" | "No Update" | null = null;
    let reason    = "";

    // Trigger 1: ETA exceeded
    if (job.expected_completion_date) {
      const eta = new Date(job.expected_completion_date);
      if (now > eta) {
        delayType = "ETA Exceeded";
        const daysLate = Math.floor((now.getTime() - eta.getTime()) / 86400000);
        reason = `Job is ${daysLate} day(s) past expected completion date (${job.expected_completion_date})`;
      }
    }

    // Trigger 2: No status update in N days
    if (!delayType && job.last_status_update_at) {
      const lastUpdate = new Date(job.last_status_update_at);
      const daysSince  = Math.floor((now.getTime() - lastUpdate.getTime()) / 86400000);
      if (daysSince >= NO_UPDATE_DAYS) {
        delayType = "No Update";
        reason    = `No status update for ${daysSince} day(s)`;
      }
    }

    if (!delayType) {
      skipped.push(job.job_reference);
      continue;
    }

    // Flag the job
    await admin
      .from("secured_jobs")
      .update({
        is_delayed:        true,
        delay_type:        delayType,
        delay_reason:      reason,
        delay_flagged_at:  now.toISOString(),
        delay_notified_at: now.toISOString(),
        updated_at:        now.toISOString(),
      })
      .eq("job_reference", job.job_reference);

    // Audit
    await admin.from("audit_logs").insert({
      job_reference: job.job_reference,
      actor_role:    "system",
      actor_name:    "Nexum Auto-Detect",
      action:        "delay_flagged",
      description:   `Auto-detected delay (${delayType}): ${reason}`,
    });

    // Notify customer
    await notifyJobEvent({
      jobReference:       job.job_reference,
      recipientRole:      "customer",
      recipientCompanyId: job.customer_company_id,
      type:               "delay_alert",
      title:              `⚠ Shipment Delay Detected — ${job.job_reference}`,
      body:               `Your shipment (${job.job_reference}) may be delayed.\n\nReason: ${reason}\n\nOur operations team has been notified and will follow up shortly.`,
      actionUrl:          `${baseUrl}/customer/jobs/${job.job_reference}`,
      priority:           "High",
      actorName:          "Nexum Auto-Detect",
      actorRole:          "system",
    });

    // Notify admin
    await notifyJobEvent({
      jobReference:   job.job_reference,
      recipientRole:  "admin",
      type:           "delay_alert",
      title:          `[${job.job_reference}] Auto-Delay: ${delayType}`,
      body:           `${reason}\nJob status: ${job.job_status}`,
      actionUrl:      `${baseUrl}/admin/jobs/${job.job_reference}`,
      priority:       "High",
      actorName:      "Nexum Auto-Detect",
      actorRole:      "system",
    });

    // Notify provider
    await notifyJobEvent({
      jobReference:       job.job_reference,
      recipientRole:      "service_provider",
      recipientCompanyId: job.service_provider_company_id,
      type:               "delay_alert",
      title:              `Action Required — Shipment Delay (${job.job_reference})`,
      body:               `Your shipment ${job.job_reference} has been flagged as delayed.\n\nReason: ${reason}\n\nPlease update the job status or upload POD if delivery is complete.`,
      actionUrl:          `${baseUrl}/provider/jobs/${job.job_reference}`,
      priority:           "High",
      actorName:          "Nexum Auto-Detect",
      actorRole:          "system",
    });

    flagged.push(job.job_reference);
  }

  return NextResponse.json({
    ok:           true,
    checked:      (jobs ?? []).length,
    flagged_count: flagged.length,
    flagged,
    skipped_count: skipped.length,
    ran_at:       now.toISOString(),
  });
}
