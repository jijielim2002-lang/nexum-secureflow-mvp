import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function svcClient() {
  if (!SB_URL || !SVC_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } },
  });
}

// ─── GET /api/jobs/[jobReference]/documents ───────────────────────────────────
// Returns: { documents, requirements, fields, extractionRuns, mismatchFlags }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await params;
  const svc = svcClient();

  const [docsResult, reqsResult] = await Promise.all([
    svc
      .from("job_documents")
      .select(`
        id, job_reference, company_id, document_type, document_label,
        storage_bucket, storage_path, file_name, file_size_bytes, mime_type,
        uploaded_by_user_id, uploaded_by_role, verification_status,
        verified_by_user_id, verified_at, rejection_reason,
        mismatch_flags, notes, is_evidence_pack_item, created_at, updated_at,
        llm_extraction_enabled, extraction_provider, extraction_model,
        extraction_confidence_score, extraction_review_required,
        extracted_at, extraction_warning
      `)
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    svc
      .from("job_document_requirements")
      .select("*")
      .eq("job_reference", jobReference),
  ]);

  const docIds = (docsResult.data ?? []).map((d: { id: string }) => d.id);
  let fields:         unknown[] = [];
  let extractionRuns: unknown[] = [];
  let mismatchFlags:  unknown[] = [];

  if (docIds.length > 0) {
    const [fieldsRes, runsRes, flagsRes] = await Promise.all([
      svc
        .from("job_document_extracted_fields")
        .select("id, job_document_id, field_key, field_label, field_value, field_value_numeric, field_value_date, extraction_method, confidence_score, is_verified, entered_by_role")
        .in("job_document_id", docIds)
        .order("field_key"),
      svc
        .from("document_extraction_runs")
        .select("id, job_document_id, provider, model_name, extraction_status, confidence_score, error_message, started_at, completed_at, created_at")
        .in("job_document_id", docIds)
        .order("created_at", { ascending: false }),
      svc
        .from("document_mismatch_flags")
        .select("id, job_document_id, mismatch_type, severity, expected_value, extracted_value, field_name, status, review_note, reviewed_at, created_at")
        .in("job_document_id", docIds)
        .order("created_at", { ascending: false }),
    ]);
    fields         = fieldsRes.data  ?? [];
    extractionRuns = runsRes.data    ?? [];
    mismatchFlags  = flagsRes.data   ?? [];
  }

  return NextResponse.json({
    documents:      docsResult.data ?? [],
    requirements:   reqsResult.data ?? [],
    fields,
    extractionRuns,
    mismatchFlags,
    error: docsResult.error?.message ?? reqsResult.error?.message ?? null,
  });
}

// ─── POST /api/jobs/[jobReference]/documents ──────────────────────────────────
// Registers document metadata after client-side storage upload.
// Body: { company_id, document_type, storage_path, file_name, file_size_bytes?,
//         mime_type?, document_label?, notes?, uploaded_by_user_id, uploaded_by_role, actor_name? }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await params;
  const body = await req.json();

  const {
    company_id,
    document_type,
    storage_path,
    file_name,
    file_size_bytes,
    mime_type,
    document_label,
    notes,
    uploaded_by_user_id,
    uploaded_by_role,
    actor_name,
  } = body;

  if (!company_id || !document_type || !storage_path || !file_name || !uploaded_by_role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const svc = svcClient();

  const { data: job, error: jobErr } = await svc
    .from("secured_jobs")
    .select("job_reference")
    .eq("job_reference", jobReference)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { data: doc, error: insertErr } = await svc
    .from("job_documents")
    .insert({
      job_reference:       jobReference,
      company_id,
      document_type,
      document_label:      document_label ?? null,
      storage_bucket:      "job-documents",
      storage_path,
      file_name,
      file_size_bytes:     file_size_bytes ?? null,
      mime_type:           mime_type ?? null,
      uploaded_by_user_id: uploaded_by_user_id ?? null,
      uploaded_by_role,
      verification_status: "pending",
      mismatch_flags:      [],
      notes:               notes ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !doc) {
    return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });
  }

  await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
    job_reference: jobReference,
    action:        "job_document_uploaded",
    actor_id:      uploaded_by_user_id ?? null,
    actor_role:    uploaded_by_role,
    actor_name:    actor_name ?? uploaded_by_role,
    description:   `Uploaded ${document_type} document: ${file_name}`,
    metadata:      { document_id: doc.id, document_type, file_name },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
