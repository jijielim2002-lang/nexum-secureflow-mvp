// ─── GET /api/fundraising-data-room/[id] ────────────────────────────────────
// Admin only. Get a single data room item.
//
// PATCH /api/fundraising-data-room/[id]
// Admin only. Update a data room item.

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await svc
    .from("fundraising_data_room_items")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Log access
  const now = new Date().toISOString();
  svc.from("fundraising_data_room_access_logs").insert({
    item_id:              id,
    accessed_by_user_id:  caller.userId,
    accessed_by_name:     caller.fullName,
    accessed_at:          now,
    access_note:          "Viewed via admin data room",
  }).then(() => {});

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        "data_room_item_viewed",
    description:   `Data room item "${data.item_name}" viewed by ${caller.fullName}.`,
    metadata:      { item_id: id, item_name: data.item_name },
  }).catch(() => {});

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Fetch existing
  const { data: existing, error: fetchErr } = await svc
    .from("fundraising_data_room_items")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    item_name, item_category, item_type, item_status,
    source_type, source_id, source_url,
    item_description, notes,
    last_reviewed_at, next_review_date, is_confidential,
    action,
  } = body as Record<string, unknown>;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (item_name        !== undefined) updates.item_name        = item_name;
  if (item_category    !== undefined) updates.item_category    = item_category;
  if (item_type        !== undefined) updates.item_type        = item_type;
  if (item_status      !== undefined) updates.item_status      = item_status;
  if (source_type      !== undefined) updates.source_type      = source_type;
  if (source_id        !== undefined) updates.source_id        = source_id;
  if (source_url       !== undefined) updates.source_url       = source_url;
  if (item_description !== undefined) updates.item_description = item_description;
  if (notes            !== undefined) updates.notes            = notes;
  if (next_review_date !== undefined) updates.next_review_date = next_review_date;
  if (is_confidential  !== undefined) updates.is_confidential  = is_confidential;

  // Special actions
  if (action === "mark_ready") {
    updates.item_status    = "Ready";
    updates.last_reviewed_at = now;
  } else if (action === "mark_needs_update") {
    updates.item_status    = "Needs Update";
  } else if (action === "archive") {
    updates.item_status    = "Archived";
  } else if (action === "mark_reviewed") {
    updates.last_reviewed_at = now;
    if (last_reviewed_at !== undefined) updates.last_reviewed_at = last_reviewed_at;
  }

  const { data, error } = await svc
    .from("fundraising_data_room_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditAction = action === "archive"
    ? "data_room_item_archived"
    : "data_room_item_updated";

  insertAuditLogWithClient(svc, {
    job_reference: "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description:   `Data room item "${existing.item_name}" updated by ${caller.fullName} → status: ${(updates.item_status as string | undefined) ?? existing.item_status}.`,
    metadata:      { item_id: id, item_name: existing.item_name, action, status: updates.item_status ?? existing.item_status },
  }).catch(() => {});

  return NextResponse.json({ data });
}
