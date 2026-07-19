/**
 * /api/company/users
 *
 * GET    — list all company_user_roles for caller's company
 * POST   — invite a user to company (create role record with status=Pending)
 * PATCH  — update role or status (approve/suspend/remove)
 * DELETE — hard-delete a role record
 *
 * Authorization: Bearer <access_token>
 * Caller must have role = Company Admin AND status = Active in company_user_roles.
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

async function requireCompanyAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const db = svc();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;

  // Get profile for company_id
  const { data: profile } = await db
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) return null;

  // Platform admin can always manage
  if (profile.role === "admin") {
    return { userId: user.id, companyId: profile.company_id as string, isAdmin: true };
  }

  // Must be Company Admin in company_user_roles
  const { data: cur } = await db
    .from("company_user_roles")
    .select("role, status")
    .eq("user_id", user.id)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!cur || cur.role !== "Company Admin" || cur.status !== "Active") return null;
  return { userId: user.id, companyId: profile.company_id as string, isAdmin: false };
}

const VALID_ROLES    = ["Company Admin", "Finance", "User", "Operations", "Document Clerk", "Manager", "Viewer"];
const VALID_STATUSES = ["Pending", "Active", "Suspended", "Removed"];

export async function GET(req: NextRequest) {
  const caller = await requireCompanyAdmin(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const { data, error } = await db
    .from("company_user_roles")
    .select("id, user_id, email, role, status, invited_by, approved_by, approved_at, created_at, updated_at")
    .eq("company_id", caller.companyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, users: data ?? [] });
}

export async function POST(req: NextRequest) {
  const caller = await requireCompanyAdmin(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { email?: string; role?: string; user_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { email, role, user_id } = body;
  if (!email || !role) return NextResponse.json({ error: "email and role are required" }, { status: 400 });
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const db = svc();

  // Resolve user_id from email if not provided
  let resolvedUserId = user_id ?? null;
  if (!resolvedUserId) {
    const { data: authUsers } = await db.auth.admin.listUsers();
    const found = authUsers?.users?.find((u) => u.email === email);
    resolvedUserId = found?.id ?? null;
  }

  const { data, error } = await db
    .from("company_user_roles")
    .insert({
      company_id:  caller.companyId,
      user_id:     resolvedUserId,
      email,
      role,
      status:      "Pending",
      invited_by:  caller.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, record: data });
}

export async function PATCH(req: NextRequest) {
  const caller = await requireCompanyAdmin(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "?id= required" }, { status: 400 });

  let body: { role?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.role) {
    if (!VALID_ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    updates.role = body.role;
  }
  if (body.status) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    updates.status = body.status;
    if (body.status === "Active") {
      updates.approved_by = caller.userId;
      updates.approved_at = new Date().toISOString();
    }
  }

  const db = svc();
  const { data, error } = await db
    .from("company_user_roles")
    .update(updates)
    .eq("id", id)
    .eq("company_id", caller.companyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Record not found" }, { status: 404 });
  return NextResponse.json({ ok: true, record: data });
}

export async function DELETE(req: NextRequest) {
  const caller = await requireCompanyAdmin(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "?id= required" }, { status: 400 });

  const db = svc();
  const { error } = await db
    .from("company_user_roles")
    .delete()
    .eq("id", id)
    .eq("company_id", caller.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
