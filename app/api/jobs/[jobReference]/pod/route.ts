// ─── POST /api/jobs/[jobReference]/pod ───────────────────────────────────────
// Provider uploads POD evidence — document URL already stored in Supabase storage.
// Body: { document_url, notes?, document_id? }
// Triggers: status → Delivered, in-app + email notification to customer + admin.
// Payment release requires separate admin action.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { getCaller }                 from "@/lib/api-auth";
import {
  recordStatusChange,
  notifyJobEvent,
  getJobPartyEmails,
} from "@/lib/jobs/notify";

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
  if (!caller || !["service_provider", "admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    document_url:  string;
    notes?:        string;
    document_id?:  string;
  };

  if (!body.document_url) {
    return NextResponse.json({ error: "document_url required" }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch job
  const { data: job } = await admin
    .from("secured_jobs")
    .select("job_reference, job_status, customer_company_id, service_provider_company_id, pod_uploaded_at")
    .eq("job_reference", jobReference)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Verify provider owns the job
  if (caller.role === "service_provider") {
    const { data: profile } = await admin
      .from("profiles").select("company_id").eq("id", caller.id).maybeSingle();
    if (profile?.company_id !== job.service_provider_company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  const prevStatus = job.job_status;

  // Update job: set POD + advance status to Delivered (if not already past it)
  const shouldAdvanceStatus = [
    "In Progress",
    "Ready for Execution",
  ].includes(prevStatus);

  await admin
    .from("secured_jobs")
    .update({
      pod_uploaded_at:       now,
      pod_uploaded_by:       caller.id,
      pod_document_url:      body.document_url,
      pod_notes:             body.notes ?? null,
      ...(shouldAdvanceStatus ? {
        job_status:            "Delivered",
        current_milestone:     "Delivered",
        last_status_update_at: now,
      } : {}),
      updated_at:            now,
    })
    .eq("job_reference", jobReference);

  // Record status change
  if (shouldAdvanceStatus) {
    await recordStatusChange({
      jobReference,
      fromStatus:    prevStatus,
      toStatus:      "Delivered",
      changedById:   caller.id,
      changedByName: caller.name ?? caller.email,
      changedByRole: caller.role,
      note:          "POD uploaded — status advanced to Delivered",
      metadata:      { document_url: body.document_url },
    });
  }

  // Audit log
  await admin.from("audit_logs").insert({
    job_reference: jobReference,
    actor_id:      caller.id,
    actor_role:    caller.role,
    actor_name:    caller.name ?? caller.email,
    action:        "pod_uploaded",
    description:   `POD evidence uploaded${body.notes ? ": " + body.notes : ""}`,
    metadata:      { document_url: body.document_url, document_id: body.document_id ?? null },
  });

  // Notify customer + admin
  const { customerEmail } = await getJobPartyEmails(jobReference);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nexumsecure.com";

  await notifyJobEvent({
    jobReference,
    recipientRole:      "customer",
    recipientCompanyId: job.customer_company_id,
    recipientEmail:     customerEmail,
    type:               "pod_uploaded",
    title:              `Proof of Delivery uploaded — ${jobReference}`,
    body:               [
      `Your service provider has uploaded Proof of Delivery for job ${jobReference}.`,
      body.notes ? `\nNote from provider: ${body.notes}` : "",
      "\nPlease review and confirm delivery in your dashboard.",
      "\nPayment will be released to the provider after your confirmation.",
    ].join(""),
    actionUrl: `${baseUrl}/customer/jobs/${jobReference}`,
    priority:  "High",
    actorId:   caller.id,
    actorName: caller.name ?? caller.email,
    actorRole: caller.role,
  });

  await notifyJobEvent({
    jobReference,
    recipientRole: "admin",
    type:          "pod_uploaded",
    title:         `[${jobReference}] POD Uploaded — Awaiting Customer Confirmation`,
    body:          `Provider (${caller.name ?? caller.email}) uploaded POD. Job status: Delivered. Awaiting customer confirmation before payment release.`,
    actionUrl:     `${baseUrl}/admin/jobs/${jobReference}`,
    priority:      "Medium",
    actorId:       caller.id,
    actorName:     caller.name ?? caller.email,
    actorRole:     caller.role,
  });

  return NextResponse.json({
    ok:              true,
    job_reference:   jobReference,
    pod_uploaded_at: now,
    status_advanced: shouldAdvanceStatus,
    new_status:      shouldAdvanceStatus ? "Delivered" : prevStatus,
  });
}
