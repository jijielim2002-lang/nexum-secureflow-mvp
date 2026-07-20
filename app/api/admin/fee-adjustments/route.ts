/**
 * /api/admin/fee-adjustments
 *
 * GET    ?job_reference=   list adjustments for a job
 * GET    ?status=          filter by adjustment_status
 * GET    (no filter)       list all (admin/super_admin)
 * POST                     create a new fee adjustment (Draft or Pending Approval)
 * PATCH  ?id=              update status (approve/reject/apply/cancel)
 * DELETE ?id=              delete a Draft adjustment
 *
 * Authorization: Bearer <access_token>
 * Required nexum_role: super_admin | admin
 */

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/api-auth";
import { adminClient } from "@/lib/api-auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ["super_admin", "admin"];

async function requireNexumAdmin(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!caller.nexumRole || !ADMIN_ROLES.includes(caller.nexumRole)) {
    return { error: NextResponse.json({ error: "Forbidden — Nexum admin only" }, { status: 403 }) };
  }
  return { caller };
}

// Auto-determine direction from old/new amounts
function deriveDirection(oldAmount: number, newAmount: number): string {
  if (newAmount > oldAmount) return "Increase";
  if (newAmount < oldAmount) return "Decrease";
  return "Correction";
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { error, caller } = await requireNexumAdmin(req);
  if (error) return error;

  const db = adminClient();
  const { searchParams } = new URL(req.url);
  const jobRef = searchParams.get("job_reference");
  const status = searchParams.get("status");
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  let query = db
    .from("job_fee_adjustments")
    .select(`
      id, job_reference, fee_type,
      old_amount, new_amount, currency, adjustment_amount, adjustment_direction,
      reason, internal_notes, adjustment_status,
      requires_approval, customer_reacceptance_required,
      customer_reaccepted_at, job_stage_at_adjustment,
      requested_by, approved_by, rejected_by, applied_by,
      reviewed_at, approved_at, rejected_at, applied_at, cancelled_at,
      created_at, updated_at
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobRef)  query = query.eq("job_reference", jobRef);
  if (status)  query = query.eq("adjustment_status", status);

  const { data, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Enrich with actor emails for display
  const actorIds = new Set<string>();
  (data ?? []).forEach(r => {
    if (r.requested_by) actorIds.add(r.requested_by as string);
    if (r.approved_by)  actorIds.add(r.approved_by as string);
    if (r.rejected_by)  actorIds.add(r.rejected_by as string);
    if (r.applied_by)   actorIds.add(r.applied_by as string);
  });

  let actorMap: Record<string, string> = {};
  if (actorIds.size > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...actorIds]);
    (profiles ?? []).forEach((p: { id: string; full_name?: string; email?: string }) => {
      actorMap[p.id] = p.full_name ?? p.email ?? p.id;
    });
  }

  const enriched = (data ?? []).map(r => ({
    ...r,
    requested_by_name: r.requested_by ? (actorMap[r.requested_by as string] ?? null) : null,
    approved_by_name:  r.approved_by  ? (actorMap[r.approved_by as string] ?? null) : null,
    rejected_by_name:  r.rejected_by  ? (actorMap[r.rejected_by as string] ?? null) : null,
    applied_by_name:   r.applied_by   ? (actorMap[r.applied_by as string] ?? null) : null,
  }));

  return NextResponse.json({ data: enriched });
}

// ─── POST — create adjustment ─────────────────────────────────────────────────

interface CreateBody {
  job_reference:                string;
  fee_type:                     string;
  old_amount:                   number;
  new_amount:                   number;
  currency?:                    string;
  reason:                       string;
  internal_notes?:              string;
  customer_reacceptance_required?: boolean;
  job_stage_at_adjustment?:     string;
  submit_for_approval?:         boolean; // true → Pending Approval, false → Draft
}

export async function POST(req: NextRequest) {
  const { error, caller } = await requireNexumAdmin(req);
  if (error) return error;

  let body: CreateBody;
  try { body = await req.json() as CreateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    job_reference, fee_type, old_amount, new_amount, currency = "MYR",
    reason, internal_notes, customer_reacceptance_required = false,
    job_stage_at_adjustment, submit_for_approval = false,
  } = body;

  if (!job_reference || !fee_type || old_amount == null || new_amount == null || !reason) {
    return NextResponse.json(
      { error: "job_reference, fee_type, old_amount, new_amount, and reason are required" },
      { status: 400 },
    );
  }

  const db = adminClient();

  // Verify job exists
  const { data: job } = await db
    .from("secured_jobs")
    .select("job_reference, status")
    .eq("job_reference", job_reference)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Check approval threshold from platform_settings
  let approvalThreshold = 500; // default
  const { data: setting } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", "fee_adjustment_approval_threshold")
    .maybeSingle();
  if (setting?.value) approvalThreshold = parseFloat(setting.value);

  const adjustmentAmount = Math.abs(new_amount - old_amount);
  const requiresApproval = adjustmentAmount >= approvalThreshold || submit_for_approval;
  const initialStatus = submit_for_approval
    ? "Pending Approval"
    : caller!.nexumRole === "super_admin" && !submit_for_approval
      ? "Draft"
      : "Draft";

  const { data: adj, error: insertErr } = await db
    .from("job_fee_adjustments")
    .insert({
      job_reference,
      fee_type,
      old_amount,
      new_amount,
      currency,
      adjustment_direction:          deriveDirection(old_amount, new_amount),
      reason,
      internal_notes:                internal_notes ?? null,
      adjustment_status:             initialStatus,
      requires_approval:             requiresApproval,
      customer_reacceptance_required,
      job_stage_at_adjustment:       job_stage_at_adjustment ?? (job.status as string),
      requested_by:                  caller!.userId,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Audit log
  await db.from("fee_adjustment_audit_log").insert({
    fee_adjustment_id: adj.id,
    action:            submit_for_approval ? "submitted" : "drafted",
    from_status:       null,
    to_status:         initialStatus,
    actor_id:          caller!.userId,
    actor_nexum_role:  caller!.nexumRole,
    note:              reason,
  });

  return NextResponse.json({ success: true, data: adj }, { status: 201 });
}

// ─── PATCH — update status ────────────────────────────────────────────────────

interface PatchBody {
  action: "submit" | "approve" | "reject" | "apply" | "cancel";
  note?:  string;
}

export async function PATCH(req: NextRequest) {
  const { error, caller } = await requireNexumAdmin(req);
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: PatchBody;
  try { body = await req.json() as PatchBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, note } = body;
  const db = adminClient();

  const { data: adj, error: fetchErr } = await db
    .from("job_fee_adjustments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !adj) return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });

  const now = new Date().toISOString();
  const fromStatus = adj.adjustment_status as string;
  let updates: Record<string, unknown> = { updated_at: now };
  let toStatus = fromStatus;
  let auditAction = action;

  switch (action) {
    case "submit":
      if (fromStatus !== "Draft") return NextResponse.json({ error: "Only Draft can be submitted" }, { status: 400 });
      toStatus = "Pending Approval";
      updates = { ...updates, adjustment_status: toStatus };
      break;

    case "approve":
      if (fromStatus !== "Pending Approval") return NextResponse.json({ error: "Only Pending Approval can be approved" }, { status: 400 });
      // Only super_admin can approve
      if (caller!.nexumRole !== "super_admin") {
        return NextResponse.json({ error: "Only super_admin can approve fee adjustments" }, { status: 403 });
      }
      toStatus = "Approved";
      updates = { ...updates, adjustment_status: toStatus, approved_by: caller!.userId, approved_at: now };
      break;

    case "reject":
      if (!["Pending Approval", "Draft"].includes(fromStatus)) {
        return NextResponse.json({ error: "Cannot reject in current status" }, { status: 400 });
      }
      if (caller!.nexumRole !== "super_admin") {
        return NextResponse.json({ error: "Only super_admin can reject fee adjustments" }, { status: 403 });
      }
      toStatus = "Rejected";
      updates = { ...updates, adjustment_status: toStatus, rejected_by: caller!.userId, rejected_at: now };
      break;

    case "apply":
      if (fromStatus !== "Approved") return NextResponse.json({ error: "Only Approved adjustments can be applied" }, { status: 400 });
      toStatus = "Applied";
      updates = { ...updates, adjustment_status: toStatus, applied_by: caller!.userId, applied_at: now };
      break;

    case "cancel":
      if (["Applied", "Cancelled"].includes(fromStatus)) {
        return NextResponse.json({ error: "Cannot cancel an Applied or already Cancelled adjustment" }, { status: 400 });
      }
      toStatus = "Cancelled";
      updates = { ...updates, adjustment_status: toStatus, cancelled_by: caller!.userId, cancelled_at: now };
      break;

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await db
    .from("job_fee_adjustments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Audit log
  await db.from("fee_adjustment_audit_log").insert({
    fee_adjustment_id: id,
    action:            auditAction,
    from_status:       fromStatus,
    to_status:         toStatus,
    actor_id:          caller!.userId,
    actor_nexum_role:  caller!.nexumRole,
    note:              note ?? null,
  });

  return NextResponse.json({ success: true, data: updated });
}

// ─── DELETE — remove Draft ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { error, caller } = await requireNexumAdmin(req);
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = adminClient();
  const { data: adj } = await db
    .from("job_fee_adjustments")
    .select("adjustment_status")
    .eq("id", id)
    .maybeSingle();

  if (!adj) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (adj.adjustment_status !== "Draft") {
    return NextResponse.json({ error: "Only Draft adjustments can be deleted" }, { status: 400 });
  }

  const { error: delErr } = await db.from("job_fee_adjustments").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await db.from("fee_adjustment_audit_log").insert({
    fee_adjustment_id: id,
    action:            "deleted",
    from_status:       "Draft",
    to_status:         null,
    actor_id:          caller!.userId,
    actor_nexum_role:  caller!.nexumRole,
  });

  return NextResponse.json({ success: true });
}
