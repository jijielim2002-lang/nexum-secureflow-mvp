// ─── GET /api/fundraising-data-room ──────────────────────────────────────────
// Admin only. List all data room items with optional filters.
//
// POST /api/fundraising-data-room
// Admin only. Create a new data room item.

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

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const category  = searchParams.get("category");
  const status    = searchParams.get("status");
  const itemType  = searchParams.get("item_type");
  const limit     = parseInt(searchParams.get("limit") ?? "200", 10);

  let query = svc
    .from("fundraising_data_room_items")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (category)  query = query.eq("item_category", category);
  if (status)    query = query.eq("item_status", status);
  if (itemType)  query = query.eq("item_type", itemType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    item_name, item_category, item_type, item_status,
    source_type, source_id, source_url,
    item_description, notes,
    next_review_date, is_confidential,
  } = body as {
    item_name?: string;
    item_category?: string;
    item_type?: string;
    item_status?: string;
    source_type?: string;
    source_id?: string;
    source_url?: string;
    item_description?: string;
    notes?: string;
    next_review_date?: string;
    is_confidential?: boolean;
  };

  if (!item_name?.trim()) {
    return NextResponse.json({ error: "item_name is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("fundraising_data_room_items")
    .insert({
      item_name:         item_name.trim(),
      item_category:     item_category   ?? "General",
      item_type:         item_type       ?? "document",
      item_status:       item_status     ?? "Draft",
      source_type:       source_type     ?? "manual",
      source_id:         source_id       ?? null,
      source_url:        source_url      ?? null,
      item_description:  item_description ?? null,
      notes:             notes            ?? null,
      prepared_by_user_id: caller.userId,
      prepared_by_name:    caller.fullName,
      next_review_date:  next_review_date ?? null,
      is_confidential:   is_confidential  ?? false,
      created_at:        now,
      updated_at:        now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        "data_room_item_created",
    description:   `Data room item "${item_name}" created by ${caller.fullName} (category: ${item_category ?? "General"}, type: ${item_type ?? "document"}).`,
    metadata:      { item_name, item_category, item_type, source_type },
  }).catch(() => {});

  return NextResponse.json({ data }, { status: 201 });
}
