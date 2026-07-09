// ─── POST /api/strategic-milestones ──────────────────────────────────────────
// Admin only. Create a new strategic milestone linked to a KPI target.

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

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    target_id,
    milestone_name,
    milestone_description,
    due_date,
    milestone_status = "Pending",
    owner_role,
    owner_user_id,
  } = body as {
    target_id?: string; milestone_name?: string;
    milestone_description?: string; due_date?: string;
    milestone_status?: string; owner_role?: string;
    owner_user_id?: string;
  };

  if (!target_id)       return NextResponse.json({ error: "target_id is required" }, { status: 400 });
  if (!milestone_name)  return NextResponse.json({ error: "milestone_name is required" }, { status: 400 });

  // Verify target exists
  const { data: target, error: tErr } = await svc
    .from("strategic_kpi_targets")
    .select("id, target_name")
    .eq("id", target_id)
    .single();

  if (tErr || !target) return NextResponse.json({ error: "KPI target not found" }, { status: 404 });

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("strategic_milestones")
    .insert({
      target_id,
      milestone_name,
      milestone_description: milestone_description ?? null,
      due_date:              due_date              ?? null,
      milestone_status,
      owner_role:            owner_role            ?? null,
      owner_user_id:         owner_user_id         ?? null,
      created_at:            now,
      updated_at:            now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        "strategic_milestone_created",
    description:   `Strategic milestone created by ${caller.fullName}: "${milestone_name}" under target "${target.target_name}". Due: ${due_date ?? "—"}.`,
    metadata:      { target_id, milestone_name, due_date },
  }).catch(() => {});

  return NextResponse.json({ data }, { status: 201 });
}
