/**
 * POST /api/document-extract
 *
 * Accepts: { extraction_id, job_reference, document_type }
 *
 * 1. Fetches the document_extractions row + joins documents to get file_path + mime_type.
 * 2. Downloads the file from Supabase Storage (bucket: "job-documents").
 * 3. If OPENAI_API_KEY is set and the file is an image or PDF: calls GPT-4o vision.
 * 4. Falls back to simulated extraction if no API key or AI call fails.
 * 5. Updates document_extractions row with extracted_data, confidence_score, extraction_source.
 * 6. Writes audit logs: document_real_extraction_started + document_real_extraction_completed.
 * 7. Returns { success, data, confidence, source }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  runSimulatedExtraction,
  getExtractionPrompt,
  getMimeFromPath,
  isExtractableMime,
  EXTRACTABLE_TYPES,
  type ExtractionSource,
} from "@/lib/documentExtraction";

// ─── Environment ───────────────────────────────────────────────────────────────

const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Service role key bypasses RLS for server-side reads/writes.
// Falls back to anon key if service key is not yet configured.
const SUPABASE_SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                         ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                         ?? "";
const OPENAI_API_KEY      = process.env.OPENAI_API_KEY ?? null;
const OPENAI_MODEL        = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o";
const STORAGE_BUCKET      = "job-documents";

function db() {
  return createClient(SUPABASE_URL, SUPABASE_SERVER_KEY);
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  extraction_id:  string;
  job_reference:  string;
  document_type:  string;
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { extraction_id, job_reference, document_type } = body;

  if (!extraction_id || !job_reference || !document_type) {
    return NextResponse.json(
      { success: false, error: "Missing required fields: extraction_id, job_reference, document_type" },
      { status: 400 },
    );
  }

  const supabase = db();
  const now      = new Date().toISOString();

  // ── Audit: started ───────────────────────────────────────────────────────────
  await supabase.from("audit_logs").insert({
    job_reference,
    actor_role:  "admin",
    actor_name:  "Nexum AI Engine",
    action:      "document_real_extraction_started",
    description: `AI extraction started for ${document_type} (extraction_id: ${extraction_id}).`,
    metadata:    { extraction_id, document_type, ai_enabled: !!OPENAI_API_KEY },
  });

  // ── Fetch extraction row + document file_path ─────────────────────────────────
  const { data: exRow, error: exErr } = await supabase
    .from("document_extractions")
    .select("id, document_id, document_type, documents(file_path, mime_type)")
    .eq("id", extraction_id)
    .maybeSingle();

  if (exErr || !exRow) {
    return NextResponse.json(
      { success: false, error: exErr?.message ?? "Extraction row not found" },
      { status: 404 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docJoin   = (exRow as any).documents as { file_path: string; mime_type: string | null } | null;
  const filePath  = docJoin?.file_path ?? null;
  const mimeHint  = docJoin?.mime_type ?? (filePath ? getMimeFromPath(filePath) : null);

  // ── Attempt AI extraction if key is present and file is accessible ────────────
  let extractedData: Record<string, string>;
  let confidence: number;
  let source: ExtractionSource;

  const canUseAI = !!(OPENAI_API_KEY && filePath && mimeHint && isExtractableMime(mimeHint) && EXTRACTABLE_TYPES.has(document_type));

  if (canUseAI) {
    try {
      const aiResult = await extractWithOpenAI(supabase, filePath!, mimeHint!, document_type);
      extractedData = aiResult.data;
      confidence    = aiResult.confidence;
      source        = "ai";
    } catch (err) {
      // AI failed — log and fall back
      console.error("[document-extract] OpenAI call failed, falling back to simulated:", err);
      await supabase.from("audit_logs").insert({
        job_reference,
        actor_role:  "admin",
        actor_name:  "Nexum AI Engine",
        action:      "document_real_extraction_ai_fallback",
        description: `AI extraction failed for ${document_type}. Falling back to simulated mode. Error: ${err instanceof Error ? err.message : String(err)}`,
        metadata:    { extraction_id, document_type },
      });
      const sim = runSimulatedExtraction(document_type);
      if (!sim) {
        return NextResponse.json(
          { success: false, error: `No extraction available for document type: ${document_type}` },
          { status: 422 },
        );
      }
      extractedData = sim.data;
      confidence    = sim.confidence;
      source        = "simulated";
    }
  } else {
    // No AI key or unsupported file — use simulated
    const sim = runSimulatedExtraction(document_type);
    if (!sim) {
      return NextResponse.json(
        { success: false, error: `No extraction available for document type: ${document_type}` },
        { status: 422 },
      );
    }
    extractedData = sim.data;
    confidence    = sim.confidence;
    source        = "simulated";
  }

  // ── Write result to document_extractions ──────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("document_extractions")
    .update({
      extracted_data:    extractedData,
      confidence_score:  confidence,
      extraction_source: source,
      extraction_status: "Extracted",
      updated_at:        now,
    })
    .eq("id", extraction_id);

  if (updateErr) {
    console.error("[document-extract] DB update failed:", updateErr.message);
    return NextResponse.json(
      { success: false, error: `DB write failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  // ── Audit: completed ─────────────────────────────────────────────────────────
  await supabase.from("audit_logs").insert({
    job_reference,
    actor_role:  "admin",
    actor_name:  "Nexum AI Engine",
    action:      "document_real_extraction_completed",
    description: `Extraction completed for ${document_type}. Source: ${source}. Confidence: ${Math.round(confidence * 100)}%.`,
    metadata:    { extraction_id, document_type, source, confidence, field_count: Object.keys(extractedData).length },
  });

  // ── BL → shipment_trackings (server-side, bypasses client RLS) ───────────────
  if (document_type === "Bill of Lading") {
    await pushBLToTracking(supabase, job_reference, extractedData, confidence, now);
  }

  // ── Document validation (check mandatory docs, update job status) ─────────────
  await validateMandatoryDocs(supabase, job_reference, now);

  return NextResponse.json({
    success:    true,
    data:       extractedData,
    confidence,
    source,
  });
}

// ─── BL → shipment_trackings ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pushBLToTracking(supabase: any, jobRef: string, data: Record<string, string>, confidence: number, now: string) {
  const patch: Record<string, string | null> = {};
  if (data.bl_number)          patch.bl_number          = data.bl_number;
  if (data.booking_number)     patch.booking_number     = data.booking_number;
  if (data.shipping_line)      patch.shipping_line      = data.shipping_line;
  if (data.vessel_name)        patch.vessel_name        = data.vessel_name;
  if (data.voyage_number)      patch.voyage_number      = data.voyage_number;
  if (data.port_of_loading)    patch.port_of_loading    = data.port_of_loading;
  if (data.port_of_discharge)  patch.port_of_discharge  = data.port_of_discharge;
  if (data.transshipment_port) patch.transshipment_port = data.transshipment_port;
  if (data.container_number)   patch.container_number   = data.container_number;
  if (data.seal_number)        patch.seal_number        = data.seal_number;
  if (data.etd)                patch.etd                = data.etd;
  if (data.eta)                patch.eta                = data.eta;

  if (Object.keys(patch).length === 0) {
    console.warn("[document-extract] pushBLToTracking: no fields extracted from BL");
    return { created: false, updated: false };
  }

  const latestLoc = data.port_of_loading || data.port_of_discharge || null;

  const { data: existing, error: selectErr } = await supabase
    .from("shipment_trackings")
    .select("id")
    .eq("job_reference", jobRef)
    .maybeSingle();

  if (selectErr) {
    console.error("[document-extract] shipment_trackings SELECT error:", selectErr.message, selectErr.code);
    return { created: false, updated: false };
  }

  if (existing) {
    const { error: updateErr } = await supabase.from("shipment_trackings").update({
      ...patch,
      transport_mode:      "Sea Freight",
      data_source:         "AI Document Extraction",
      confidence_score:    confidence,
      latest_event:        "Tracking updated from Bill of Lading (AI extraction)",
      latest_location:     latestLoc,
      next_expected_event: "Admin verification pending",
      updated_at:          now,
    }).eq("job_reference", jobRef);
    if (updateErr) {
      console.error("[document-extract] shipment_trackings UPDATE error:", updateErr.message, updateErr.code);
      return { created: false, updated: false };
    }
    console.log("[document-extract] shipment_trackings UPDATED for", jobRef);
    return { created: false, updated: true };
  } else {
    const { error: insertErr } = await supabase.from("shipment_trackings").insert({
      job_reference:       jobRef,
      transport_mode:      "Sea Freight",
      data_source:         "AI Document Extraction",
      confidence_score:    confidence,
      tracking_status:     "Pending",
      latest_event:        "Tracking created from Bill of Lading (AI extraction)",
      latest_location:     latestLoc,
      next_expected_event: "Admin verification pending",
      ...patch,
      created_at: now,
      updated_at: now,
    });
    if (insertErr) {
      console.error("[document-extract] shipment_trackings INSERT error:", insertErr.message, insertErr.code);
      return { created: false, updated: false };
    }
    console.log("[document-extract] shipment_trackings INSERTED for", jobRef);
    return { created: true, updated: false };
  }
}

// ─── Mandatory doc validation ─────────────────────────────────────────────────

const MANDATORY_DOC_SERVICE_TYPES = new Set(["Sea Freight", "Air Freight", "Cold Chain", "Clearance"]);
const MANDATORY_DOCS = ["Commercial Invoice", "Packing List", "Bill of Lading"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateMandatoryDocs(supabase: any, jobRef: string, now: string) {
  try {
    const { data: job } = await supabase
      .from("secured_jobs")
      .select("service_type")
      .eq("job_reference", jobRef)
      .maybeSingle();

    const serviceType = (job as { service_type?: string } | null)?.service_type;
    if (!serviceType || !MANDATORY_DOC_SERVICE_TYPES.has(serviceType)) {
      return { requires_docs: false, validated: true, service_type: serviceType };
    }

    const { data: docs } = await supabase
      .from("documents")
      .select("document_type, document_extractions(extraction_status, confidence_score)")
      .eq("job_reference", jobRef)
      .in("document_type", MANDATORY_DOCS);

    const uploadedTypes = new Set<string>();
    const lowConfidenceDocs: string[] = [];

    for (const doc of (docs ?? [])) {
      const ext = (doc as { document_type: string; document_extractions?: Array<{ extraction_status: string; confidence_score: number | null }> }).document_extractions?.[0];
      const docType = (doc as { document_type: string }).document_type;
      uploadedTypes.add(docType);
      if (ext && ["Extracted", "Verified"].includes(ext.extraction_status) && (ext.confidence_score ?? 1) < 0.6) {
        lowConfidenceDocs.push(docType);
      }
    }

    const missingDocs = MANDATORY_DOCS.filter((d) => !uploadedTypes.has(d));
    const allValid = missingDocs.length === 0 && lowConfidenceDocs.length === 0;

    if (!allValid) {
      // Block job — update job_status (best-effort; requires service role key to bypass RLS)
      await supabase.from("secured_jobs")
        .update({ job_status: "Document Validation Failed", updated_at: now })
        .eq("job_reference", jobRef);
    } else {
      // Unblock if previously blocked
      const { data: currentJob } = await supabase.from("secured_jobs")
        .select("job_status").eq("job_reference", jobRef).maybeSingle();
      if ((currentJob as { job_status?: string } | null)?.job_status === "Document Validation Failed") {
        await supabase.from("secured_jobs")
          .update({ job_status: "Awaiting Customer Acceptance", updated_at: now })
          .eq("job_reference", jobRef);
      }
    }

    return {
      requires_docs:    true,
      validated:        allValid,
      service_type:     serviceType,
      missing_docs:     missingDocs,
      low_confidence:   lowConfidenceDocs,
    };
  } catch (err) {
    console.warn("[document-extract] doc validation failed:", err);
    return null;
  }
}

// ─── OpenAI extraction ─────────────────────────────────────────────────────────

async function extractWithOpenAI(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:     any,
  filePath:     string,
  mimeType:     string,
  documentType: string,
): Promise<{ data: Record<string, string>; confidence: number }> {
  // 1. Download file from Supabase Storage
  const { data: blob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(filePath);

  if (dlErr || !blob) {
    throw new Error(`Storage download failed: ${dlErr?.message ?? "empty blob"}`);
  }

  // 2. Convert to base64
  const arrayBuffer = await (blob as Blob).arrayBuffer();
  const base64      = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl     = `data:${mimeType};base64,${base64}`;

  // 3. Build extraction prompt
  const userPrompt = getExtractionPrompt(documentType);

  // 4. Call OpenAI Chat Completions with vision
  const oaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:           OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature:     0,
      max_tokens:      1200,
      messages: [
        {
          role:    "system",
          content: "You are a precise document extraction AI for a trade finance platform. Extract only what is visible in the document. Never hallucinate or invent values.",
        },
        {
          role:    "user",
          content: [
            {
              type:      "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
    }),
  });

  if (!oaiResponse.ok) {
    const errText = await oaiResponse.text();
    throw new Error(`OpenAI API error ${oaiResponse.status}: ${errText.slice(0, 300)}`);
  }

  // 5. Parse response
  const oaiJson = await oaiResponse.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?:  { total_tokens: number };
  };

  const rawContent = oaiJson.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${rawContent.slice(0, 200)}`);
  }

  // 6. Extract _confidence, strip it from the data payload, cast everything to string
  const rawConfidence = typeof parsed._confidence === "number" ? parsed._confidence : null;
  const confidence    = rawConfidence !== null
    ? Math.min(1, Math.max(0, rawConfidence))
    : deriveConfidence(parsed);

  delete parsed._confidence;

  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" || typeof v === "number") {
      data[k] = String(v);
    } else {
      data[k] = "";
    }
  }

  return { data, confidence };
}

// ─── Confidence heuristic (fallback when model doesn't return _confidence) ─────

function deriveConfidence(parsed: Record<string, unknown>): number {
  const total    = Object.keys(parsed).length;
  if (total === 0) return 0.5;
  const nonEmpty = Object.values(parsed).filter((v) => v !== "" && v != null).length;
  const fillRate = nonEmpty / total;
  // 0.75 base + up to 0.20 for fill rate
  return Math.min(0.97, 0.75 + fillRate * 0.20);
}
