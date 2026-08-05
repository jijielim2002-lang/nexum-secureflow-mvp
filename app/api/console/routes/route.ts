import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  let q = db.from("console_routes")
    .select("*, origin_wh:console_warehouses!origin_warehouse_id(warehouse_name,city), dest_wh:console_warehouses!destination_warehouse_id(warehouse_name,city)")
    .order("route_code");
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const db = adminClient();
  const { data, error } = await db.from("console_routes").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
