// ─── GET /api/internal-controls ──────────────────────────────────────────────
// Returns all active control rules.
// Admin only.
//
// PATCH /api/internal-controls
// Admin only. Body: { id, ...fields } — update is_active, control_note, etc.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { CONTROL_AUDIT_ACTIONS } from "@/lib/internalControl";

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
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string };
}

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const workflowArea = searchParams.get("workflow_area");
  const activeOnly   = searchParams.get("active") !== "false";

  let query = svc
    .from("internal_control_rules")
    .select("*")
    .order("workflow_area", { ascending: true })
    .order("control_name",  { ascending: true });

  if (activeOnly)   query = query.eq("is_active", true);
  if (workflowArea) query = query.eq("workflow_area", workflowArea);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const now = new Date().toISOString();
  updates.updated_at = now;

  const { data, error } = await svc
    .from("internal_control_rules")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        CONTROL_AUDIT_ACTIONS.rule_updated,
    description:   `Internal control rule updated by ${caller.fullName}: ${JSON.stringify(Object.keys(updates))}`,
    metadata:      { rule_id: id },
  }).catch(() => {});

  return NextResponse.json({ data });
}
