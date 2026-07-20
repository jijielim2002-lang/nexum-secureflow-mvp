// ─── /api/provider/ingestion/upload ──────────────────────────────────────────
// POST { batch_id, document_type, file_name, mime_type, file_size_bytes }
//      → create signed upload URL, insert file record
// PUT  { file_id }
//      → mark upload complete, bump batch status to 'Documents Uploaded'

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

// ── POST — create signed upload URL ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    batch_id?: string;
    document_type?: string;
    file_name?: string;
    mime_type?: string;
    file_size_bytes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { batch_id, document_type, file_name, mime_type, file_size_bytes } = body;
  if (!batch_id || !document_type || !file_name) {
    return NextResponse.json(
      { error: "batch_id, document_type, and file_name are required" },
      { status: 400 }
    );
  }

  const safeDoctType = document_type.replace(/\s+/g, "-");
  const storage_path = `ingestion/${batch_id}/${safeDoctType}/${Date.now()}-${file_name}`;

  const admin = adminClient();

  const { data: signedData, error: signedErr } = await admin.storage
    .from("job-documents")
    .createSignedUploadUrl(storage_path);

  if (signedErr || !signedData) {
    return NextResponse.json(
      { error: signedErr?.message ?? "Failed to create signed upload URL" },
      { status: 500 }
    );
  }

  const { data: fileRecord, error: fileErr } = await admin
    .from("document_ingestion_files")
    .insert({
      batch_id,
      document_type,
      file_name,
      storage_bucket: "job-documents",
      storage_path,
      mime_type: mime_type ?? null,
      file_size_bytes: file_size_bytes ?? null,
      upload_status: "Pending",
      extraction_status: "Not Started",
      extracted_data: {},
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (fileErr || !fileRecord) {
    return NextResponse.json(
      { error: fileErr?.message ?? "Failed to insert file record" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    signed_url: signedData.signedUrl,
    token: signedData.token,
    file_id: fileRecord.id,
    storage_path,
  });
}

// ── PUT — mark upload complete ────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { file_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { file_id } = body;
  if (!file_id) return NextResponse.json({ error: "file_id required" }, { status: 400 });

  const admin = adminClient();

  // Update file upload status
  const { data: fileRecord, error: fileErr } = await admin
    .from("document_ingestion_files")
    .update({ upload_status: "Uploaded" })
    .eq("id", file_id)
    .select("batch_id")
    .single();

  if (fileErr || !fileRecord) {
    return NextResponse.json(
      { error: fileErr?.message ?? "File not found" },
      { status: 500 }
    );
  }

  // Bump batch status if still Draft
  const { data: batch } = await admin
    .from("document_ingestion_batches")
    .select("id, ingestion_status")
    .eq("id", fileRecord.batch_id)
    .single();

  if (batch && batch.ingestion_status === "Draft") {
    await admin
      .from("document_ingestion_batches")
      .update({ ingestion_status: "Documents Uploaded", updated_at: new Date().toISOString() })
      .eq("id", batch.id);
  }

  return NextResponse.json({ ok: true });
}
