import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import type { DisputeStatus, DisputeSeverity, DisputeType } from "@/lib/disputes";

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

// ─── GET /api/disputes ────────────────────────────────────────────────────────
// Query params: job_reference, status, severity, dispute_type, limit

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobRef      = searchParams.get("job_reference");
  const status      = searchParams.get("status");
  const severity    = searchParams.get("severity");
  const dtype       = searchParams.get("dispute_type");
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  const db = svc();
  let query = db
    .from("dispute_cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobRef)   query = query.eq("job_reference", jobRef);
  if (status)   query = query.eq("status", status);
  if (severity) query = query.eq("severity", severity);
  if (dtype)    query = query.eq("dispute_type", dtype);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ disputes: data ?? [] });
}

// ─── POST /api/disputes ───────────────────────────────────────────────────────
// Create a new dispute case (standalone — not via delivery confirmation flow)

export async function POST(req: NextRequest) {
  const profile = await getProfile(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["customer", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Only customers or admins can raise disputes" }, { status: 403 });
  }

  const body = await req.json() as {
    job_reference:          string;
    dispute_type:           DisputeType;
    severity?:              DisputeSeverity;
    dispute_reason:         string;
    claim_amount?:          number | null;
    currency?:              string;
    customer_evidence_summary?: string;
    against_company_id?:    string | null;
  };

  if (!body.job_reference?.trim())  return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  if (!body.dispute_reason?.trim()) return NextResponse.json({ error: "dispute_reason is required" }, { status: 400 });
  if (!body.dispute_type)           return NextResponse.json({ error: "dispute_type is required" }, { status: 400 });

  const db  = svc();
  const now = new Date().toISOString();

  // Determine severity — default High for delivery disputes, Medium for others
  const severity: DisputeSeverity = body.severity ?? (
    ["Delivery Not Received", "Cargo Damage", "Wrong Cargo"].includes(body.dispute_type)
      ? "High"
      : "Medium"
  );

  // Insert dispute_cases row
  const { data: dispute, error: insertErr } = await db
    .from("dispute_cases")
    .insert({
      job_reference:             body.job_reference,
      dispute_type:              body.dispute_type,
      raised_by_role:            profile.role,
      raised_by_user_id:         profile.id,
      raised_by_company_id:      profile.company_id ?? null,
      against_company_id:        body.against_company_id ?? null,
      status:                    "Open" as DisputeStatus,
      severity,
      claim_amount:              body.claim_amount ?? null,
      currency:                  body.currency ?? "RM",
      dispute_reason:            body.dispute_reason,
      customer_evidence_summary: body.customer_evidence_summary ?? null,
      created_at:                now,
      updated_at:                now,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Create workflow task for admin to review
  await db.from("workflow_tasks").insert({
    job_reference:     body.job_reference,
    task_type:         "Review Dispute",
    title:             `Review dispute — Job ${body.job_reference}`,
    description:       `A ${body.dispute_type} dispute has been raised for Job ${body.job_reference}. Reason: ${body.dispute_reason}`,
    assigned_role:     "admin",
    priority:          severity === "Critical" || severity === "High" ? "High" : "Medium",
    status:            "Open",
    created_at:        now,
    updated_at:        now,
  });

  // Fetch job to get provider company id for notifications
  const { data: job } = await db
    .from("secured_jobs")
    .select("service_provider_company_id, customer_company_id")
    .eq("job_reference", body.job_reference)
    .maybeSingle();

  const providerCompanyId = (job as { service_provider_company_id?: string | null } | null)?.service_provider_company_id ?? null;
  const customerCompanyId = (job as { customer_company_id?: string | null } | null)?.customer_company_id ?? null;

  // Notify admin
  await db.from("notifications").insert({
    job_reference:     body.job_reference,
    recipient_role:    "admin",
    notification_type: "Other",
    priority:          "High",
    title:             `⚠ Dispute raised — ${body.dispute_type} — Job ${body.job_reference}`,
    message:           `${profile.full_name} raised a ${body.dispute_type} dispute for Job ${body.job_reference}. Severity: ${severity}. Reason: ${body.dispute_reason}`,
    action_url:        `/admin/disputes`,
    actor_id:          profile.id,
    actor_name:        profile.full_name,
    actor_role:        profile.role,
    is_read:           false,
    created_at:        now,
  });

  // Notify provider
  if (providerCompanyId) {
    await db.from("notifications").insert({
      job_reference:        body.job_reference,
      recipient_role:       "provider",
      recipient_company_id: providerCompanyId,
      notification_type:    "Other",
      priority:             "High",
      title:                `⚠ Dispute raised against you — Job ${body.job_reference}`,
      message:              `Customer has raised a ${body.dispute_type} dispute for Job ${body.job_reference}. Reason: ${body.dispute_reason}. Please prepare your response.`,
      action_url:           `/provider/jobs/${body.job_reference}`,
      actor_id:             profile.id,
      actor_name:           profile.full_name,
      actor_role:           profile.role,
      is_read:              false,
      created_at:           now,
    });
  }

  // Audit log
  await insertAuditLogWithClient(db, {
    job_reference: body.job_reference,
    actor_id:      profile.id,
    actor_role:    profile.role,
    actor_name:    profile.full_name,
    action:        "dispute_case_created",
    description:   `Dispute case created. Type: ${body.dispute_type}. Severity: ${severity}. Reason: ${body.dispute_reason}`,
  });

  // Update secured_jobs if not already disputed
  await db
    .from("secured_jobs")
    .update({
      job_status:        "Delivery Disputed",
      current_milestone: "Delivery Disputed",
      updated_at:        now,
    })
    .eq("job_reference", body.job_reference)
    .not("job_status", "eq", "Delivery Disputed");

  // Create job_exceptions if not already exists
  const { data: existingEx } = await db
    .from("job_exceptions")
    .select("id")
    .eq("job_reference", body.job_reference)
    .eq("exception_type", "Customer Dispute")
    .eq("status", "Open")
    .maybeSingle();

  if (!existingEx) {
    await db.from("job_exceptions").insert({
      job_reference:  body.job_reference,
      exception_type: "Customer Dispute",
      severity:       severity,
      status:         "Open",
      title:          `${body.dispute_type} — Job ${body.job_reference}`,
      description:    `Customer raised a dispute. Type: ${body.dispute_type}. Reason: ${body.dispute_reason}`,
      reported_by_id: profile.id,
      reported_by:    profile.full_name,
      reported_at:    now,
      created_at:     now,
      updated_at:     now,
    });
  }

  void customerCompanyId; // available if needed for future use

  return NextResponse.json({ dispute });
}
