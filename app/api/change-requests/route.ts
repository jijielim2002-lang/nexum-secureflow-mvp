// ─── GET /api/change-requests — list change requests (role-filtered)
// ─── POST /api/change-requests — create a new change request

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  getDefaultApprovalRequired,
  CHANGE_AUDIT_ACTIONS,
  type ChangeRequestType,
  type ApprovalRequiredFrom,
  getApprovalParties,
  PROVIDER_ALLOWED_TYPES,
  CUSTOMER_ALLOWED_TYPES,
} from "@/lib/changeRequest";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET — list ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobReference = searchParams.get("jobReference");
  const statusFilter = searchParams.get("status");
  const typeFilter   = searchParams.get("type");

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let q = svc
    .from("job_change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (jobReference) q = q.eq("job_reference", jobReference);
  if (statusFilter)  q = q.eq("status", statusFilter);
  if (typeFilter)    q = q.eq("change_type", typeFilter);

  // Role-based scope filter
  if (isProvider) {
    // Only jobs where caller's company is the service provider
    const { data: providerJobs } = await svc
      .from("secured_jobs")
      .select("job_reference")
      .eq("service_provider_company_id", caller.companyId ?? "");
    const refs = (providerJobs ?? []).map((j: { job_reference: string }) => j.job_reference);
    if (refs.length === 0) return NextResponse.json({ data: [] });
    q = q.in("job_reference", refs);
  } else if (isCustomer) {
    const { data: customerJobs } = await svc
      .from("secured_jobs")
      .select("job_reference")
      .eq("customer_company_id", caller.companyId ?? "");
    const refs = (customerJobs ?? []).map((j: { job_reference: string }) => j.job_reference);
    if (refs.length === 0) return NextResponse.json({ data: [] });
    q = q.in("job_reference", refs);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST — create ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    job_reference:           string;
    change_type:             ChangeRequestType;
    change_reason?:          string;
    current_value?:          Record<string, unknown>;
    proposed_value?:         Record<string, unknown>;
    financial_impact_amount?: number;
    currency?:               string;
    approval_required_from?: ApprovalRequiredFrom;
  };

  const {
    job_reference,
    change_type,
    change_reason,
    current_value,
    proposed_value,
    financial_impact_amount,
    currency = "RM",
    approval_required_from,
  } = body;

  if (!job_reference || !change_type) {
    return NextResponse.json({ error: "job_reference and change_type are required" }, { status: 400 });
  }

  // Validate type is allowed for role
  if (isProvider && !PROVIDER_ALLOWED_TYPES.includes(change_type)) {
    return NextResponse.json({ error: `Providers cannot request change type: ${change_type}` }, { status: 403 });
  }
  if (isCustomer && !CUSTOMER_ALLOWED_TYPES.includes(change_type)) {
    return NextResponse.json({ error: `Customers cannot request change type: ${change_type}` }, { status: 403 });
  }

  // Verify job exists and caller has access
  const { data: job } = await svc
    .from("secured_jobs")
    .select("job_reference, customer, service_provider, service_provider_company_id, customer_company_id, currency")
    .eq("job_reference", job_reference)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (isProvider && job.service_provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden: not your job" }, { status: 403 });
  }
  if (isCustomer && job.customer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden: not your job" }, { status: 403 });
  }

  const arf = approval_required_from ?? getDefaultApprovalRequired(change_type);
  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("job_change_requests")
    .insert({
      job_reference,
      requested_by:            caller.userId,
      requested_by_role:       caller.role,
      requested_by_company_id: caller.companyId,
      change_type,
      change_reason:           change_reason ?? null,
      current_value:           current_value ?? null,
      proposed_value:          proposed_value ?? null,
      financial_impact_amount: financial_impact_amount ?? null,
      currency:                currency ?? job.currency ?? "RM",
      approval_required_from:  arf,
      status:                  "Pending Approval",  // auto-submit on create
      created_at:              now,
      updated_at:              now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await insertAuditLogWithClient(svc, {
    job_reference,
    actor_role:  caller.role,
    actor_name:  caller.fullName,
    action:      CHANGE_AUDIT_ACTIONS.created,
    description: `${caller.fullName} (${caller.role}) submitted a change request: ${change_type}${change_reason ? ` — ${change_reason}` : ""}.`,
  }).catch(() => { /* silent */ });

  // Notify required approvers
  const parties = getApprovalParties(arf);
  const notifs = parties
    .filter((p) => p !== caller.role.replace("service_provider", "provider"))
    .map((party) => ({
      job_reference,
      recipient_role:    party === "provider" ? "service_provider" : party,
      notification_type: "Action Required",
      title:             `Change Request — ${change_type} (${job_reference})`,
      message:           `A change request (${change_type}) has been submitted for job ${job_reference} and requires your approval.${change_reason ? ` Reason: ${change_reason}` : ""}`,
      priority:          "Medium",
      delivery_channel:  "In-App",
      status:            "Unread",
      action_url:        `/admin/jobs/${job_reference}`,
      created_at:        now,
    }));

  if (notifs.length > 0) {
    try { await svc.from("notifications").insert(notifs); } catch { /* silent */ }
  }

  return NextResponse.json({ success: true, data });
}
