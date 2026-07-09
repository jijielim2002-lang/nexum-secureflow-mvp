// ─── POST /api/fundraising-data-room/access-logs ────────────────────────────
// Admin only. Log an access / share event for a data room item.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name };
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { item_id, access_note, shared_with } = body as {
    item_id?: string;
    access_note?: string;
    shared_with?: string;
  };

  if (!item_id) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

  // Verify item exists
  const { data: item } = await svc
    .from("fundraising_data_room_items")
    .select("item_name")
    .eq("id", item_id)
    .single();

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("fundraising_data_room_access_logs")
    .insert({
      item_id,
      accessed_by_user_id: caller.userId,
      accessed_by_name:    caller.fullName,
      accessed_at:         now,
      access_note:         access_note ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const isShare = !!(shared_with || (access_note ?? "").toLowerCase().includes("shar"));
  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        isShare ? "data_room_item_shared" : "data_room_item_viewed",
    description:   `Data room item "${item?.item_name ?? item_id}" ${isShare ? "shared" : "accessed"} by ${caller.fullName}${shared_with ? ` with ${shared_with}` : ""}.`,
    metadata:      { item_id, item_name: item?.item_name, shared_with, access_note },
  }).catch(() => {});

  return NextResponse.json({ data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("item_id");
  const limit  = parseInt(searchParams.get("limit") ?? "100", 10);

  let query = svc
    .from("fundraising_data_room_access_logs")
    .select("*")
    .order("accessed_at", { ascending: false })
    .limit(limit);

  if (itemId) query = query.eq("item_id", itemId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
