import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const { data, error } = await db.from("console_warehouses").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const db = adminClient();
  const { data, error } = await db.from("console_warehouses").update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
