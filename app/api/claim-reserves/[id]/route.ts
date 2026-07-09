// ─── GET  /api/claim-reserves/[id]   — single reserve
// ─── PATCH /api/claim-reserves/[id]  — update (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  CR_AUDIT_ACTIONS,
  RESERVE_COMPLIANCE_NOTE,
  VALID_ACTIONS_BY_STATUS,
  type ReserveStatus,
  type ReserveAction,
} from "@/lib/claimReserve";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: reserve, error } = await svc
    .from("claim_reserves")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error)   return NextResponse.json({ error: error.message }, { status: 500 });
  if (!reserve) return NextResponse.json({ error: "Reserve not found" }, { status: 404 });

  // Scope check for non-admins via job company membership
  if (!isAdmin && caller.companyId) {
    const { data: job } = await svc
      .from("secured_jobs")
      .select("service_provider_company_id, customer_company_id")
      .eq("job_reference", reserve.job_reference)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (isProvider && job.service_provider_company_id !== caller.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isCustomer && job.customer_company_id !== caller.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ data: reserve });
}

// ── PATCH — update reserve ────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can update claim reserves" }, { status: 403 });
  }

  const body = await req.json() as {
    action:           ReserveAction;
    reserve_amount?:  number;       // for adjust
    applied_amount?:  number;       // for apply
    released_amount?: number;       // for release
    resolution_note?: string;
    reason?:          string;
  };

  if (!body.action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  // Fetch existing
  const { data: existing, error: fetchErr } = await svc
    .from("claim_reserves")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Reserve not found" }, { status: 404 });

  const currentStatus = existing.reserve_status as ReserveStatus;
  const validActions  = VALID_ACTIONS_BY_STATUS[currentStatus] ?? [];

  if (!validActions.includes(body.action)) {
    return NextResponse.json(
      { error: `Action "${body.action}" is not valid for status "${currentStatus}". Valid: ${validActions.join(", ") || "none"}` },
      { status: 400 }
    );
  }

  // Build update payload
  const update: Record<string, unknown> = {};
  let newStatus: ReserveStatus = currentStatus;
  let auditAction: string = CR_AUDIT_ACTIONS.adjusted;
  let description = "";

  switch (body.action) {
    case "approve":
      newStatus    = "Active";
      auditAction  = CR_AUDIT_ACTIONS.approved;
      update.approved_by  = caller.userId;
      update.approved_at  = new Date().toISOString();
      description = `Claim reserve approved and set Active for job ${existing.job_reference}. Reserve: ${existing.currency} ${Number(existing.reserve_amount).toLocaleString()}. Release subject to review.`;
      break;

    case "adjust":
      newStatus   = "Adjusted";
      auditAction = CR_AUDIT_ACTIONS.adjusted;
      if (body.reserve_amount != null && body.reserve_amount > 0) {
        update.reserve_amount = body.reserve_amount;
      }
      if (body.reason) update.reason = body.reason;
      description = `Claim reserve adjusted for job ${existing.job_reference}. New amount: ${existing.currency} ${(body.reserve_amount ?? existing.reserve_amount).toLocaleString()}.${body.reason ? ` Reason: ${body.reason}` : ""}`;
      break;

    case "apply":
      newStatus   = "Applied";
      auditAction = CR_AUDIT_ACTIONS.applied;
      update.applied_amount  = body.applied_amount ?? existing.reserve_amount;
      update.resolution_note = body.resolution_note ?? null;
      description = `Claim reserve applied for job ${existing.job_reference}. Applied: ${existing.currency} ${(body.applied_amount ?? existing.reserve_amount).toLocaleString()}.${body.resolution_note ? ` Note: ${body.resolution_note}` : ""} ${RESERVE_COMPLIANCE_NOTE}`;
      break;

    case "release":
      newStatus   = "Released";
      auditAction = CR_AUDIT_ACTIONS.released;
      update.released_amount = body.released_amount ?? existing.reserve_amount;
      update.resolution_note = body.resolution_note ?? null;
      description = `Claim reserve released for job ${existing.job_reference}. Released: ${existing.currency} ${(body.released_amount ?? existing.reserve_amount).toLocaleString()}.${body.resolution_note ? ` Note: ${body.resolution_note}` : ""}`;
      break;

    case "cancel":
      newStatus   = "Cancelled";
      auditAction = CR_AUDIT_ACTIONS.cancelled;
      update.resolution_note = body.resolution_note ?? null;
      description = `Claim reserve cancelled for job ${existing.job_reference}.${body.resolution_note ? ` Note: ${body.resolution_note}` : ""}`;
      break;
  }

  update.reserve_status = newStatus;

  const { data: updated, error: updateErr } = await svc
    .from("claim_reserves")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await insertAuditLogWithClient(svc, {
    job_reference: existing.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description,
  }).catch(() => { /* silent */ });

  // Additional audit if release is now reduced
  if (body.action === "approve" || body.action === "adjust") {
    await insertAuditLogWithClient(svc, {
      job_reference: existing.job_reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        CR_AUDIT_ACTIONS.release_reduced,
      description:   `Payment release is reduced by claim reserve of ${existing.currency} ${Number(update.reserve_amount ?? existing.reserve_amount).toLocaleString()} for job ${existing.job_reference}. Release subject to review.`,
    }).catch(() => { /* silent */ });
  }

  return NextResponse.json({ success: true, data: updated });
}
