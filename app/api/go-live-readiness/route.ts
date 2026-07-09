import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

// ─── Supabase service-role client ─────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth helper — admin only ─────────────────────────────────────────────────

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id, name: (profile.full_name as string) ?? "Admin" };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoLiveReadinessItem {
  id:              string;
  category:        string;
  item_name:       string;
  description:     string | null;
  status:          "Pending" | "In Progress" | "Passed" | "Failed" | "Not Applicable";
  priority:        "Low" | "Medium" | "High" | "Critical";
  owner_name:      string | null;
  evidence_note:   string | null;
  evidence_url:    string | null;
  last_checked_at: string | null;
  checked_by:      string | null;
  created_at:      string;
  updated_at:      string;
}

// ─── GET /api/go-live-readiness ───────────────────────────────────────────────
// ?category=X  &status=X  &priority=X

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();
    const p   = req.nextUrl.searchParams;

    let query = svc
      .from("go_live_readiness_items")
      .select("*", { count: "exact" })
      .order("category", { ascending: true })
      .order("priority", { ascending: false });

    if (p.get("category")) query = query.eq("category", p.get("category")!);
    if (p.get("status"))   query = query.eq("status",   p.get("status")!);
    if (p.get("priority")) query = query.eq("priority", p.get("priority")!);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[go-live-readiness GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/go-live-readiness ────────────────────────────────────────────
// Body: { id, status?, owner_name?, evidence_note?, evidence_url? }

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const ALLOWED_STATUSES = ["Pending", "In Progress", "Passed", "Failed", "Not Applicable"];
    if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }

    const svc  = getSvc();
    const now  = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };

    if (body.status        !== undefined) { patch.status   = body.status;   patch.last_checked_at = now; patch.checked_by = actor.userId; }
    if (body.owner_name    !== undefined) patch.owner_name    = body.owner_name;
    if (body.evidence_note !== undefined) patch.evidence_note = body.evidence_note;
    if (body.evidence_url  !== undefined) patch.evidence_url  = body.evidence_url;

    const { data, error } = await svc
      .from("go_live_readiness_items")
      .update(patch)
      .eq("id", body.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ item: data });
  } catch (err) {
    console.error("[go-live-readiness PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
