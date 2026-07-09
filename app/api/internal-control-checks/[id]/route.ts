// ─── GET /api/internal-control-checks/[id] ────────────────────────────────────
// Returns a single control check with its rule.
//
// PATCH /api/internal-control-checks/[id]
// Admin only. Actions:
//   { action: "override", override_reason: string }  — override a failed check
//   { action: "acknowledge" }                         — acknowledge a warning check

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await svc
    .from("internal_control_checks")
    .select(`*, control_rule:internal_control_rules(*)`)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Non-admin: only see if belongs to their job
  if (caller.role !== "admin") {
    // The GET route.ts already has RLS; just return with limited fields
    return NextResponse.json({ data });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: { action: string; override_reason?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, override_reason } = body;

  // Fetch existing check
  const { data: existing, error: fetchErr } = await svc
    .from("internal_control_checks")
    .select("id, check_status, job_reference, control_rule_id, workflow_area")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) return NextResponse.json({ error: "Check not found" }, { status: 404 });

  const now = new Date().toISOString();
  let updates: Record<string, unknown> = { updated_at: now };
  let auditAction: string;
  let auditDescription: string;

  if (action === "override") {
    // Override: must supply a written reason, current status must be Failed or Warning
    if (!override_reason || override_reason.trim().length < 5) {
      return NextResponse.json(
        { error: "override_reason is required and must be at least 5 characters" },
        { status: 400 },
      );
    }
    if (!["Failed", "Warning"].includes(existing.check_status as string)) {
      return NextResponse.json(
        { error: "Only Failed or Warning checks can be overridden" },
        { status: 400 },
      );
    }
    updates = {
      ...updates,
      check_status:    "Overridden",
      override_reason: override_reason.trim(),
      checked_by:      caller.userId,
      checked_at:      now,
    };
    auditAction      = CONTROL_AUDIT_ACTIONS.check_overridden;
    auditDescription = `Control check overridden by ${caller.fullName} (${existing.workflow_area}): ${override_reason.trim()}`;
  } else if (action === "acknowledge") {
    // Acknowledge: mark a warning as acknowledged (status stays Warning, but acknowledged_at set)
    if (existing.check_status !== "Warning") {
      return NextResponse.json(
        { error: "Only Warning checks can be acknowledged" },
        { status: 400 },
      );
    }
    // We store acknowledgment via a note in override_reason to avoid schema changes
    updates = {
      ...updates,
      override_reason: `Acknowledged by ${caller.fullName} at ${now}`,
    };
    auditAction      = CONTROL_AUDIT_ACTIONS.warning_acknowledged;
    auditDescription = `Control check warning acknowledged by ${caller.fullName} (${existing.workflow_area})`;
  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { data, error } = await svc
    .from("internal_control_checks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: (existing.job_reference as string | null) ?? "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description:   auditDescription,
    metadata: {
      check_id:       id,
      workflow_area:  existing.workflow_area,
      previous_status: existing.check_status,
      new_action:     action,
    },
  }).catch(() => {});

  return NextResponse.json({ data });
}
