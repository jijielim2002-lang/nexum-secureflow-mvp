// ─── GET /api/strategic-kpi-targets ──────────────────────────────────────────
// Admin only. List all strategic KPI targets with optional filters.
// Query params: category, status, priority, owner_role, limit
//
// POST /api/strategic-kpi-targets
// Admin only. Create a new strategic KPI target.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const KPI_AUDIT_ACTIONS = {
  kpi_target_created:      "kpi_target_created",
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

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const category  = searchParams.get("category");
  const status    = searchParams.get("status");
  const priority  = searchParams.get("priority");
  const ownerRole = searchParams.get("owner_role");
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  let query = svc
    .from("strategic_kpi_targets")
    .select(`*, milestones:strategic_milestones(*)`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (category)  query = query.eq("target_category", category);
  if (status)    query = query.eq("status", status);
  if (priority)  query = query.eq("priority", priority);
  if (ownerRole) query = query.eq("owner_role", ownerRole);

  const { data, error } = await query;
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
    target_name, target_category, metric_name,
    target_value, current_value = 0,
    unit, period_start, period_end,
    status = "Not Started", priority = "Medium",
    owner_role, owner_user_id, notes,
  } = body as {
    target_name?: string; target_category?: string; metric_name?: string;
    target_value?: number; current_value?: number;
    unit?: string; period_start?: string; period_end?: string;
    status?: string; priority?: string;
    owner_role?: string; owner_user_id?: string; notes?: string;
  };

  if (!target_name) return NextResponse.json({ error: "target_name is required" }, { status: 400 });
  if (target_value == null) return NextResponse.json({ error: "target_value is required" }, { status: 400 });

  const progress_percentage =
    target_value > 0 ? Math.min(100, ((current_value ?? 0) / target_value) * 100) : 0;

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("strategic_kpi_targets")
    .insert({
      target_name,
      target_category:    target_category ?? "Other",
      metric_name:        metric_name     ?? null,
      target_value,
      current_value:      current_value   ?? 0,
      unit:               unit            ?? null,
      period_start:       period_start    ?? null,
      period_end:         period_end      ?? null,
      status,
      priority,
      owner_role:         owner_role      ?? null,
      owner_user_id:      owner_user_id   ?? null,
      progress_percentage,
      notes:              notes           ?? null,
      created_at:         now,
      updated_at:         now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        KPI_AUDIT_ACTIONS.kpi_target_created,
    description:   `KPI target created by ${caller.fullName}: "${target_name}" — target ${target_value} ${unit ?? ""}. Category: ${target_category ?? "Other"}.`,
    metadata:      { target_name, target_category, target_value, priority },
  }).catch(() => {});

  return NextResponse.json({ data }, { status: 201 });
}
