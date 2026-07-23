// ─── /api/provider/ingestion/extract ─────────────────────────────────────────
// POST { file_id, batch_id, force_ai? }
//      → Nexum Extraction Engine v1 (cost-controlled)
//      → Priority: local text → template regex → cheap LLM (text only)
//      → Full PDF never sent to AI by default
//      → Manual fallback if AI credits exhausted
//
// SECURITY: SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
// are server-side only — never returned to the browser.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { runExtractionEngine }       from "@/lib/extraction/engine";
import { logExtractionCost }         from "@/lib/extraction/cost-tracker";

// Allow up to 60 s on Vercel Pro (PDF download + text extraction)
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL   ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? "";

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
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["service_provider", "admin"].includes(profile.role as string)) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = adminClient();

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const user = await verifyToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { file_id, batch_id, force_ai = false } = body as {
    file_id:   string;
    batch_id:  string;
    force_ai?: boolean;
  };

  if (!file_id || !batch_id) {
    return NextResponse.json({ error: "file_id and batch_id required" }, { status: 400 });
  }

  try {
    // ── Fetch file record ────────────────────────────────────────────────────────
    const { data: fileRecord, error: fileErr } = await admin
      .from("document_ingestion_files")
      .select("id, storage_path, mime_type, document_type, extraction_status")
      .eq("id", file_id)
      .maybeSingle();

    if (fileErr || !fileRecord) {
      throw new Error("File record not found: " + (fileErr?.message ?? file_id));
    }

    // Mark as extracting
    await admin
      .from("document_ingestion_files")
      .update({ extraction_status: "Extracting" })
      .eq("id", file_id);

    // ── Get signed download URL ──────────────────────────────────────────────────
    const { data: signedData, error: signedErr } = await admin.storage
      .from("job-documents")
      .createSignedUrl(fileRecord.storage_path, 300);

    if (signedErr || !signedData?.signedUrl) {
      throw new Error(signedErr?.message ?? "Failed to create signed URL");
    }

    const signedUrl    = signedData.signedUrl;
    const mimeType     = fileRecord.mime_type ?? "application/octet-stream";
    const documentType = fileRecord.document_type ?? "Other";

    // ── Download file once (reused for text extraction) ─────────────────────────
    const fileRes = await fetch(signedUrl);
    if (!fileRes.ok) throw new Error("Download failed: " + fileRes.status);
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    // ── Run Nexum Extraction Engine v1 ───────────────────────────────────────────
    const result = await runExtractionEngine({
      fileBuffer,
      signedUrl,
      mimeType,
      userDocType: documentType,
      jobValueMYR: undefined, // could fetch from batch if needed
      forceAI:     force_ai,
    });

    // ── Determine extraction label ────────────────────────────────────────────────
    let extractionLabel = "AI-extracted draft";
    if (result.manual_required || result.ai_unavailable) {
      extractionLabel = "Manual entry required";
    } else if (!result.llm_used && result.confidence_score >= 70) {
      extractionLabel = "Auto-extracted (no AI cost)";
    } else if (result.llm_used && result.confidence_score >= 70) {
      extractionLabel = "AI-extracted draft";
    } else {
      extractionLabel = "AI-extracted draft — review required";
    }

    // ── Save extracted data ──────────────────────────────────────────────────────
    await admin
      .from("document_ingestion_files")
      .update({
        extracted_data:    result.fields,
        confidence_score:  result.confidence_score,
        extraction_status: result.manual_required ? "ManualRequired" : "Completed",
        extraction_label:  extractionLabel,
      })
      .eq("id", file_id);

    // ── Save extracted fields (flat table) ──────────────────────────────────────
    const skipFields = new Set(["confidence_score", "raw_response", "note"]);
    const fieldInserts = Object.entries(result.fields)
      .filter(([k, v]) => !skipFields.has(k) && v != null && v !== "")
      .map(([key, val]) => {
        const numericVal = typeof val === "number" ? val : parseFloat(String(val));
        return {
          batch_id,
          source_file_id:       file_id,
          field_name:           key,
          field_value:          String(val),
          field_value_numeric:  isNaN(numericVal) ? null : numericVal,
          confidence_score:     result.confidence_score,
          source_document_type: result.document_type,
          review_status:        "Pending",
          created_at:           new Date().toISOString(),
        };
      });

    if (fieldInserts.length > 0) {
      await admin
        .from("document_ingestion_extracted_fields")
        .delete()
        .eq("source_file_id", file_id);
      await admin
        .from("document_ingestion_extracted_fields")
        .insert(fieldInserts);
    }

    // ── Log extraction cost ──────────────────────────────────────────────────────
    const costProvider = result.llm_used
      ? (process.env.DOCUMENT_EXTRACTION_LLM_FALLBACK ?? "openai")
      : result.text_length > 0 ? "template" : "pdf_text";

    await logExtractionCost({
      document_id:        file_id,
      provider:           costProvider,
      model:              result.model_used ?? null,
      estimated_cost_usd: result.total_cost_usd,
      extraction_mode:    result.extraction_mode,
      pages_processed:    null,
    });

    // ── Update batch status ──────────────────────────────────────────────────────
    const { data: allFiles } = await admin
      .from("document_ingestion_files")
      .select("confidence_score")
      .eq("batch_id", batch_id)
      .not("confidence_score", "is", null);

    let avgConfidence: number | null = null;
    if (allFiles && allFiles.length > 0) {
      const sum = allFiles.reduce(
        (acc: number, f: { confidence_score: number | null }) => acc + (f.confidence_score ?? 0),
        0,
      );
      avgConfidence = sum / allFiles.length;
    }

    await admin
      .from("document_ingestion_batches")
      .update({
        confidence_score:    avgConfidence,
        ingestion_status:    avgConfidence !== null && avgConfidence < 70
          ? "Review Required"
          : "Extraction Completed",
        extraction_provider: result.primary_provider,
        extraction_model:    result.model_used ?? "template",
        updated_at:          new Date().toISOString(),
      })
      .eq("id", batch_id);

    return NextResponse.json({
      ok:               true,
      extracted_data:   result.fields,
      confidence_score: result.confidence_score,
      extraction_label: extractionLabel,
      stages:           result.stages,
      llm_used:         result.llm_used,
      dual_llm_used:    result.dual_llm_used,
      ai_unavailable:   result.ai_unavailable,
      manual_required:  result.manual_required,
      total_cost_usd:   result.total_cost_usd,
      document_type:    result.document_type,
      text_length:      result.text_length,
      fields_count:     fieldInserts.length,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extract] Error:", msg);

    await admin
      .from("document_ingestion_files")
      .update({ extraction_status: "Failed" })
      .eq("id", file_id)
      .catch(() => null);

    await admin
      .from("document_ingestion_batches")
      .update({
        ingestion_status: "Failed",
        error_message:    msg,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", batch_id)
      .catch(() => null);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
