// ─── GET  /api/action-recommendations/[id] ────────────────────────────────────
// Returns a single recommendation row.
//
// PATCH /api/action-recommendations/[id]
// Body: { action, ...fields }
// Actions:
//   accept      → mark Accepted (admin)
//   create_task → accept + create workflow_task (admin)
//   dismiss     → { dismissed_reason: string } (admin)
//   escalate    → { escalated_note?: string } (admin)
//   complete    → { completed_note?: string } (admin)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { PLAYBOOK_AUDIT_ACTIONS } from "@/lib/actionPlaybook";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("action_recommendations")
    .select("*, playbook:action_playbooks(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" },  { status: 404 });

  return NextResponse.json({ data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row } = await svc
    .from("action_recommendations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Non-admin can only interact with recommendations assigned to their role
  if (caller.role !== "admin" && row.assigned_role !== caller.role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;
  const now    = new Date().toISOString();
  const auditRef = row.job_reference ?? `procurement:${row.procurement_reference ?? "unknown"}`;

  // ── accept ────────────────────────────────────────────────────────────────

  if (action === "accept") {
    const { error } = await svc
      .from("action_recommendations")
      .update({
        recommendation_status: "Accepted",
        accepted_by:           caller.userId,
        accepted_at:           now,
        updated_at:            now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PLAYBOOK_AUDIT_ACTIONS.recommendation_accepted,
      description:   `Action recommendation accepted by ${caller.fullName}: "${row.recommended_action?.slice(0, 120) ?? id}"`,
      metadata:      { recommendation_id: id, playbook_id: row.playbook_id },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Accepted" } });
  }

  // ── create_task ───────────────────────────────────────────────────────────

  if (action === "create_task") {
    // First accept if not already accepted
    if (!["Accepted", "Task Created"].includes(row.recommendation_status)) {
      await svc.from("action_recommendations").update({
        recommendation_status: "Accepted",
        accepted_by:           caller.userId,
        accepted_at:           now,
        updated_at:            now,
      }).eq("id", id);
    }

    // Create workflow_task via service role
    const taskTitle = `[${row.priority}] ${row.recommended_action?.slice(0, 100) ?? "Action required"}`;
    const { data: task, error: taskErr } = await svc
      .from("workflow_tasks")
      .insert({
        job_reference:     row.job_reference ?? null,
        company_id:        null,
        assigned_role:     row.assigned_role ?? "admin",
        task_type:         "Resolve Exception",
        title:             taskTitle,
        description:       `${row.recommended_action ?? ""}\n\nRationale: ${row.rationale ?? ""}\n\nSource: ${row.source_type ?? "—"} ${row.source_id ?? ""}`,
        priority:          row.priority ?? "Medium",
        status:            "Open",
        due_at:            row.due_at ?? null,
        source_type:       "action_recommendations",
        source_id:         id,
        created_by_system: true,
        created_at:        now,
        updated_at:        now,
      })
      .select("id")
      .single();

    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

    // Update recommendation with task_id
    await svc.from("action_recommendations").update({
      recommendation_status: "Task Created",
      task_id:               task.id,
      accepted_by:           caller.userId,
      accepted_at:           row.accepted_at ?? now,
      updated_at:            now,
    }).eq("id", id);

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PLAYBOOK_AUDIT_ACTIONS.recommendation_task_created,
      description:   `Workflow task created from recommendation by ${caller.fullName}: [${row.priority}] "${row.recommended_action?.slice(0, 100) ?? id}"`,
      metadata:      { recommendation_id: id, task_id: task.id, playbook_id: row.playbook_id },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Task Created", task_id: task.id } });
  }

  // ── dismiss ───────────────────────────────────────────────────────────────

  if (action === "dismiss") {
    const reason = body.dismissed_reason as string | undefined;
    if (!reason?.trim()) {
      return NextResponse.json({ error: "dismissed_reason required" }, { status: 400 });
    }

    const { error } = await svc
      .from("action_recommendations")
      .update({
        recommendation_status: "Dismissed",
        dismissed_reason:      reason,
        updated_at:            now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PLAYBOOK_AUDIT_ACTIONS.recommendation_dismissed,
      description:   `Recommendation dismissed by ${caller.fullName}: ${reason}`,
      metadata:      { recommendation_id: id, reason },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Dismissed" } });
  }

  // ── escalate ──────────────────────────────────────────────────────────────

  if (action === "escalate") {
    const note = body.escalated_note as string | undefined;

    const { error } = await svc
      .from("action_recommendations")
      .update({
        recommendation_status: "Escalated",
        escalated_note:        note ?? null,
        updated_at:            now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Admin notification
    void Promise.resolve(svc.from("notifications").insert({
      recipient_role: "admin",
      job_reference:  row.job_reference ?? null,
      type:           "exception",
      message:        `Escalated action recommendation: "${row.recommended_action?.slice(0, 120) ?? id}" [${row.priority}]${note ? ` — ${note}` : ""}. Immediate review required.`,
      read:           false,
      created_at:     now,
    })).catch(() => {});

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PLAYBOOK_AUDIT_ACTIONS.recommendation_escalated,
      description:   `Recommendation escalated by ${caller.fullName}.${note ? ` Note: ${note}` : ""}`,
      metadata:      { recommendation_id: id },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Escalated" } });
  }

  // ── complete ──────────────────────────────────────────────────────────────

  if (action === "complete") {
    const note = body.completed_note as string | undefined;

    const { error } = await svc
      .from("action_recommendations")
      .update({
        recommendation_status: "Completed",
        completed_note:        note ?? null,
        updated_at:            now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If there's a linked workflow task, complete it too
    if (row.task_id) {
      void Promise.resolve(svc.from("workflow_tasks").update({
        status:       "Completed",
        completed_at: now,
        updated_at:   now,
      }).eq("id", row.task_id)).catch(() => {});
    }

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PLAYBOOK_AUDIT_ACTIONS.recommendation_completed,
      description:   `Recommendation marked completed by ${caller.fullName}.${note ? ` Note: ${note}` : ""}`,
      metadata:      { recommendation_id: id },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Completed" } });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
