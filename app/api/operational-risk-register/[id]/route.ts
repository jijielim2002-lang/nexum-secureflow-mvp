// ─── GET  /api/operational-risk-register/[id] ─────────────────────────────────
// Returns a single risk with its mitigation actions.
//
// PATCH /api/operational-risk-register/[id]
// Admin only. Actions:
//   { action: "update_status", risk_status: string }
//   { action: "assign_owner", owner_role: string, owner_user_id?: string }
//   { action: "accept", resolution_note: string }
//   { action: "resolve", resolution_note: string }
//   { action: "close" }
//   { action: "update", ...fields }  — update any writable fields

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { RISK_AUDIT_ACTIONS } from "@/lib/operationalRisk";

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
    .from("operational_risk_register")
    .select(`*, mitigation_actions:risk_mitigation_actions(*)`)
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
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, ...rest } = body;

  // Fetch existing risk
  const { data: existing, error: fetchErr } = await svc
    .from("operational_risk_register")
    .select("id, risk_title, risk_reference, risk_status, risk_severity, job_reference, risk_category")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) return NextResponse.json({ error: "Risk not found" }, { status: 404 });

  const now = new Date().toISOString();
  let updates: Record<string, unknown> = { updated_at: now };
  let auditAction: string = RISK_AUDIT_ACTIONS.status_updated;
  let auditDescription = "";

  switch (action) {
    case "update_status": {
      const { risk_status } = rest as { risk_status: string };
      if (!risk_status) return NextResponse.json({ error: "risk_status required" }, { status: 400 });
      updates.risk_status = risk_status;
      auditDescription = `Risk status updated to ${risk_status} by ${caller.fullName} (${existing.risk_reference}).`;
      break;
    }
    case "assign_owner": {
      const { owner_role, owner_user_id } = rest as { owner_role?: string; owner_user_id?: string };
      if (owner_role) updates.owner_role = owner_role;
      if (owner_user_id) updates.owner_user_id = owner_user_id;
      updates.risk_status = "In Review";
      auditDescription = `Risk owner assigned to ${owner_role ?? "admin"} by ${caller.fullName} (${existing.risk_reference}).`;
      break;
    }
    case "accept": {
      const { resolution_note } = rest as { resolution_note?: string };
      if (!resolution_note || resolution_note.trim().length < 5) {
        return NextResponse.json(
          { error: "resolution_note is required and must be at least 5 characters when accepting a risk" },
          { status: 400 },
        );
      }
      updates.risk_status     = "Accepted";
      updates.resolution_note = resolution_note.trim();
      updates.resolved_at     = now;
      auditAction     = RISK_AUDIT_ACTIONS.risk_accepted;
      auditDescription = `Risk accepted by ${caller.fullName} (${existing.risk_reference}): ${resolution_note.trim()}`;
      break;
    }
    case "resolve": {
      const { resolution_note } = rest as { resolution_note?: string };
      if (!resolution_note || resolution_note.trim().length < 5) {
        return NextResponse.json(
          { error: "resolution_note is required when resolving a risk" },
          { status: 400 },
        );
      }
      updates.risk_status     = "Resolved";
      updates.resolution_note = resolution_note.trim();
      updates.resolved_at     = now;
      auditAction     = RISK_AUDIT_ACTIONS.risk_resolved;
      auditDescription = `Risk resolved by ${caller.fullName} (${existing.risk_reference}): ${resolution_note.trim()}`;
      break;
    }
    case "close": {
      updates.risk_status = "Closed";
      auditAction     = RISK_AUDIT_ACTIONS.risk_closed;
      auditDescription = `Risk closed by ${caller.fullName} (${existing.risk_reference}).`;
      break;
    }
    case "update": {
      // Generic field update — allow updating writable fields
      const allowed = [
        "risk_title", "risk_description", "risk_category", "risk_severity",
        "likelihood", "impact", "root_cause", "mitigation_plan",
        "owner_role", "owner_user_id", "due_date", "risk_status",
      ];
      for (const key of allowed) {
        if (key in rest) updates[key] = rest[key];
      }
      auditDescription = `Risk updated by ${caller.fullName} (${existing.risk_reference}): fields [${Object.keys(updates).filter(k => k !== "updated_at").join(", ")}].`;
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown action: String(action)` }, { status: 400 });
  }

  const { data, error } = await svc
    .from("operational_risk_register")
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
      risk_id:        id,
      risk_reference: existing.risk_reference,
      risk_category:  existing.risk_category,
      previous_status: existing.risk_status,
      new_action:     action,
    },
  }).catch(() => {});

  return NextResponse.json({ data });
}
