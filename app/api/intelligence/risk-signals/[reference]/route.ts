import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/risk-signals/[reference]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_risk_signals")
    .select("*")
    .eq("signal_reference", reference)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Company can only see their own signals
  if (!isAdmin(profile) && data.related_company_id !== profile.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(data);
}

// PATCH /api/intelligence/risk-signals/[reference]  (admin only — update status)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const allowed = ["status", "assigned_to", "resolved_by", "resolved_at", "description"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];
  if (body.status === "Resolved" || body.status === "Waived" || body.status === "False Positive") {
    update.resolved_at = update.resolved_at ?? new Date().toISOString();
    update.resolved_by = update.resolved_by ?? profile.userId;
  }

  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_risk_signals")
    .update(update)
    .eq("signal_reference", reference)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
