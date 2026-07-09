// ─── GET /api/action-recommendations ─────────────────────────────────────────
// Query params:
//   ?job_reference=xxx
//   ?procurement_reference=xxx
//   ?status=Suggested
//   ?priority=Critical
//   ?assigned_role=admin
//   (no filter, admin) → all active (Suggested + Accepted + Task Created + Escalated, max 500)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobRef     = searchParams.get("job_reference");
  const procRef    = searchParams.get("procurement_reference");
  const status     = searchParams.get("status");
  const priority   = searchParams.get("priority");
  const assignedRole = searchParams.get("assigned_role");

  const isAdmin = caller.role === "admin";

  let query = svc
    .from("action_recommendations")
    .select(`*, playbook:action_playbooks(id, playbook_name, trigger_type, condition_key, escalation_note)`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (jobRef)    query = query.eq("job_reference", jobRef);
  if (procRef)   query = query.eq("procurement_reference", procRef);
  if (status)    query = query.eq("recommendation_status", status);
  if (priority)  query = query.eq("priority", priority);
  if (assignedRole) query = query.eq("assigned_role", assignedRole);

  // Non-admin: restrict to own role recommendations
  if (!isAdmin) {
    query = query.eq("assigned_role", caller.role);
    // Also restrict to active only
    if (!status) {
      query = query.in("recommendation_status", ["Suggested", "Accepted", "Task Created", "Escalated"]);
    }
  } else if (!status) {
    // Admin default: active only
    query = query.in("recommendation_status", ["Suggested", "Accepted", "Task Created", "Escalated"]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
