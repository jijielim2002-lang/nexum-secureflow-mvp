// ─── GET   /api/membership-change-requests/[id]
// ─── PATCH /api/membership-change-requests/[id]
//     actions: submit | review | approve | reject | apply | cancel

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  VALID_ACTIONS_BY_STATUS,
  MCR_AUDIT_ACTIONS,
  type RequestStatus,
  type RequestAction,
} from "@/lib/membershipChangeRequest";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("membership_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Non-admin: must be own company
  if (caller.role !== "admin" && data.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action, commercial_note, effective_date, rejection_reason } = body as {
    action?:           RequestAction;
    commercial_note?:  string;
    effective_date?:   string;
    rejection_reason?: string;
  };

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  // Non-admin can only submit/cancel their own
  if (caller.role !== "admin" && !["submit", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch current request
  const { data: current, error: fetchErr } = await svc
    .from("membership_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership check for non-admins
  if (caller.role !== "admin" && current.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate action against current status
  const validActions = VALID_ACTIONS_BY_STATUS[current.request_status as RequestStatus] ?? [];
  if (!validActions.includes(action)) {
    return NextResponse.json({
      error: `Action "${action}" is not valid for status "${current.request_status}". Valid: [${validActions.join(", ")}]`,
    }, { status: 422 });
  }

  // Build status transition map
  const statusMap: Record<RequestAction, RequestStatus> = {
    submit:  "Submitted",
    review:  "Under Review",
    approve: "Approved",
    reject:  "Rejected",
    apply:   "Applied",
    cancel:  "Cancelled",
  };

  const updatePayload: Record<string, unknown> = {
    request_status: statusMap[action],
    updated_at:     new Date().toISOString(),
  };

  if (commercial_note !== undefined) updatePayload.commercial_note = commercial_note;
  if (effective_date  !== undefined) updatePayload.effective_date  = effective_date;

  if (action === "approve") {
    updatePayload.approved_by = caller.userId;
    updatePayload.approved_at = new Date().toISOString();
  }

  if (action === "reject" && rejection_reason) {
    updatePayload.commercial_note = rejection_reason;
  }

  if (action === "apply") {
    updatePayload.applied_at = new Date().toISOString();
  }

  // ── Apply: update the membership ─────────────────────────────────────────
  if (action === "apply" && current.requested_plan_id && current.current_membership_id) {
    // Fetch the target plan details
    const { data: targetPlan } = await svc
      .from("membership_plans")
      .select("id, plan_name, annual_fee, included_secured_jobs, included_document_extractions, included_tracking_checks, included_rfqs, included_quotations")
      .eq("id", current.requested_plan_id)
      .maybeSingle();

    if (targetPlan) {
      await svc
        .from("memberships")
        .update({
          plan:          targetPlan.plan_name,
          plan_id:       targetPlan.id,
          annual_fee:    targetPlan.annual_fee,
          included_jobs: targetPlan.included_secured_jobs,
          updated_at:    new Date().toISOString(),
        })
        .eq("id", current.current_membership_id);
    }
  }

  const { data: updated, error: updateErr } = await svc
    .from("membership_change_requests")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // ── Audit log ──────────────────────────────────────────────────────────────
  const auditActionMap: Record<RequestAction, string> = {
    submit:  MCR_AUDIT_ACTIONS.request_created,
    review:  MCR_AUDIT_ACTIONS.request_created,
    approve: MCR_AUDIT_ACTIONS.request_approved,
    reject:  MCR_AUDIT_ACTIONS.request_rejected,
    apply:   MCR_AUDIT_ACTIONS.change_applied,
    cancel:  MCR_AUDIT_ACTIONS.request_created,
  };

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditActionMap[action],
    description:   `Membership change request ${id} [${current.request_type}] ${action} by ${caller.fullName}.${rejection_reason ? ` Reason: ${rejection_reason}` : ""}`,
  }).catch(() => {});

  return NextResponse.json({ data: updated });
}
