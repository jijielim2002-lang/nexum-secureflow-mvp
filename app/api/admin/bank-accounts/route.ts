import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
}

// ─── Verify caller is admin ───────────────────────────────────────────────────
async function requireAdmin(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return "Unauthorized";

  const db = svc();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return "Unauthorized";

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role !== "admin") return "Forbidden";
  return null;
}

// ─── GET /api/admin/bank-accounts ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: authErr === "Unauthorized" ? 401 : 403 });

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active_only") === "true";

  const db = svc();
  let query = db
    .from("platform_bank_accounts")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (activeOnly) query = query.eq("status", "Active");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, accounts: data });
}

// ─── POST /api/admin/bank-accounts ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: authErr === "Unauthorized" ? 401 : 403 });

  const body = await req.json();
  const {
    account_holder_name,
    bank_name,
    account_number,
    swift_code,
    currency = "MYR",
    account_type = "Current",
    status = "Active",
    is_default = false,
    payment_instruction_note,
  } = body;

  if (!account_holder_name || !bank_name || !account_number) {
    return NextResponse.json({ error: "account_holder_name, bank_name, account_number are required" }, { status: 400 });
  }

  const db = svc();

  // If setting as default, unset any existing default for that currency
  if (is_default) {
    await db
      .from("platform_bank_accounts")
      .update({ is_default: false })
      .eq("currency", currency)
      .eq("is_default", true);
  }

  const { data, error } = await db
    .from("platform_bank_accounts")
    .insert({
      account_holder_name,
      bank_name,
      account_number,
      swift_code: swift_code || null,
      currency,
      account_type,
      status,
      is_default,
      payment_instruction_note: payment_instruction_note || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, account: data }, { status: 201 });
}

// ─── PATCH /api/admin/bank-accounts?id=xxx ───────────────────────────────────
export async function PATCH(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: authErr === "Unauthorized" ? 401 : 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const body = await req.json();
  const db = svc();

  // If setting as default, unset others first
  if (body.is_default === true && body.currency) {
    await db
      .from("platform_bank_accounts")
      .update({ is_default: false })
      .eq("currency", body.currency)
      .eq("is_default", true)
      .neq("id", id);
  }

  const { data, error } = await db
    .from("platform_bank_accounts")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, account: data });
}

// ─── DELETE /api/admin/bank-accounts?id=xxx ──────────────────────────────────
export async function DELETE(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return NextResponse.json({ error: authErr }, { status: authErr === "Unauthorized" ? 401 : 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = svc();
  const { error } = await db.from("platform_bank_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
