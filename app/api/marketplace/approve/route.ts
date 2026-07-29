// POST /api/marketplace/approve
// Admin approves or rejects a service listing
// Body: { listing_reference, action: "approve" | "reject", admin_notes?, rejection_reason?, commission_rate? }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPA_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function admin() {
  return createClient(SUPA_URL, SUPA_SVC, { auth: { persistSession: false } });
}

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "").trim() ?? "";
  if (!token) return null;
  const anon = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await admin()
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return null;
  return { ...profile, userId: user.id };
}

export async function POST(req: NextRequest) {
  const adminProfile = await verifyAdmin(req);
  if (!adminProfile) return NextResponse.json({ ok: false, error: "Unauthorized — admin only" }, { status: 403 });

  const body = await req.json() as {
    listing_reference: string;
    action: "approve" | "reject" | "suspend";
    admin_notes?: string;
    rejection_reason?: string;
    commission_rate?: number;
  };

  if (!body.listing_reference || !body.action) {
    return NextResponse.json({ ok: false, error: "listing_reference and action are required" }, { status: 400 });
  }

  const db = admin();
  const update: Record<string, unknown> = {
    admin_notes: body.admin_notes ?? null,
  };

  if (body.action === "approve") {
    update.listing_status   = "Approved";
    update.approved_by      = adminProfile.userId;
    update.approved_at      = new Date().toISOString();
    update.rejection_reason = null;
    if (body.commission_rate != null) update.commission_rate = body.commission_rate;
  } else if (body.action === "reject") {
    update.listing_status   = "Rejected";
    update.rejection_reason = body.rejection_reason ?? null;
    update.approved_by      = null;
    update.approved_at      = null;
  } else if (body.action === "suspend") {
    update.listing_status   = "Suspended";
    update.is_active        = false;
  } else {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  const { error } = await db
    .from("service_listings")
    .update(update)
    .eq("listing_reference", body.listing_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: body.action });
}
