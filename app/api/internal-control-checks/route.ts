// ─── GET /api/internal-control-checks ────────────────────────────────────────
// Query params:
//   ?job_reference=xxx
//   ?procurement_reference=xxx
//   ?workflow_area=Release Approval
//   ?status=Failed
//   (admin, no filter) → all checks with Failed/Warning/Overridden, max 300

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobRef    = searchParams.get("job_reference");
  const procRef   = searchParams.get("procurement_reference");
  const area      = searchParams.get("workflow_area");
  const status    = searchParams.get("status");

  const isAdmin = caller.role === "admin";

  let query = svc
    .from("internal_control_checks")
    .select(`*, control_rule:internal_control_rules(id, control_name, workflow_area, required_evidence, maker_role, checker_role, approver_role, requires_dual_approval, same_user_restricted, requires_compliance_check, requires_reconciliation, control_note)`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (jobRef)  query = query.eq("job_reference", jobRef);
  if (procRef) query = query.eq("procurement_reference", procRef);
  if (area)    query = query.eq("workflow_area", area);
  if (status)  query = query.eq("check_status", status);

  // Non-admin: restrict to active/failed/warning only (no sensitive override data)
  if (!isAdmin && !status) {
    query = query.in("check_status", ["Passed", "Failed", "Warning"]);
  }

  // Admin with no job/proc filter: show non-passed checks only
  if (isAdmin && !jobRef && !procRef && !status) {
    query = query.in("check_status", ["Failed", "Warning", "Overridden"]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
