import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/entities
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const entityType  = searchParams.get("entity_type");
  const sourceTable = searchParams.get("source_table");
  const search      = searchParams.get("search");
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const db = adminClient();
  let q = db
    .from("nexum_entities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityType)  q = q.eq("entity_type", entityType);
  if (sourceTable) q = q.eq("source_table", sourceTable);
  if (search)      q = q.ilike("canonical_name", `%${search}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/intelligence/entities  (admin only)
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { entity_type, source_table, source_id, canonical_name, normalized_key, metadata } = await req.json();
  if (!entity_type || !canonical_name) {
    return NextResponse.json({ error: "entity_type and canonical_name required" }, { status: 400 });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("nexum_entities")
    .insert({ entity_type, source_table, source_id, canonical_name, normalized_key, metadata: metadata ?? {} })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
