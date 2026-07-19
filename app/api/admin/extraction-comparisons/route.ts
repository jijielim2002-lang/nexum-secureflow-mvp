/**
 * /api/admin/extraction-comparisons
 *
 * GET   — list all comparison records (admin only)
 * PATCH — mark final_review_status + review_note (?id=)
 *
 * Authorization: Bearer <access_token>  (must be admin role)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const db = svc();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

const VALID_REVIEW_STATUSES = ["Pending", "Accepted", "Corrected", "Rejected"];

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = db
    .from("document_extraction_comparisons")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("comparison_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, comparisons: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "?id= required" }, { status: 400 });

  let body: { final_review_status?: string; review_note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.final_review_status) return NextResponse.json({ error: "final_review_status required" }, { status: 400 });
  if (!VALID_REVIEW_STATUSES.includes(body.final_review_status)) {
    return NextResponse.json({ error: "Invalid final_review_status" }, { status: 400 });
  }

  const db = svc();
  const { data, error } = await db
    .from("document_extraction_comparisons")
    .update({
      final_review_status: body.final_review_status,
      review_note:         body.review_note ?? null,
      reviewed_by:         caller.userId,
      reviewed_at:         new Date().toISOString(),
      comparison_status:   "Reviewed",
      updated_at:          new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Record not found" }, { status: 404 });
  return NextResponse.json({ ok: true, record: data });
}
