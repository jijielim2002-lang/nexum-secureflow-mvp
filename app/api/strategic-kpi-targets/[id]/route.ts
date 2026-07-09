// ─── GET /api/strategic-kpi-targets/[id] ────────────────────────────────────
// Admin only. Get a single strategic KPI target with milestones.
//
// PATCH /api/strategic-kpi-targets/[id]
// Admin only. Update a KPI target.
//
// DELETE /api/strategic-kpi-targets/[id]
// Admin only. Delete (cancel) a KPI target.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const KPI_AUDIT_ACTIONS = {
  kpi_target_updated:  "kpi_target_updated",
  kpi_target_achieved: "kpi_target_achieved",
} as const;

interface CallerInfo {
  userId:   string;
  role:     string;
  fullName: string;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name };
}

function computeStatus(
  targetValue: number,
  currentValue: number,
  periodStart: string | null,
  periodEnd: string | null,
  existingStatus: string,
): string {
  if (existingStatus === "Cancelled") return "Cancelled";
  if (currentValue >= targetValue) return "Achieved";

  const now = new Date();

  // If period has ended and not achieved → Missed
  if (periodEnd) {
    const end = new Date(periodEnd);
    if (now > end) return "Missed";
  }

  // If no period defined, can't compute time-based status
  if (!periodStart || !periodEnd) return existingStatus;

  const start = new Date(periodStart);
  const end   = new Date(periodEnd);
  const totalMs   = end.getTime() - start.getTime();
  const elapsedMs = Math.max(0, now.getTime() - start.getTime());

  if (totalMs <= 0) return existingStatus;

  const expectedProgress = Math.min(100, (elapsedMs / totalMs) * 100);
  const actualProgress   = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;

  if (actualProgress >= expectedProgress)             return "On Track";
  if (actualProgress >= expectedProgress * 0.8)       return "At Risk";
  return "Behind";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await svc
    .from("strategic_kpi_targets")
    .select(`*, milestones:strategic_milestones(*)`)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Fetch existing record
  const { data: existing, error: fetchErr } = await svc
    .from("strategic_kpi_targets")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    target_name, target_category, metric_name,
    target_value, current_value,
    unit, period_start, period_end,
    status, priority, owner_role, owner_user_id,
    notes,
  } = body as Record<string, unknown>;

  const newTargetValue   = (target_value   as number | undefined) ?? existing.target_value;
  const newCurrentValue  = (current_value  as number | undefined) ?? existing.current_value;
  const newPeriodStart   = (period_start   as string | undefined) ?? existing.period_start;
  const newPeriodEnd     = (period_end     as string | undefined) ?? existing.period_end;
  const newStatus        = (status         as string | undefined) ?? existing.status;

  const progress_percentage = newTargetValue > 0
    ? Math.min(100, (newCurrentValue / newTargetValue) * 100)
    : 0;

  const computedStatus = computeStatus(
    newTargetValue, newCurrentValue, newPeriodStart, newPeriodEnd, newStatus,
  );

  const wasAchieved = existing.status !== "Achieved" && computedStatus === "Achieved";

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updated_at:          now,
    progress_percentage,
    status:              computedStatus,
  };

  if (target_name    !== undefined) updates.target_name    = target_name;
  if (target_category !== undefined) updates.target_category = target_category;
  if (metric_name    !== undefined) updates.metric_name    = metric_name;
  if (target_value   !== undefined) updates.target_value   = target_value;
  if (current_value  !== undefined) updates.current_value  = current_value;
  if (unit           !== undefined) updates.unit           = unit;
  if (period_start   !== undefined) updates.period_start   = period_start;
  if (period_end     !== undefined) updates.period_end     = period_end;
  if (priority       !== undefined) updates.priority       = priority;
  if (owner_role     !== undefined) updates.owner_role     = owner_role;
  if (owner_user_id  !== undefined) updates.owner_user_id  = owner_user_id;
  if (notes          !== undefined) updates.notes          = notes;

  const { data, error } = await svc
    .from("strategic_kpi_targets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (wasAchieved) {
    void Promise.resolve(
      svc.from("notifications").insert({
        notification_type: "kpi_target_achieved",
        title:             `KPI Target Achieved: ${existing.target_name}`,
        message:           `Strategic target "${existing.target_name}" has been achieved! Current value: ${newCurrentValue} / Target: ${newTargetValue}.`,
        priority:          "High",
        recipient_role:    "admin",
        status:            "Open",
        created_at:        now,
        updated_at:        now,
      })
    ).catch(() => {});

    insertAuditLogWithClient(svc, {
      job_reference: "",
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        KPI_AUDIT_ACTIONS.kpi_target_achieved,
      description:   `KPI target ACHIEVED by ${caller.fullName}: "${existing.target_name}" — ${newCurrentValue} / ${newTargetValue}.`,
      metadata:      { target_name: existing.target_name, current_value: newCurrentValue, target_value: newTargetValue },
    }).catch(() => {});
  } else {
    insertAuditLogWithClient(svc, {
      job_reference: "",
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        KPI_AUDIT_ACTIONS.kpi_target_updated,
      description:   `KPI target updated by ${caller.fullName}: "${existing.target_name}" → status: ${computedStatus}, progress: ${progress_percentage.toFixed(1)}%.`,
      metadata:      { current_value: newCurrentValue, target_value: newTargetValue, status: computedStatus },
    }).catch(() => {});
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Soft delete: set status to Cancelled
  const { error } = await svc
    .from("strategic_kpi_targets")
    .update({ status: "Cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        "kpi_target_updated",
    description:   `KPI target cancelled by ${caller.fullName}.`,
    metadata:      { id },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
