import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/entities/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = adminClient();
  const { data: entity, error } = await db
    .from("nexum_entities")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch outgoing and incoming links
  const [{ data: outLinks }, { data: inLinks }] = await Promise.all([
    db.from("nexum_entity_links")
      .select("*, to_entity:nexum_entities!to_entity_id(id, entity_type, canonical_name)")
      .eq("from_entity_id", id),
    db.from("nexum_entity_links")
      .select("*, from_entity:nexum_entities!from_entity_id(id, entity_type, canonical_name)")
      .eq("to_entity_id", id),
  ]);

  return NextResponse.json({ entity, outgoing_links: outLinks ?? [], incoming_links: inLinks ?? [] });
}

// PATCH /api/intelligence/entities/[id]  (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const allowed = ["canonical_name", "normalized_key", "metadata"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

  const db = adminClient();
  const { data, error } = await db
    .from("nexum_entities")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
