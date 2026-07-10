import { supabase } from "./supabaseClient";
import { insertAuditLog } from "./auditLog";
import { EXTRACTABLE_TYPES } from "./documentExtraction";

export interface UploadDocumentArgs {
  job_reference:    string;
  uploaded_by_role: string;
  uploaded_by_name: string;
  document_type:    string;
  file:             File;
  remarks?:         string;
}

export async function uploadJobDocument(
  args: UploadDocumentArgs,
): Promise<{ filePath?: string; documentId?: string; error?: string }> {
  const timestamp = Date.now();
  const safeName  = args.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const typeSlug  = args.document_type.replace(/\s+/g, "_");
  const filePath  = `${args.job_reference}/${typeSlug}/${timestamp}-${safeName}`;

  // 1. Upload to Storage
  const { error: storageErr } = await supabase.storage
    .from("job-documents")
    .upload(filePath, args.file, { upsert: false });

  if (storageErr) return { error: storageErr.message };

  // 2. Insert document record — select id back so we can create the extraction row
  const { data: docData, error: dbErr } = await supabase
    .from("documents")
    .insert({
      job_reference:    args.job_reference,
      uploaded_by_role: args.uploaded_by_role,
      uploaded_by_name: args.uploaded_by_name,
      document_type:    args.document_type,
      file_name:        args.file.name,
      file_path:        filePath,
      file_size:        args.file.size,
      mime_type:        args.file.type || null,
      remarks:          args.remarks ?? null,
    })
    .select("id")
    .single();

  if (dbErr) return { error: dbErr.message };

  const documentId = (docData as { id: string }).id;
  const now = new Date().toISOString();

  // 3. Create document_extractions row (Pending) — fire-and-forget, non-blocking
  supabase
    .from("document_extractions")
    .insert({
      job_reference:     args.job_reference,
      document_id:       documentId,
      document_type:     args.document_type,
      extraction_status: "Pending",
      created_at:        now,
      updated_at:        now,
    })
    .then(({ error }) => {
      if (error) console.warn("[documents] extraction row create failed:", error.message);
    });

  // 4. Audit log
  await insertAuditLog({
    job_reference: args.job_reference,
    actor_role:    args.uploaded_by_role,
    actor_name:    args.uploaded_by_name,
    action:        "document_uploaded",
    description:   `${args.uploaded_by_name} uploaded ${args.document_type}: ${args.file.name}`,
    metadata: {
      document_type:  args.document_type,
      file_name:      args.file.name,
      file_size:      args.file.size,
      file_path:      filePath,
      extraction_queued: EXTRACTABLE_TYPES.has(args.document_type),
    },
  });

  return { filePath, documentId };
}

export async function getDocumentSignedUrl(filePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("job-documents")
    .createSignedUrl(filePath, 3600);
  return data?.signedUrl ?? null;
}
