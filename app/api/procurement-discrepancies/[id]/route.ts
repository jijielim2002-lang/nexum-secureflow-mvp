// ─── GET  /api/procurement-discrepancies/[id] ─────────────────────────────────
// Returns a single discrepancy row.
//
// PATCH /api/procurement-discrepancies/[id]
// Admin only. Body: { action, ...fields }
// Actions:
//   review     → mark Under Review
//   resolve    → { resolution_note: string }
//   ignore     → { resolution_note: string }
//   escalate   → { resolution_note?: string }
//   update     → { severity?, recommended_action?, resolution_note? }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { DISCREPANCY_AUDIT_ACTIONS } from "@/lib/procurementDiscrepancy";

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
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
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
    .from("procurement_discrepancies")
    .select("*")
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
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: row } = await svc
    .from("procurement_discrepancies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action  = body.action as string;
  const now     = new Date().toISOString();
  const auditRef = row.job_reference ?? `procurement:${row.procurement_reference ?? "unknown"}`;

  // ── review ────────────────────────────────────────────────────────────────

  if (action === "review") {
    const { error } = await svc
      .from("procurement_discrepancies")
      .update({ status: "Under Review", reviewed_by: caller.userId, reviewed_at: now, updated_at: now })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        DISCREPANCY_AUDIT_ACTIONS.reviewed,
      description:   `Discrepancy "${row.discrepancy_type}" marked Under Review by ${caller.fullName}.`,
      metadata:      { discrepancy_id: id, discrepancy_type: row.discrepancy_type },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Under Review" } });
  }

  // ── resolve ───────────────────────────────────────────────────────────────

  if (action === "resolve") {
    const note = body.resolution_note as string | undefined;
    if (!note?.trim()) return NextResponse.json({ error: "resolution_note required" }, { status: 400 });

    const { error } = await svc
      .from("procurement_discrepancies")
      .update({
        status:          "Resolved",
        resolution_note: note,
        reviewed_by:     caller.userId,
        reviewed_at:     now,
        updated_at:      now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        DISCREPANCY_AUDIT_ACTIONS.resolved,
      description:   `Discrepancy "${row.discrepancy_type}" resolved by ${caller.fullName}: ${note}`,
      metadata:      { discrepancy_id: id, resolution_note: note },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Resolved" } });
  }

  // ── ignore ────────────────────────────────────────────────────────────────

  if (action === "ignore") {
    const note = body.resolution_note as string | undefined;
    if (!note?.trim()) return NextResponse.json({ error: "resolution_note required (reason for ignoring)" }, { status: 400 });

    const { error } = await svc
      .from("procurement_discrepancies")
      .update({
        status:          "Ignored",
        resolution_note: note,
        reviewed_by:     caller.userId,
        reviewed_at:     now,
        updated_at:      now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        DISCREPANCY_AUDIT_ACTIONS.ignored,
      description:   `Discrepancy "${row.discrepancy_type}" ignored by ${caller.fullName}: ${note}`,
      metadata:      { discrepancy_id: id, reason: note },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Ignored" } });
  }

  // ── escalate ──────────────────────────────────────────────────────────────

  if (action === "escalate") {
    const note = body.resolution_note as string | undefined;

    const { error } = await svc
      .from("procurement_discrepancies")
      .update({
        status:          "Escalated",
        resolution_note: note ?? null,
        reviewed_by:     caller.userId,
        reviewed_at:     now,
        updated_at:      now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Create admin notification for escalated discrepancy
    void Promise.resolve(svc.from("notifications").insert({
      recipient_role:  "admin",
      job_reference:   row.job_reference ?? null,
      type:            "exception",
      message:         `Escalated discrepancy: "${row.discrepancy_type}" (${row.severity}) on procurement order ${row.procurement_reference ?? "—"}. Review required.`,
      read:            false,
      created_at:      now,
    })).catch(() => {});

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        DISCREPANCY_AUDIT_ACTIONS.escalated,
      description:   `Discrepancy "${row.discrepancy_type}" escalated by ${caller.fullName}.${note ? ` Note: ${note}` : ""}`,
      metadata:      { discrepancy_id: id, severity: row.severity },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: "Escalated" } });
  }

  // ── update ────────────────────────────────────────────────────────────────

  if (action === "update") {
    const updates: Record<string, unknown> = { updated_at: now };
    if (body.severity)           updates.severity            = body.severity;
    if (body.recommended_action) updates.recommended_action  = body.recommended_action;
    if (body.resolution_note)    updates.resolution_note     = body.resolution_note;

    const { error } = await svc
      .from("procurement_discrepancies")
      .update(updates)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { updated: true } });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
