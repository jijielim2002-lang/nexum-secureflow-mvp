/**
 * /api/admin/platform-settings
 *
 * GET           — list all settings (any Nexum staff)
 * GET ?key=     — get a single setting value
 * PATCH         — update one or more settings (super_admin only)
 *
 * Body for PATCH: { updates: { [key]: string }[] }
 *
 * Authorization: Bearer <access_token>
 */

import { NextRequest, NextResponse } from "next/server";
import { getCaller, adminClient } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!caller.nexumRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db  = adminClient();
  const key = new URL(req.url).searchParams.get("key");

  if (key) {
    const { data, error } = await db
      .from("platform_settings")
      .select("key, value, value_type, description, category, updated_at")
      .eq("key", key)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json({ error: "Setting not found" }, { status: 404 });
    return NextResponse.json({ data });
  }

  const { data, error } = await db
    .from("platform_settings")
    .select("key, value, value_type, description, category, updated_at")
    .order("category")
    .order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.nexumRole !== "super_admin") {
    return NextResponse.json({ error: "Only super_admin can update platform settings" }, { status: 403 });
  }

  let body: { updates: Record<string, string> };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.updates || typeof body.updates !== "object") {
    return NextResponse.json({ error: "updates object required" }, { status: 400 });
  }

  const db  = adminClient();
  const now = new Date().toISOString();
  const entries = Object.entries(body.updates);
  if (entries.length === 0) return NextResponse.json({ success: true, updated: [] });

  const errors: string[] = [];
  const updated: string[] = [];

  for (const [key, value] of entries) {
    const { error } = await db
      .from("platform_settings")
      .update({ value: String(value), updated_by: caller.userId, updated_at: now })
      .eq("key", key);
    if (error) errors.push(`${key}: ${error.message}`);
    else updated.push(key);
  }

  if (errors.length > 0 && updated.length === 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  // Re-fetch all settings to return fresh state
  const { data } = await db
    .from("platform_settings")
    .select("key, value, value_type, description, category, updated_at")
    .order("category").order("key");

  return NextResponse.json({
    success: true,
    updated,
    errors: errors.length ? errors : undefined,
    data: data ?? [],
  });
}
