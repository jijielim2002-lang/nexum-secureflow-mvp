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

// ─── PATCH /api/jobs/[jobReference]/documents/[documentId] ────────────────────
// Body: { action: 'verify'|'reject'|'update', actor_id?, actor_name?, ... }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobReference: string; documentId: string }> },
) {
  const { jobReference, documentId } = await params;
  const body = await req.json();

  const {
    action,
    actor_id,
    actor_name,
    rejection_reason,
    notes,
    is_evidence_pack_item,
    mismatch_flags,
  } = body;

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const svc = svcClient();

  const { data: current, error: fetchErr } = await svc
    .from("job_documents")
    .select("id, job_reference, document_type, file_name, verification_status")
    .eq("id", documentId)
    .eq("job_reference", jobReference)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (action === "verify") {
    patch.verification_status = "verified";
    patch.verified_by_user_id = actor_id ?? null;
    patch.verified_at         = new Date().toISOString();
    patch.rejection_reason    = null;
  } else if (action === "reject") {
    patch.verification_status = "rejected";
    patch.rejection_reason    = rejection_reason ?? "Rejected by admin";
  } else if (action === "update") {
    if (notes                 !== undefined) patch.notes                 = notes;
    if (is_evidence_pack_item !== undefined) patch.is_evidence_pack_item = is_evidence_pack_item;
    if (mismatch_flags        !== undefined) patch.mismatch_flags        = mismatch_flags;
  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await svc
    .from("job_documents")
    .update(patch)
    .eq("id", documentId)
    .select("id, verification_status, verified_at, rejection_reason, mismatch_flags, is_evidence_pack_item")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const auditAction =
    action === "verify" ? "job_document_verified" :
    action === "reject" ? "job_document_rejected" :
    "job_document_updated";

  const auditDesc =
    action === "verify" ? `Verified ${current.document_type} document: ${current.file_name}` :
    action === "reject" ? `Rejected ${current.document_type} document: ${current.file_name}` :
    `Updated ${current.document_type} document metadata`;

  await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
    job_reference: jobReference,
    action:        auditAction,
    actor_id:      actor_id   ?? null,
    actor_role:    "admin",
    actor_name:    actor_name ?? "Nexum Admin",
    description:   auditDesc,
    metadata:      {
      document_id:   documentId,
      document_type: current.document_type,
      file_name:     current.file_name,
      ...(action === "reject" ? { rejection_reason } : {}),
    },
  });

  return NextResponse.json({ document: updated });
}
