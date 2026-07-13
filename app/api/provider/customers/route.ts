import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } }
  );
}

async function requireProvider(req: NextRequest): Promise<{ userId: string; companyId: string } | null> {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const db = svc();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "service_provider" || !profile.company_id) return null;
  return { userId: user.id, companyId: profile.company_id as string };
}

// GET /api/provider/customers
export async function GET(req: NextRequest) {
  const caller = await requireProvider(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const { data, error } = await db
    .from("provider_customers")
    .select("id, customer_company, contact_name, email, phone, address, created_at")
    .eq("provider_company_id", caller.companyId)
    .order("customer_company", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, customers: data ?? [] });
}

// POST /api/provider/customers
export async function POST(req: NextRequest) {
  const caller = await requireProvider(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    customer_company: string;
    contact_name: string;
    email?: string;
    phone?: string;
    address?: string;
  };

  if (!body.customer_company?.trim() || !body.contact_name?.trim()) {
    return NextResponse.json({ error: "customer_company and contact_name are required" }, { status: 400 });
  }

  const db = svc();
  const { data, error } = await db
    .from("provider_customers")
    .insert({
      provider_company_id: caller.companyId,
      created_by: caller.userId,
      customer_company: body.customer_company.trim(),
      contact_name: body.contact_name.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
    })
    .select("id, customer_company, contact_name, email, phone, address, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, customer: data });
}

// PATCH /api/provider/customers?id=
export async function PATCH(req: NextRequest) {
  const caller = await requireProvider(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json() as Record<string, string>;
  const allowed = ["customer_company", "contact_name", "email", "phone", "address"];
  const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]?.trim() || null;
  }

  const db = svc();
  const { error } = await db
    .from("provider_customers")
    .update(updates)
    .eq("id", id)
    .eq("provider_company_id", caller.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/provider/customers?id=
export async function DELETE(req: NextRequest) {
  const caller = await requireProvider(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = svc();
  const { error } = await db
    .from("provider_customers")
    .delete()
    .eq("id", id)
    .eq("provider_company_id", caller.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
