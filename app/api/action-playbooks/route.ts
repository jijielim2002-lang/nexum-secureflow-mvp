// ─── GET /api/action-playbooks ────────────────────────────────────────────────
// Returns all active playbooks (authenticated users only).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const triggerType = searchParams.get("trigger_type");
  const activeOnly  = searchParams.get("active") !== "false";

  let query = svc.from("action_playbooks").select("*").order("priority", { ascending: false });
  if (activeOnly) query = query.eq("is_active", true);
  if (triggerType) query = query.eq("trigger_type", triggerType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
