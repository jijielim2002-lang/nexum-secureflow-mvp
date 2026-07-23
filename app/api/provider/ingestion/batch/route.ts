// ─── /api/provider/ingestion/batch ───────────────────────────────────────────
// GET  ?batch_reference=ING-xxx  → fetch batch + files + fields
// POST { provider_type, provider_company_id } → create new batch

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyToken(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  // Role check: only service_provider or admin may use ingestion routes
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["service_provider", "admin"].includes(profile.role as string)) return null;
  return user;
}

function randomAlphaNum(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateBatchReference(): string {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  return `ING-${y}${m}${d}-${randomAlphaNum(6)}`;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const batchRef = req.nextUrl.searchParams.get("batch_reference");
  if (!batchRef) return NextResponse.json({ error: "batch_reference required" }, { status: 400 });

  const admin = adminClient();

  const { data: batch, error: batchErr } = await admin
    .from("document_ingestion_batches")
    .select("*")
    .eq("batch_reference", batchRef)
    .single();

  if (batchErr || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { data: files, error: filesErr } = await admin
    .from("document_ingestion_files")
    .select("*")
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true });

  if (filesErr) {
    return NextResponse.json({ error: filesErr.message }, { status: 500 });
  }

  const { data: fields, error: fieldsErr } = await admin
    .from("document_ingestion_extracted_fields")
    .select("*")
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true });

  if (fieldsErr) {
    return NextResponse.json({ error: fieldsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, batch, files: files ?? [], fields: fields ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { provider_type?: string; provider_company_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { provider_type, provider_company_id } = body;
  if (!provider_type) {
    return NextResponse.json({ error: "provider_type required" }, { status: 400 });
  }

  const batch_reference = generateBatchReference();
  const admin = adminClient();

  // Auto-resolve provider_company_id from user's profile if not explicitly provided
  let resolvedProviderCompanyId = provider_company_id ?? null;
  if (!resolvedProviderCompanyId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.company_id && profile.role === "service_provider") {
      resolvedProviderCompanyId = profile.company_id;
    }
  }

  const { data, error } = await admin
    .from("document_ingestion_batches")
    .insert({
      batch_reference,
      provider_company_id: resolvedProviderCompanyId,
      created_by: user.id,
      provider_type,
      ingestion_status: "Draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, batch_reference")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, batch_reference: data.batch_reference, batch_id: data.id });
}
