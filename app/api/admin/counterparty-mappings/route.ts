/**
 * /api/admin/counterparty-mappings
 *
 * GET    — list mappings (admin: all; company admin: own company only)
 * POST   — create mapping
 * PATCH  — update mapping (?id=)
 * DELETE — delete mapping (?id=)
 *
 * Authorization: Bearer <access_token>
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

type CallerCtx = { userId: string; companyId: string | null; isNexumAdmin: boolean };

async function getCaller(req: NextRequest): Promise<CallerCtx | null> {
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
  if (!profile) return null;
  return {
    userId:        user.id,
    companyId:     (profile.company_id as string | null) ?? null,
    isNexumAdmin:  profile.role === "admin",
  };
}

const VALID_RELATIONSHIPS = ["Supplier","Customer","Buyer","Service Provider","Broker","Consignee","Shipper","Other"];
const VALID_VISIBILITY    = ["Full","Masked","Hidden"];

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const { searchParams } = new URL(req.url);
  const ownerFilter = searchParams.get("owner_company_id");

  let query = db
    .from("counterparty_mappings")
    .select("id, real_company_id, owner_company_id, masked_code, masked_name, relationship_type, visibility_level, created_at")
    .order("created_at", { ascending: false });

  if (!caller.isNexumAdmin) {
    // Company admins can only see their own mappings
    if (!caller.companyId) return NextResponse.json({ error: "No company" }, { status: 403 });
    query = query.eq("owner_company_id", caller.companyId);
  } else if (ownerFilter) {
    query = query.eq("owner_company_id", ownerFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with real company names
  const companyIds = [...new Set([
    ...(data ?? []).map((r: { real_company_id: string }) => r.real_company_id),
    ...(data ?? []).map((r: { owner_company_id: string }) => r.owner_company_id),
  ])].filter(Boolean);

  const { data: companies } = await db
    .from("companies")
    .select("id, name")
    .in("id", companyIds);

  const nameMap: Record<string, string> = {};
  (companies ?? []).forEach((c: { id: string; name: string }) => { nameMap[c.id] = c.name; });

  const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    real_company_name:  nameMap[r.real_company_id as string]  ?? "Unknown",
    owner_company_name: nameMap[r.owner_company_id as string] ?? "Unknown",
  }));

  return NextResponse.json({ ok: true, mappings: enriched });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    real_company_id?:   string;
    owner_company_id?:  string;
    masked_code?:       string;
    masked_name?:       string;
    relationship_type?: string;
    visibility_level?:  string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { real_company_id, owner_company_id, masked_code, masked_name, relationship_type, visibility_level } = body;

  if (!real_company_id || !owner_company_id || !masked_code) {
    return NextResponse.json({ error: "real_company_id, owner_company_id, and masked_code are required" }, { status: 400 });
  }
  if (relationship_type && !VALID_RELATIONSHIPS.includes(relationship_type)) {
    return NextResponse.json({ error: "Invalid relationship_type" }, { status: 400 });
  }
  if (visibility_level && !VALID_VISIBILITY.includes(visibility_level)) {
    return NextResponse.json({ error: "Invalid visibility_level" }, { status: 400 });
  }

  // Non-admins can only create mappings for their own company
  if (!caller.isNexumAdmin && owner_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden — can only create mappings for your own company" }, { status: 403 });
  }

  const db = svc();
  const { data, error } = await db
    .from("counterparty_mappings")
    .insert({
      real_company_id,
      owner_company_id,
      masked_code,
      masked_name:       masked_name       ?? null,
      relationship_type: relationship_type ?? null,
      visibility_level:  visibility_level  ?? "Masked",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mapping: data });
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "?id= required" }, { status: 400 });

  let body: {
    masked_code?:       string;
    masked_name?:       string;
    relationship_type?: string;
    visibility_level?:  string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.relationship_type && !VALID_RELATIONSHIPS.includes(body.relationship_type)) {
    return NextResponse.json({ error: "Invalid relationship_type" }, { status: 400 });
  }
  if (body.visibility_level && !VALID_VISIBILITY.includes(body.visibility_level)) {
    return NextResponse.json({ error: "Invalid visibility_level" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.masked_code)       updates.masked_code       = body.masked_code;
  if (body.masked_name  !== undefined) updates.masked_name  = body.masked_name ?? null;
  if (body.relationship_type) updates.relationship_type = body.relationship_type;
  if (body.visibility_level)  updates.visibility_level  = body.visibility_level;

  const db = svc();
  let query = db
    .from("counterparty_mappings")
    .update(updates)
    .eq("id", id);

  if (!caller.isNexumAdmin && caller.companyId) {
    query = query.eq("owner_company_id", caller.companyId);
  }

  const { data, error } = await query.select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, mapping: data });
}

export async function DELETE(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "?id= required" }, { status: 400 });

  const db = svc();
  let query = db.from("counterparty_mappings").delete().eq("id", id);
  if (!caller.isNexumAdmin && caller.companyId) {
    query = query.eq("owner_company_id", caller.companyId);
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
