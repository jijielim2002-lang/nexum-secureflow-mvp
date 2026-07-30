import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/actions/[reference]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_recommended_actions")
    .select("*")
    .eq("action_reference", reference)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin(profile) && data.related_company_id !== profile.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(data);
}

// PATCH /api/intelligence/actions/[reference]  (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const allowed = ["action_status", "assigned_to", "completed_by", "completed_at", "action_reason"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];
  if (body.action_status === "Completed") {
    update.completed_at = update.completed_at ?? new Date().toISOString();
    update.completed_by = update.completed_by ?? profile.userId;
  }

  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_recommended_actions")
    .update(update)
    .eq("action_reference", reference)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
