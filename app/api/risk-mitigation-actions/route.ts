// ─── GET /api/risk-mitigation-actions?risk_id=... ─────────────────────────────
// Returns mitigation actions for a risk. Admin only.
//
// POST /api/risk-mitigation-actions
// Admin only. Create a mitigation action and update risk status to Mitigation Active.

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

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const riskId = new URL(req.url).searchParams.get("risk_id");
  if (!riskId) return NextResponse.json({ error: "risk_id required" }, { status: 400 });

  const { data, error } = await svc
    .from("risk_mitigation_actions")
    .select("*")
    .eq("risk_id", riskId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    risk_id, action_title, action_description,
    assigned_role, assigned_user_id, due_at,
  } = body as {
    risk_id?: string; action_title?: string; action_description?: string;
    assigned_role?: string; assigned_user_id?: string; due_at?: string;
  };

  if (!risk_id)     return NextResponse.json({ error: "risk_id required" }, { status: 400 });
  if (!action_title) return NextResponse.json({ error: "action_title required" }, { status: 400 });

  // Fetch risk for context
  const { data: risk } = await svc
    .from("operational_risk_register")
    .select("id, risk_reference, risk_title, job_reference, risk_status")
    .eq("id", risk_id)
    .single();

  if (!risk) return NextResponse.json({ error: "Risk not found" }, { status: 404 });

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("risk_mitigation_actions")
    .insert({
      risk_id,
      action_title,
      action_description: action_description ?? null,
      assigned_role:      assigned_role ?? "admin",
      assigned_user_id:   assigned_user_id ?? null,
      status:             "Open",
      due_at:             due_at ?? null,
      created_at:         now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update risk status to Mitigation Active if currently Open or In Review
  if (["Open", "In Review"].includes(risk.risk_status as string)) {
    await svc
      .from("operational_risk_register")
      .update({ risk_status: "Mitigation Active", updated_at: now })
      .eq("id", risk_id);
  }

  insertAuditLogWithClient(svc, {
    job_reference: (risk.job_reference as string | null) ?? "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        RISK_AUDIT_ACTIONS.mitigation_created,
    description:   `Mitigation action created by ${caller.fullName} for risk ${risk.risk_reference}: ${action_title}`,
    metadata: { risk_id, risk_reference: risk.risk_reference, action_title },
  }).catch(() => {});

  return NextResponse.json({ data }, { status: 201 });
}
