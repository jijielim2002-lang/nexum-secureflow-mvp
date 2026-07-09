// ─── GET   /api/membership-plans/[id] — single plan
// ─── PATCH /api/membership-plans/[id] — update plan (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { PLAN_AUDIT_ACTIONS, PLAN_EDITABLE_FIELDS } from "@/lib/membershipPlan";

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

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc.from("membership_plans").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Non-admins only see Active plans
  if (caller.role !== "admin" && data.plan_status !== "Active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const allowed: Record<string, unknown> = {};
  for (const f of PLAN_EDITABLE_FIELDS) {
    if (f in body) allowed[f] = body[f];
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // Fetch current to determine audit action
  const { data: current } = await svc
    .from("membership_plans")
    .select("plan_name, plan_status")
    .eq("id", id)
    .maybeSingle();

  const { data: updated, error } = await svc
    .from("membership_plans")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Determine audit action
  let auditAction: string = PLAN_AUDIT_ACTIONS.updated;
  if ("plan_status" in allowed) {
    if (allowed.plan_status === "Active"   && current?.plan_status !== "Active")   auditAction = PLAN_AUDIT_ACTIONS.activated;
    if (allowed.plan_status === "Inactive" && current?.plan_status !== "Inactive") auditAction = PLAN_AUDIT_ACTIONS.deactivated;
  }

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role: caller.role, actor_name: caller.fullName,
    action: auditAction,
    description: `Membership plan "${current?.plan_name ?? id}" ${auditAction.replace("membership_plan_", "")} by ${caller.fullName}. Fields: ${Object.keys(allowed).join(", ")}.`,
  }).catch(() => {});

  return NextResponse.json({ data: updated });
}
