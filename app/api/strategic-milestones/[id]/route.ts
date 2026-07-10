// ─── PATCH /api/strategic-milestones/[id] ────────────────────────────────────
// Admin only. Update milestone status / details.
// Supported actions: mark_in_progress, mark_completed, mark_delayed, cancel, update

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name };
}

const STATUS_MAP: Record<string, string> = {
  mark_in_progress: "In Progress",
  mark_completed:   "Completed",
  mark_delayed:     "Delayed",
  cancel:           "Cancelled",
};

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

  const {
    action,
    milestone_name,
    milestone_description,
    due_date,
    owner_role,
    owner_user_id,
  } = body as {
    action?: string;
    milestone_name?: string;
    milestone_description?: string;
    due_date?: string;
    owner_role?: string;
    owner_user_id?: string;
  };

  // Fetch existing
  const { data: existing, error: fetchErr } = await svc
    .from("strategic_milestones")
    .select("*, target:strategic_kpi_targets(target_name)")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  // Apply action → status
  if (action && STATUS_MAP[action]) {
    updates.milestone_status = STATUS_MAP[action];
    if (action === "mark_completed") {
      updates.completed_at = now;
    }
  }

  if (milestone_name        !== undefined) updates.milestone_name        = milestone_name;
  if (milestone_description !== undefined) updates.milestone_description = milestone_description;
  if (due_date              !== undefined) updates.due_date              = due_date;
  if (owner_role            !== undefined) updates.owner_role            = owner_role;
  if (owner_user_id         !== undefined) updates.owner_user_id         = owner_user_id;

  const { data, error } = await svc
    .from("strategic_milestones")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targetName = (existing.target as { target_name?: string } | null)?.target_name ?? "";
  const auditAction = action === "mark_completed"
    ? "strategic_milestone_completed"
    : action === "mark_delayed"
    ? "strategic_milestone_delayed"
    : "strategic_milestone_created";

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description:   `Milestone "${existing.milestone_name}" (target: "${targetName}") updated by ${caller.fullName} → status: ${updates.milestone_status ?? existing.milestone_status}.`,
    metadata:      { milestone_name: existing.milestone_name, target_name: targetName, action },
  }).catch(() => {});

  return NextResponse.json({ data });
}
