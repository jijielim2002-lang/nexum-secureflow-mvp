import { NextRequest, NextResponse } from "next/server";
import { adminClient, verifyAuth, isAdmin } from "@/lib/apiAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth(req);
  if (!auth || !isAdmin(auth)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const update: Record<string, unknown> = {};
  const allowed = ["approval_status","review_note"];
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];
  update.reviewed_by = auth.userId;
  update.reviewed_at = new Date().toISOString();
  const { data, error } = await adminClient()
    .from("console_supplier_vehicles")
    .update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, vehicle: data });
}
