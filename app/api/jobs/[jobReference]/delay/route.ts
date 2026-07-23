// ─── POST /api/jobs/[jobReference]/delay ─────────────────────────────────────
// Flag or resolve a shipment delay.
// Body: { action: "flag" | "resolve", reason?, delay_type? }
// Auth: service_provider (own jobs) or admin

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { getCaller }                 from "@/lib/api-auth";
import { notifyJobEvent, getJobPartyEmails } from "@/lib/jobs/notify";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await params;
  const caller = await getCaller(req);
  if (!caller || !["service_provider", "admin", "system"].includes(caller.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    action:       "flag" | "resolve";
    reason?:      string;
    delay_type?:  "ETA Exceeded" | "No Update" | "Provider Flagged";
  };

  if (!body.action) {
    return NextResponse.json({ error: "action required: flag | resolve" }, { status: 400 });
  }

  const admin = adminClient();

  const { data: job } = await admin
    .from("secured_jobs")
    .select("job_reference, job_status, is_delayed, customer_company_id, service_provider_company_id")
    .eq("job_reference", jobReference)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const now = new Date().toISOString();
  const { customerEmail, providerEmail } = await getJobPartyEmails(jobReference);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nexumsecure.com";

  if (body.action === "flag") {
    if (job.is_delayed) {
      return NextResponse.json({ error: "Job already flagged as delayed" }, { status: 409 });
    }

    const delayType = body.delay_type ?? "Provider Flagged";

    await admin
      .from("secured_jobs")
      .update({
        is_delayed:        true,
        delay_reason:      body.reason ?? null,
        delay_type:        delayType,
        delay_flagged_at:  now,
        delay_flagged_by:  caller.id ?? null,
        delay_notified_at: now,
        updated_at:        now,
      })
      .eq("job_reference", jobReference);

    await admin.from("audit_logs").insert({
      job_reference: jobReference,
      actor_id:      caller.id ?? null,
      actor_role:    caller.role,
      actor_name:    caller.name ?? "System",
      action:        "delay_flagged",
      description:   `Delay flagged (${delayType})${body.reason ? ": " + body.reason : ""}`,
    });

    // Notify customer
    await notifyJobEvent({
      jobReference,
      recipientRole:      "customer",
      recipientCompanyId: job.customer_company_id,
      recipientEmail:     customerEmail,
      type:               "delay_alert",
      title:              `⚠ Shipment Delay Alert — ${jobReference}`,
      body:               [
        `Your shipment (${jobReference}) has been flagged as delayed.`,
        `\nDelay type: ${delayType}`,
        body.reason ? `\nReason: ${body.reason}` : "",
        "\n\nOur team has been notified. We will keep you updated on the latest status.",
      ].join(""),
      actionUrl: `${baseUrl}/customer/jobs/${jobReference}`,
      priority:  "High",
      actorId:   caller.id ?? null,
      actorName: caller.name ?? "System",
      actorRole: caller.role,
    });

    // Notify admin
    await notifyJobEvent({
      jobReference,
      recipientRole: "admin",
      type:          "delay_alert",
      title:         `[${jobReference}] Delay Flagged — ${delayType}`,
      body:          `Job delayed (${delayType}). Reason: ${body.reason ?? "none"}. Flagged by: ${caller.name ?? caller.role}.`,
      actionUrl:     `${baseUrl}/admin/jobs/${jobReference}`,
      priority:      "High",
      actorId:       caller.id ?? null,
      actorName:     caller.name ?? "System",
      actorRole:     caller.role,
    });

    return NextResponse.json({ ok: true, action: "flagged", delay_type: delayType });

  } else {
    // Resolve delay
    await admin
      .from("secured_jobs")
      .update({
        is_delayed:         false,
        delay_resolved_at:  now,
        updated_at:         now,
      })
      .eq("job_reference", jobReference);

    await admin.from("audit_logs").insert({
      job_reference: jobReference,
      actor_id:      caller.id ?? null,
      actor_role:    caller.role,
      actor_name:    caller.name ?? "System",
      action:        "delay_resolved",
      description:   `Delay resolved${body.reason ? ": " + body.reason : ""}`,
    });

    await notifyJobEvent({
      jobReference,
      recipientRole:      "customer",
      recipientCompanyId: job.customer_company_id,
      recipientEmail:     customerEmail,
      type:               "delay_resolved",
      title:              `✓ Delay Resolved — ${jobReference}`,
      body:               `Good news — the delay on your shipment (${jobReference}) has been resolved.${body.reason ? "\n\n" + body.reason : ""}`,
      actionUrl:          `${baseUrl}/customer/jobs/${jobReference}`,
      priority:           "Medium",
      actorId:            caller.id ?? null,
      actorName:          caller.name ?? "System",
      actorRole:          caller.role,
    });

    return NextResponse.json({ ok: true, action: "resolved" });
  }
}
