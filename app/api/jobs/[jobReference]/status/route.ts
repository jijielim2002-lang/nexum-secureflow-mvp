// ─── POST /api/jobs/[jobReference]/status ────────────────────────────────────
// Transition job status with validation, audit log, history, and notifications.
// Body: { to_status, note? }
// Auth: service_provider (own jobs) or admin

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { getCaller }                 from "@/lib/api-auth";
import {
  isValidTransition,
  recordStatusChange,
  notifyJobEvent,
  getJobPartyEmails,
} from "@/lib/jobs/notify";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL   ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY  ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    to_status: string;
    note?:     string;
  };

  if (!body.to_status) {
    return NextResponse.json({ error: "to_status required" }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch current job
  const { data: job, error: jobErr } = await admin
    .from("secured_jobs")
    .select("job_reference, job_status, customer_company_id, service_provider_company_id")
    .eq("job_reference", jobReference)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Role gate: provider can only update their own jobs
  if (caller.role === "service_provider") {
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", caller.id)
      .maybeSingle();
    if (profile?.company_id !== job.service_provider_company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Validate transition
  if (!isValidTransition(job.job_status, body.to_status)) {
    return NextResponse.json({
      error: `Invalid transition: ${job.job_status} → ${body.to_status}`,
    }, { status: 422 });
  }

  // Apply status update
  const { error: updateErr } = await admin
    .from("secured_jobs")
    .update({
      job_status:            body.to_status,
      current_milestone:     body.to_status,
      last_status_update_at: new Date().toISOString(),
      updated_at:            new Date().toISOString(),
    })
    .eq("job_reference", jobReference);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Record history
  await recordStatusChange({
    jobReference,
    fromStatus:    job.job_status,
    toStatus:      body.to_status,
    changedById:   caller.id,
    changedByName: caller.name ?? caller.email,
    changedByRole: caller.role,
    note:          body.note ?? null,
  });

  // Audit log
  await admin.from("audit_logs").insert({
    job_reference: jobReference,
    actor_id:      caller.id,
    actor_role:    caller.role,
    actor_name:    caller.name ?? caller.email,
    action:        "job_status_updated",
    description:   `Status: ${job.job_status} → ${body.to_status}${body.note ? " | " + body.note : ""}`,
  });

  // Notify both parties
  const { customerEmail, providerEmail } = await getJobPartyEmails(jobReference);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nexumsecure.com";

  await notifyJobEvent({
    jobReference,
    recipientRole:      "customer",
    recipientCompanyId: job.customer_company_id,
    recipientEmail:     customerEmail,
    type:               "status_update",
    title:              `Job ${jobReference} — Status Updated`,
    body:               `Your shipment status has changed to: ${body.to_status}.${body.note ? "\n\nNote: " + body.note : ""}`,
    actionUrl:          `${baseUrl}/customer/jobs/${jobReference}`,
    priority:           "Medium",
    actorId:            caller.id,
    actorName:          caller.name ?? caller.email,
    actorRole:          caller.role,
  });

  await notifyJobEvent({
    jobReference,
    recipientRole:      "admin",
    type:               "status_update",
    title:              `[${jobReference}] Status → ${body.to_status}`,
    body:               `Updated by ${caller.role} (${caller.name ?? caller.email}): ${job.job_status} → ${body.to_status}`,
    actionUrl:          `${baseUrl}/admin/jobs/${jobReference}`,
    priority:           "Low",
    actorId:            caller.id,
    actorName:          caller.name ?? caller.email,
    actorRole:          caller.role,
  });

  return NextResponse.json({
    ok:          true,
    job_reference: jobReference,
    from_status: job.job_status,
    to_status:   body.to_status,
  });
}
