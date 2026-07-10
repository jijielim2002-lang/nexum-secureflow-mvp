import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

// ─── GET /api/system-settings ─────────────────────────────────────────────────
// Returns all settings as {key: value} map. Admin-only.

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();
    const { data, error } = await svc
      .from("system_settings")
      .select("key, value, description, updated_at")
      .order("key");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const settings: Record<string, string> = {};
    for (const row of data ?? []) settings[row.key] = row.value;

    return NextResponse.json({ settings, rows: data });
  } catch (err) {
    console.error("[system-settings GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/system-settings ──────────────────────────────────────────────
// Update a single setting. Admin-only. Writes audit log.

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: { key: string; value: string } = await req.json();

    const ALLOWED_KEYS = [
      "deployment_environment",
      "live_customer_enabled",
      "live_payment_enabled",
      "live_release_enabled",
    ];

    if (!body.key || body.value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }
    if (!ALLOWED_KEYS.includes(body.key)) {
      return NextResponse.json({ error: `Unknown setting: ${body.key}` }, { status: 400 });
    }

    // Validate boolean settings
    if (body.key !== "deployment_environment") {
      if (body.value !== "true" && body.value !== "false") {
        return NextResponse.json({ error: "Boolean setting must be 'true' or 'false'" }, { status: 400 });
      }
    } else {
      if (!["Local","Staging","Production"].includes(body.value)) {
        return NextResponse.json({ error: "deployment_environment must be Local, Staging, or Production" }, { status: 400 });
      }
    }

    const svc = getSvc();
    const { data, error } = await svc
      .from("system_settings")
      .update({ value: body.value, updated_by: actor.userId, updated_at: new Date().toISOString() })
      .eq("key", body.key)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit event
    const auditMap: Record<string, string> = {
      deployment_environment: "deployment_environment_changed",
      live_customer_enabled:  "live_customer_enabled",
      live_payment_enabled:   "live_payment_enabled",
      live_release_enabled:   "live_release_enabled",
    };

    await svc.from("audit_logs").insert({
      event_type: auditMap[body.key] ?? "deployment_environment_changed",
      actor_id:   actor.userId,
      details:    { setting_key: body.key, new_value: body.value },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ setting: data });
  } catch (err) {
    console.error("[system-settings PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
