import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import type { DisputeStatus, ResolutionType } from "@/lib/disputes";

// ─── Service-role client ──────────────────────────────────────────────────────

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getProfile(req: NextRequest) {
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

  return profile as {
    id: string; full_name: string; role: string; company_id: string | null;
  } | null;
}

// ─── GET /api/disputes/[disputeId] ───────────────────────────────────────────
// Returns a single dispute with its evidence list (documents joined)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const { disputeId } = await params;
  const db = svc();

  const { data: dispute, error: dErr } = await db
    .from("dispute_cases")
    .select("*")
    .eq("id", disputeId)
    .maybeSingle();

  if (dErr)    return NextResponse.json({ error: dErr.message }, { status: 500 });
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

  const { data: evidence, error: eErr } = await db
    .from("dispute_evidence")
    .select("*, documents(file_name, document_type, storage_path)")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: true });

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  return NextResponse.json({ dispute, evidence: evidence ?? [] });
}

// ─── PATCH /api/disputes/[disputeId] ─────────────────────────────────────────
// Actions:
//   "respond"          — provider adds response text + changes status
//   "add_evidence"     — any party adds evidence (document link)
//   "update_status"    — admin changes status + adds review note
//   "request_evidence" — admin requests evidence from customer or provider
//   "resolve"          — admin resolves the dispute
//   "close"            — admin closes the dispute

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const { disputeId } = await params;

  const profile = await getProfile(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action:                 "respond" | "add_evidence" | "update_status" | "request_evidence" | "resolve" | "close";
    provider_response?:     string;
    customer_evidence_summary?: string;
    admin_review_note?:     string;
    new_status?:            DisputeStatus;
    evidence_requested_from?: "customer" | "provider";
    resolution_type?:       ResolutionType;
    resolution_amount?:     number | null;
    // evidence upload
    document_id?:           string;
    evidence_type?:         string;
    remarks?:               string;
  };

  const db  = svc();
  const now = new Date().toISOString();

  // Fetch existing dispute
  const { data: existing, error: fetchErr } = await db
    .from("dispute_cases")
    .select("*")
    .eq("id", disputeId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

  const jobRef = (existing as { job_reference: string }).job_reference;

  // ── RESPOND (provider submits response) ───────────────────────────────────
  if (body.action === "respond") {
    if (profile.role !== "provider" && profile.role !== "admin") {
      return NextResponse.json({ error: "Only providers or admins can respond" }, { status: 403 });
    }
    if (!body.provider_response?.trim()) {
      return NextResponse.json({ error: "provider_response is required" }, { status: 400 });
    }

    await db
      .from("dispute_cases")
      .update({
        provider_response: body.provider_response,
        status:            "Provider Responded" as DisputeStatus,
        updated_at:        now,
      })
      .eq("id", disputeId);

    // Close provider workflow task
    await db
      .from("workflow_tasks")
      .update({ status: "Completed", updated_at: now })
      .eq("job_reference", jobRef)
      .eq("task_type", "Respond to Dispute")
      .eq("status", "Open");

    // Notify admin + customer
    await Promise.all([
      db.from("notifications").insert({
        job_reference:     jobRef,
        recipient_role:    "admin",
        notification_type: "Other",
        priority:          "High",
        title:             `Provider responded to dispute — Job ${jobRef}`,
        message:           `Service provider has submitted their response to the dispute for Job ${jobRef}. Please review.`,
        action_url:        `/admin/disputes`,
        actor_id:          profile.id,
        actor_name:        profile.full_name,
        actor_role:        profile.role,
        is_read:           false,
        created_at:        now,
      }),
      db.from("notifications").insert({
        job_reference:        jobRef,
        recipient_role:       "customer",
        recipient_company_id: (existing as { raised_by_company_id?: string | null }).raised_by_company_id ?? null,
        notification_type:    "Other",
        priority:             "Normal",
        title:                `Provider responded to your dispute — Job ${jobRef}`,
        message:              `The service provider has submitted a response to your dispute for Job ${jobRef}. Nexum Admin is reviewing.`,
        action_url:           `/customer/jobs/${jobRef}`,
        actor_id:             profile.id,
        actor_name:           profile.full_name,
        actor_role:           profile.role,
        is_read:              false,
        created_at:           now,
      }),
    ]);

    await insertAuditLogWithClient(db, {
      job_reference: jobRef,
      actor_id:      profile.id,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "dispute_provider_responded",
      description:   `Provider submitted response to dispute ${disputeId}.`,
    });

    return NextResponse.json({ success: true });
  }

  // ── ADD EVIDENCE ──────────────────────────────────────────────────────────
  if (body.action === "add_evidence") {
    const { error: evErr } = await db
      .from("dispute_evidence")
      .insert({
        dispute_id:          disputeId,
        job_reference:       jobRef,
        document_id:         body.document_id ?? null,
        evidence_type:       body.evidence_type ?? null,
        uploaded_by_role:    profile.role,
        uploaded_by_user_id: profile.id,
        remarks:             body.remarks ?? null,
        created_at:          now,
      });

    if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });

    // If customer adding evidence, update status to Customer Responded if it was Evidence Requested
    if (profile.role === "customer") {
      const currentStatus = (existing as { status: DisputeStatus }).status;
      if (currentStatus === "Evidence Requested" || currentStatus === "Open") {
        await db
          .from("dispute_cases")
          .update({ status: "Customer Responded" as DisputeStatus, updated_at: now })
          .eq("id", disputeId);
      }
    }

    await insertAuditLogWithClient(db, {
      job_reference: jobRef,
      actor_id:      profile.id,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "dispute_evidence_uploaded",
      description:   `Evidence added to dispute ${disputeId}. Type: ${body.evidence_type ?? "General"}. Document ID: ${body.document_id ?? "none"}.`,
    });

    return NextResponse.json({ success: true });
  }

  // ── UPDATE STATUS (admin) ─────────────────────────────────────────────────
  if (body.action === "update_status") {
    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    if (!body.new_status) {
      return NextResponse.json({ error: "new_status is required" }, { status: 400 });
    }

    await db
      .from("dispute_cases")
      .update({
        status:           body.new_status,
        admin_review_note: body.admin_review_note
          ? body.admin_review_note
          : (existing as { admin_review_note?: string | null }).admin_review_note,
        updated_at: now,
      })
      .eq("id", disputeId);

    await insertAuditLogWithClient(db, {
      job_reference: jobRef,
      actor_id:      profile.id,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "dispute_status_updated",
      description:   `Dispute ${disputeId} status changed to "${body.new_status}". ${body.admin_review_note ? `Note: ${body.admin_review_note}` : ""}`,
    });

    return NextResponse.json({ success: true });
  }

  // ── REQUEST EVIDENCE (admin) ──────────────────────────────────────────────
  if (body.action === "request_evidence") {
    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const targetRole = body.evidence_requested_from ?? "customer";

    await db
      .from("dispute_cases")
      .update({
        status:            "Evidence Requested" as DisputeStatus,
        admin_review_note: body.admin_review_note
          ? body.admin_review_note
          : (existing as { admin_review_note?: string | null }).admin_review_note,
        updated_at: now,
      })
      .eq("id", disputeId);

    // Create workflow task for the target party
    await db.from("workflow_tasks").insert({
      job_reference:  jobRef,
      task_type:      "Submit Dispute Evidence",
      title:          `Submit additional evidence — Dispute on Job ${jobRef}`,
      description:    `Admin has requested additional evidence from you regarding the dispute on Job ${jobRef}. ${body.admin_review_note ? `Note: ${body.admin_review_note}` : ""}`,
      assigned_role:  targetRole,
      priority:       "High",
      status:         "Open",
      created_at:     now,
      updated_at:     now,
    });

    // Notify the target party
    const targetCompanyId =
      targetRole === "customer"
        ? (existing as { raised_by_company_id?: string | null }).raised_by_company_id
        : (existing as { against_company_id?: string | null }).against_company_id;

    await db.from("notifications").insert({
      job_reference:        jobRef,
      recipient_role:       targetRole,
      recipient_company_id: targetCompanyId ?? null,
      notification_type:    "Other",
      priority:             "High",
      title:                `Additional evidence required — Dispute on Job ${jobRef}`,
      message:              `Nexum Admin has requested additional evidence from you for the dispute on Job ${jobRef}. ${body.admin_review_note ? `Details: ${body.admin_review_note}` : "Please upload supporting documents."}`,
      action_url:           `/${targetRole}/jobs/${jobRef}`,
      actor_id:             profile.id,
      actor_name:           profile.full_name,
      actor_role:           profile.role,
      is_read:              false,
      created_at:           now,
    });

    await insertAuditLogWithClient(db, {
      job_reference: jobRef,
      actor_id:      profile.id,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "dispute_evidence_requested",
      description:   `Admin requested additional evidence from ${targetRole} for dispute ${disputeId}. ${body.admin_review_note ?? ""}`,
    });

    return NextResponse.json({ success: true });
  }

  // ── RESOLVE (admin) ───────────────────────────────────────────────────────
  if (body.action === "resolve") {
    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    if (!body.resolution_type) {
      return NextResponse.json({ error: "resolution_type is required" }, { status: 400 });
    }

    await db
      .from("dispute_cases")
      .update({
        status:           "Resolved" as DisputeStatus,
        resolution_type:  body.resolution_type,
        resolution_amount: body.resolution_amount ?? null,
        admin_review_note: body.admin_review_note
          ? body.admin_review_note
          : (existing as { admin_review_note?: string | null }).admin_review_note,
        resolved_at:  now,
        resolved_by:  profile.id,
        updated_at:   now,
      })
      .eq("id", disputeId);

    // Close related job_exceptions
    await db
      .from("job_exceptions")
      .update({
        status:          "Resolved",
        resolution_note: `Dispute resolved. Resolution: ${body.resolution_type}. ${body.admin_review_note ?? ""}`,
        resolved_at:     now,
        updated_at:      now,
      })
      .eq("job_reference", jobRef)
      .eq("exception_type", "Customer Dispute")
      .eq("status", "Open");

    // Close open dispute workflow tasks
    await db
      .from("workflow_tasks")
      .update({ status: "Completed", updated_at: now })
      .eq("job_reference", jobRef)
      .in("task_type", ["Review Dispute", "Respond to Dispute", "Submit Dispute Evidence"])
      .eq("status", "Open");

    // If No Claim or Discount, update job status to allow payment to proceed
    if (body.resolution_type === "No Claim" || body.resolution_type === "Discount") {
      await db
        .from("secured_jobs")
        .update({
          job_status:        "Delivered",
          current_milestone: "Dispute Resolved — Balance Payment Eligible",
          delivery_confirmation_status: "Confirmed by Customer",
          updated_at: now,
        })
        .eq("job_reference", jobRef)
        .eq("job_status", "Delivery Disputed");
    }

    // Notify all parties
    const resolvedMsg = `Dispute for Job ${jobRef} has been resolved. Resolution: ${body.resolution_type}. ${body.admin_review_note ? body.admin_review_note : ""}`;

    await Promise.all([
      db.from("notifications").insert({
        job_reference:        jobRef,
        recipient_role:       "customer",
        recipient_company_id: (existing as { raised_by_company_id?: string | null }).raised_by_company_id ?? null,
        notification_type:    "Other",
        priority:             "High",
        title:                `Dispute resolved — Job ${jobRef} — ${body.resolution_type}`,
        message:              resolvedMsg,
        action_url:           `/customer/jobs/${jobRef}`,
        actor_id:             profile.id,
        actor_name:           profile.full_name,
        actor_role:           profile.role,
        is_read:              false,
        created_at:           now,
      }),
      db.from("notifications").insert({
        job_reference:        jobRef,
        recipient_role:       "provider",
        recipient_company_id: (existing as { against_company_id?: string | null }).against_company_id ?? null,
        notification_type:    "Other",
        priority:             "High",
        title:                `Dispute resolved — Job ${jobRef} — ${body.resolution_type}`,
        message:              resolvedMsg,
        action_url:           `/provider/jobs/${jobRef}`,
        actor_id:             profile.id,
        actor_name:           profile.full_name,
        actor_role:           profile.role,
        is_read:              false,
        created_at:           now,
      }),
    ]);

    await insertAuditLogWithClient(db, {
      job_reference: jobRef,
      actor_id:      profile.id,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "dispute_resolved",
      description:   `Dispute ${disputeId} resolved. Type: ${body.resolution_type}. Amount: ${body.resolution_amount ?? "N/A"}. ${body.admin_review_note ?? ""}`,
    });

    return NextResponse.json({ success: true });
  }

  // ── CLOSE (admin) ─────────────────────────────────────────────────────────
  if (body.action === "close") {
    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    await db
      .from("dispute_cases")
      .update({
        status:            "Closed" as DisputeStatus,
        admin_review_note: body.admin_review_note
          ? body.admin_review_note
          : (existing as { admin_review_note?: string | null }).admin_review_note,
        updated_at: now,
      })
      .eq("id", disputeId);

    // Close open workflow tasks
    await db
      .from("workflow_tasks")
      .update({ status: "Completed", updated_at: now })
      .eq("job_reference", jobRef)
      .in("task_type", ["Review Dispute", "Respond to Dispute", "Submit Dispute Evidence"])
      .eq("status", "Open");

    await insertAuditLogWithClient(db, {
      job_reference: jobRef,
      actor_id:      profile.id,
      actor_role:    profile.role,
      actor_name:    profile.full_name,
      action:        "dispute_closed",
      description:   `Dispute ${disputeId} closed by admin. ${body.admin_review_note ?? ""}`,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
