// ─── GET + POST /api/job-terms-snapshots ─────────────────────────────────────
// GET  — list snapshots (admin: all; customer/provider: their own)
// POST — create a new snapshot (customer accepting a job)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { SNAPSHOT_AUDIT_ACTIONS } from "@/lib/jobTermsSnapshot";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

interface Caller {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<Caller | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobRef = req.nextUrl.searchParams.get("job_reference");
  const currentOnly = req.nextUrl.searchParams.get("current") !== "false"; // default true

  let q = svc
    .from("job_terms_snapshots")
    .select("*")
    .order("version_number", { ascending: false });

  if (jobRef) q = q.eq("job_reference", jobRef);
  if (currentOnly) q = q.eq("is_current", true);

  // Non-admin: filter to their company's records
  if (caller.role !== "admin" && caller.companyId) {
    if (caller.role === "customer") {
      q = q.eq("customer_company_id", caller.companyId);
    } else if (caller.role === "service_provider") {
      q = q.eq("provider_company_id", caller.companyId);
    }
  }

  const { data, error } = await q.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only customers (and admin on their behalf) may create snapshots
  if (caller.role !== "customer" && caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.job_reference) {
    return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  }

  const jobRef = body.job_reference as string;

  // Check for existing current snapshot — do not allow double-acceptance
  const { data: existing } = await svc
    .from("job_terms_snapshots")
    .select("id, version_number")
    .eq("job_reference", jobRef)
    .eq("is_current", true)
    .maybeSingle();

  if (existing) {
    // Already has a snapshot — return it (idempotent)
    return NextResponse.json({ success: true, data: existing, alreadyExists: true });
  }

  // Build the snapshot insert payload
  const now = new Date().toISOString();
  const insertPayload = {
    job_reference:                    jobRef,
    version_number:                   1,
    is_current:                       true,
    customer_company_id:              (body.customer_company_id as string | null) ?? caller.companyId,
    provider_company_id:              (body.provider_company_id as string | null) ?? null,
    accepted_by:                      caller.userId,           // real UUID from Supabase Auth
    accepted_by_label:                (body.accepted_by_label as string | null) ?? caller.fullName ?? null,
    accepted_at:                      now,
    terms_version:                    (body.terms_version as string | null) ?? "v1.0",
    service_type:                     (body.service_type as string | null) ?? null,
    route:                            (body.route as string | null) ?? null,
    job_value:                        (body.job_value as number | null) ?? null,
    currency:                         (body.currency as string | null) ?? null,
    payment_terms:                    (body.payment_terms as string | null) ?? null,
    required_deposit:                 (body.required_deposit as number | null) ?? null,
    balance_terms:                    (body.balance_terms as string | null) ?? null,
    delivery_confirmation_window_hours: (body.delivery_confirmation_window_hours as number | null) ?? 48,
    release_condition:                (body.release_condition as string | null) ?? null,
    dispute_condition:                (body.dispute_condition as string | null) ?? null,
    liability_note:                   (body.liability_note as string | null) ?? null,
    required_documents:               (body.required_documents as string[] | null) ?? null,
    pilot_disclaimer:                 (body.pilot_disclaimer as string | null) ?? null,
    snapshot_data:                    (body.snapshot_data as Record<string, unknown> | null) ?? null,
    created_at:                       now,
  };

  const { data, error } = await svc
    .from("job_terms_snapshots")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({
      error:   error.message,
      code:    (error as { code?: string }).code    ?? null,
      details: (error as { details?: string }).details ?? null,
      hint:    (error as { hint?: string }).hint    ?? null,
    }, { status: 500 });
  }

  // Audit: snapshot created + customer accepted (fire-and-forget — must not block response)
  Promise.all([
    insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SNAPSHOT_AUDIT_ACTIONS.created,
      description:   `Commercial terms snapshot created for job ${jobRef} (v1.0). Frozen at customer acceptance.`,
    }),
    insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SNAPSHOT_AUDIT_ACTIONS.accepted,
      description:   `${caller.fullName} (customer) accepted the commercial terms for job ${jobRef}. Terms snapshot recorded.`,
    }),
  ]).catch(console.warn);

  // Notify admin (best-effort)
  try {
    await svc.from("notifications").insert({
      job_reference:       jobRef,
      recipient_role:      "admin",
      notification_type:   "Other",
      title:               `Terms Accepted — ${jobRef}`,
      message:             `Customer accepted commercial terms for job ${jobRef}. Terms snapshot created.`,
      priority:            "Low",
      delivery_channel:    "In-App",
      status:              "Unread",
      created_at:          now,
    });
  } catch { /* silent */ }

  return NextResponse.json({ success: true, data });
}
