// ─── PATCH /api/compliance-wording-scan/[resultId] ───────────────────────────
// Update scan result status: reviewed, ignored, fixed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WORDING_AUDIT_ACTIONS } from "@/lib/complianceWording";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

type ScanAction = "reviewed" | "ignored" | "fixed";

const STATUS_MAP: Record<ScanAction, string> = {
  reviewed: "Reviewed",
  ignored:  "Ignored",
  fixed:    "Fixed",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  const { resultId } = await params;
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as ScanAction;
  const newStatus = STATUS_MAP[action];
  if (!newStatus) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await svc
    .from("compliance_wording_scan_results")
    .update({ status: newStatus, reviewed_by: adminId, reviewed_at: now })
    .eq("id", resultId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditAction = action === "fixed"
    ? WORDING_AUDIT_ACTIONS.issue_fixed
    : WORDING_AUDIT_ACTIONS.issue_reviewed;

  await svc.from("audit_logs").insert({
    actor_role:  "admin",
    actor_name:  (body.actorName as string | null) ?? "Nexum Admin",
    action:      auditAction,
    description: `Wording issue ${action}: "${data?.detected_wording}" in ${data?.source_type} (${data?.source_id?.slice(0, 8)}).`,
    created_at:  now,
  });

  return NextResponse.json({ success: true, data });
}
