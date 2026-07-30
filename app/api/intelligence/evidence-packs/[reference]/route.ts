import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/evidence-packs/[reference]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("evidence_packs")
    .select("*")
    .eq("evidence_pack_reference", reference)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin(profile) && data.related_company_id !== profile.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Log access per Part J privacy rules
  await db.from("intelligence_access_log").insert({
    viewer_id:   profile.userId,
    target_type: "evidence_pack",
    target_id:   reference,
    access_type: "view",
  });

  return NextResponse.json(data);
}

// PATCH /api/intelligence/evidence-packs/[reference]  (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const allowed = ["report_status", "report_data"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

  const db = adminClient();
  const { data, error } = await db
    .from("evidence_packs")
    .update(update)
    .eq("evidence_pack_reference", reference)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
