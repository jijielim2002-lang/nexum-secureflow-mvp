// ─── /api/provider/ingestion/extract ─────────────────────────────────────────
// POST { file_id, batch_id }
//      → download file via signed URL
//      → Primary LLM (OpenAI gpt-4o) extraction
//      → Secondary LLM (Anthropic claude-3-5-haiku) cross-check (if ENABLE_DUAL_LLM_EXTRACTION=true)
//      → Store comparison results in document_extraction_comparisons
//      → Wording: "AI-extracted draft" / "Cross-checked" / "Conflict detected"
//        NEVER "AI verified", "guaranteed accurate", "bank verified"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ENABLE_DUAL_LLM = process.env.ENABLE_DUAL_LLM_EXTRACTION === "true";
const ENABLE_LLM      = process.env.ENABLE_LLM_DOCUMENT_EXTRACTION !== "false"; // default on if key set

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

// ── Document schemas ──────────────────────────────────────────────────────────

function getSchemaForDocType(documentType: string): string {
  const dt = (documentType ?? "").toLowerCase();

  if (dt.includes("transport invoice") || dt.includes("service invoice")) {
    return `Extract from this transport/service invoice:
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "service_provider_name": "string",
  "customer_name": "string",
  "customer_email": "string",
  "service_type": "string (e.g. Land Transport, Sea Freight)",
  "route": "string (origin to destination)",
  "cargo_description": "string",
  "job_value": "numeric string (logistics fee)",
  "currency": "string (MYR/USD/SGD etc)",
  "payment_terms": "string (e.g. Net 30)",
  "bl_awb_number": "string",
  "container_number": "string",
  "gross_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("delivery order") || dt.includes("do")) {
    return `Extract from this Delivery Order (DO):
{
  "do_number": "string",
  "do_date": "YYYY-MM-DD",
  "consignee_name": "string",
  "shipper_name": "string",
  "vessel_voyage": "string",
  "port_of_loading": "string",
  "port_of_discharge": "string",
  "cargo_description": "string",
  "container_number": "string",
  "bl_awb_number": "string",
  "gross_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "release_date": "YYYY-MM-DD",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("pod") || dt.includes("proof of delivery")) {
    return `Extract from this Proof of Delivery (POD):
{
  "pod_number": "string",
  "delivery_date": "YYYY-MM-DD",
  "recipient_name": "string",
  "recipient_signature": "present/absent",
  "delivery_address": "string",
  "cargo_description": "string",
  "condition_on_delivery": "string (Good/Damaged/Partial)",
  "driver_name": "string",
  "vehicle_plate": "string",
  "remarks": "string",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("kastam") || dt.includes("customs")) {
    return `Extract from this customs/kastam form:
{
  "customs_form_number": "string",
  "customs_form_type": "string (K1/K2/K3/K8/K9 etc)",
  "importer_name": "string",
  "exporter_name": "string",
  "hs_code": "string",
  "cargo_description": "string",
  "quantity": "numeric string",
  "gross_weight_kg": "numeric string",
  "cargo_value": "numeric string",
  "duty_amount": "numeric string",
  "tax_amount": "numeric string",
  "currency": "string",
  "permit_number": "string",
  "declaration_date": "YYYY-MM-DD",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("commercial invoice")) {
    return `Extract from this commercial invoice:
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "seller_name": "string",
  "buyer_name": "string",
  "customer_name": "string",
  "customer_email": "string",
  "cargo_description": "string",
  "hs_code": "string",
  "quantity": "numeric string",
  "gross_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "cargo_value": "numeric string",
  "currency": "string",
  "payment_terms": "string",
  "route": "string (country of origin to destination)",
  "bl_awb_number": "string",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("packing list")) {
    return `Extract from this packing list:
{
  "invoice_number": "string (if referenced)",
  "shipper_name": "string",
  "consignee_name": "string",
  "cargo_description": "string",
  "hs_code": "string",
  "quantity": "numeric string",
  "gross_weight_kg": "numeric string",
  "net_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "container_number": "string",
  "bl_awb_number": "string",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("bl") || dt.includes("awb") || dt.includes("bill of lading") || dt.includes("airway")) {
    return `Extract from this Bill of Lading / Airway Bill / Delivery Order:
{
  "bl_awb_number": "string",
  "issue_date": "YYYY-MM-DD",
  "shipper_name": "string",
  "consignee_name": "string",
  "notify_party": "string",
  "vessel_flight": "string",
  "port_of_loading": "string",
  "port_of_discharge": "string",
  "cargo_description": "string",
  "container_number": "string",
  "gross_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "freight_terms": "string (Prepaid/Collect)",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("permit") || dt.includes("license")) {
    return `Extract from this permit or license:
{
  "permit_number": "string",
  "permit_type": "string",
  "issued_to": "string",
  "issued_by": "string",
  "issue_date": "YYYY-MM-DD",
  "expiry_date": "YYYY-MM-DD",
  "cargo_description": "string",
  "hs_code": "string",
  "quantity_allowed": "string",
  "conditions": "string",
  "confidence_score": 0-100
}`;
  }

  if (dt.includes("payment slip") || dt.includes("payment proof") || dt.includes("receipt")) {
    return `Extract from this payment slip or receipt:
{
  "receipt_number": "string",
  "payment_date": "YYYY-MM-DD",
  "payer_name": "string",
  "payee_name": "string",
  "bank_name": "string",
  "account_number": "string (last 4 digits only if partially visible)",
  "amount": "numeric string",
  "currency": "string",
  "reference_number": "string",
  "payment_method": "string (Online Transfer/Cheque/Cash etc)",
  "remarks": "string",
  "confidence_score": 0-100
}`;
  }

  // Generic fallback
  return `Extract all relevant fields from this document:
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "customer_name": "string",
  "customer_email": "string",
  "service_type": "string",
  "route": "string",
  "cargo_description": "string",
  "hs_code": "string",
  "quantity": "string",
  "gross_weight_kg": "string",
  "volume_cbm": "string",
  "job_value": "string",
  "cargo_value": "string",
  "duty_amount": "string",
  "tax_amount": "string",
  "currency": "string",
  "payment_terms": "string",
  "bl_awb_number": "string",
  "container_number": "string",
  "customs_form_number": "string",
  "confidence_score": 0-100
}`;
}

// ── OpenAI extraction ──────────────────────────────────────────────────────────

async function extractWithOpenAI(
  signedUrl:    string,
  documentType: string,
): Promise<{ data: Record<string, unknown>; confidence: number; model: string; durationMs: number }> {
  const schema = getSchemaForDocType(documentType);
  const systemPrompt = `You are a document data extraction expert for logistics and trade finance.
Extract structured data from the provided document image.
${schema}
Return ONLY valid JSON. No markdown, no explanation, just the JSON object.
If a field cannot be found, use null. confidence_score should reflect overall extraction quality (0-100).`;

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  let oaiRes: Response;
  try {
    oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract structured data from this document and return valid JSON only." },
              { type: "image_url", image_url: { url: signedUrl, detail: "high" } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - start;

  if (!oaiRes.ok) {
    const errText = await oaiRes.text();
    throw new Error(`OpenAI API error ${oaiRes.status}: ${errText}`);
  }

  const oaiJson = await oaiRes.json();
  const rawContent: string = oaiJson?.choices?.[0]?.message?.content ?? "{}";
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(cleaned); } catch { parsed = { raw_response: rawContent }; }

  const confidence = typeof parsed.confidence_score === "number"
    ? parsed.confidence_score
    : parseFloat(String(parsed.confidence_score ?? "0")) || 0;

  return { data: parsed, confidence, model: "gpt-4o", durationMs };
}

// ── Anthropic extraction ───────────────────────────────────────────────────────

async function extractWithAnthropic(
  signedUrl:    string,
  documentType: string,
): Promise<{ data: Record<string, unknown>; confidence: number; model: string; durationMs: number }> {
  const schema = getSchemaForDocType(documentType);
  const systemPrompt = `You are a document data extraction expert for logistics and trade finance.
Extract structured data from the provided document image.
${schema}
Return ONLY valid JSON. No markdown, no explanation, just the JSON object.
If a field cannot be found, use null. confidence_score should reflect overall extraction quality (0-100).`;

  // Download image bytes to pass as base64 (Anthropic requires base64 for images)
  const imgRes = await fetch(signedUrl);
  if (!imgRes.ok) throw new Error("Failed to fetch document for Anthropic: " + imgRes.status);
  const imgBuf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(imgBuf).toString("base64");
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  // Anthropic only supports jpeg/png/gif/webp
  const safeType = contentType.startsWith("image/") ? contentType : "image/jpeg";

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  let antRes: Response;
  try {
    antRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system:     systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type:   "image",
                source: { type: "base64", media_type: safeType, data: base64 },
              },
              { type: "text", text: "Extract structured data from this document and return valid JSON only." },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - start;

  if (!antRes.ok) {
    const errText = await antRes.text();
    throw new Error(`Anthropic API error ${antRes.status}: ${errText}`);
  }

  const antJson = await antRes.json();
  const rawContent: string = antJson?.content?.[0]?.text ?? "{}";
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(cleaned); } catch { parsed = { raw_response: rawContent }; }

  const confidence = typeof parsed.confidence_score === "number"
    ? parsed.confidence_score
    : parseFloat(String(parsed.confidence_score ?? "0")) || 0;

  return { data: parsed, confidence, model: "claude-haiku-4-5-20251001", durationMs };
}

// ── Field comparison ──────────────────────────────────────────────────────────

type FieldResult = {
  matched:    string[];
  mismatched: Array<{ field: string; primary: unknown; secondary: unknown }>;
  missing:    string[];
  status:     "Matched" | "Minor Differences" | "Conflict";
};

function compareFields(
  primary:   Record<string, unknown>,
  secondary: Record<string, unknown>,
): FieldResult {
  const skip = new Set(["confidence_score", "raw_response", "note"]);
  const allKeys = new Set([...Object.keys(primary), ...Object.keys(secondary)].filter(k => !skip.has(k)));

  const matched:    string[] = [];
  const mismatched: Array<{ field: string; primary: unknown; secondary: unknown }> = [];
  const missing:    string[] = [];

  for (const key of allKeys) {
    const pVal = primary[key];
    const sVal = secondary[key];

    if ((pVal == null || pVal === "") && (sVal == null || sVal === "")) continue;
    if (pVal == null || pVal === "") { missing.push(key); continue; }
    if (sVal == null || sVal === "") { missing.push(key); continue; }

    const pStr = String(pVal).trim().toLowerCase();
    const sStr = String(sVal).trim().toLowerCase();

    if (pStr === sStr) {
      matched.push(key);
    } else {
      mismatched.push({ field: key, primary: pVal, secondary: sVal });
    }
  }

  let status: "Matched" | "Minor Differences" | "Conflict";
  if (mismatched.length === 0) {
    status = "Matched";
  } else if (mismatched.length <= 2) {
    status = "Minor Differences";
  } else {
    status = "Conflict";
  }

  return { matched, mismatched, missing, status };
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { file_id?: string; batch_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { file_id, batch_id } = body;
  if (!file_id || !batch_id) {
    return NextResponse.json({ error: "file_id and batch_id are required" }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch file record
  const { data: fileRecord, error: fileErr } = await admin
    .from("document_ingestion_files")
    .select("*")
    .eq("id", file_id)
    .single();

  if (fileErr || !fileRecord) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Mark extraction in progress
  await admin
    .from("document_ingestion_files")
    .update({ extraction_status: "In Progress" })
    .eq("id", file_id);

  try {
    // Create signed download URL (300s)
    const { data: signedData, error: signedErr } = await admin.storage
      .from("job-documents")
      .createSignedUrl(fileRecord.storage_path, 300);

    if (signedErr || !signedData?.signedUrl) {
      throw new Error(signedErr?.message ?? "Failed to create signed download URL");
    }

    const signedUrl     = signedData.signedUrl;
    const documentType  = fileRecord.document_type ?? "Unknown";

    let extracted_data: Record<string, unknown> = {};
    let confidence_score = 0;
    let comparisonStatus: string | null = null;

    if (!process.env.OPENAI_API_KEY || !ENABLE_LLM) {
      // No API key — return empty schema
      extracted_data = { note: "No OpenAI API key configured — extraction skipped (AI-extracted draft)" };
      confidence_score = 0;
    } else {
      // ── Primary: OpenAI ────────────────────────────────────────────────────
      const primary = await extractWithOpenAI(signedUrl, documentType);
      extracted_data = primary.data;
      confidence_score = primary.confidence;

      // Record primary run
      const { data: primaryRun } = await admin
        .from("document_extraction_runs")
        .insert({
          file_id,
          provider:        "OpenAI",
          model:           primary.model,
          status:          "Completed",
          raw_output:      primary.data,
          extracted_fields: primary.data,
          confidence_score: primary.confidence,
          duration_ms:     primary.durationMs,
        })
        .select("id")
        .single();

      // ── Secondary: Anthropic (if enabled) ─────────────────────────────────
      if (ENABLE_DUAL_LLM && process.env.ANTHROPIC_API_KEY) {
        let secondaryRunId: string | null = null;
        let comparison: FieldResult | null = null;

        try {
          const secondary = await extractWithAnthropic(signedUrl, documentType);

          const { data: secondaryRun } = await admin
            .from("document_extraction_runs")
            .insert({
              file_id,
              provider:        "Anthropic",
              model:           secondary.model,
              status:          "Completed",
              raw_output:      secondary.data,
              extracted_fields: secondary.data,
              confidence_score: secondary.confidence,
              duration_ms:     secondary.durationMs,
            })
            .select("id")
            .single();

          secondaryRunId = secondaryRun?.id ?? null;
          comparison     = compareFields(primary.data, secondary.data);
          comparisonStatus = comparison.status;

          // Average confidence
          confidence_score = (primary.confidence + secondary.confidence) / 2;

          // Store comparison
          const batchRecord = await admin
            .from("document_ingestion_batches")
            .select("batch_reference")
            .eq("id", batch_id)
            .maybeSingle();

          await admin
            .from("document_extraction_comparisons")
            .insert({
              file_id,
              job_reference:      batchRecord?.data?.batch_reference ?? null,
              primary_provider:   "OpenAI",
              secondary_provider: "Anthropic",
              primary_run_id:     primaryRun?.id ?? null,
              secondary_run_id:   secondaryRunId,
              comparison_status:  comparison.status,
              matched_fields:     comparison.matched,
              mismatched_fields:  comparison.mismatched,
              missing_fields:     comparison.missing,
              confidence_score,
              final_review_status: "Pending",
            });

        } catch (antErr) {
          const msg = antErr instanceof Error ? antErr.message : String(antErr);
          console.warn("[extract] Anthropic secondary failed, using primary only:", msg);

          await admin.from("document_extraction_runs").insert({
            file_id,
            provider:  "Anthropic",
            model:     "claude-haiku-4-5-20251001",
            status:    "Failed",
            error_message: msg,
          });
          comparisonStatus = "Failed";
        }
      }
    }

    // Determine extraction label for wording compliance
    let extractionLabel = "AI-extracted draft";
    if (comparisonStatus === "Matched")           extractionLabel = "Cross-checked";
    else if (comparisonStatus === "Minor Differences") extractionLabel = "Cross-checked with minor differences";
    else if (comparisonStatus === "Conflict")     extractionLabel = "Conflict detected — admin review required";
    else if (comparisonStatus === "Failed")       extractionLabel = "AI-extracted draft (secondary check failed)";

    // Update file record
    await admin
      .from("document_ingestion_files")
      .update({
        extracted_data,
        confidence_score,
        extraction_status: "Completed",
        extraction_label:  extractionLabel,
      })
      .eq("id", file_id);

    // Insert extracted fields
    const skipFields = new Set(["confidence_score", "note", "raw_response"]);
    const fieldInserts: Array<{
      batch_id: string;
      source_file_id: string;
      field_name: string;
      field_value: string | null;
      field_value_numeric: number | null;
      confidence_score: number;
      source_document_type: string;
      review_status: string;
      created_at: string;
    }> = [];

    for (const [key, val] of Object.entries(extracted_data)) {
      if (skipFields.has(key) || val === null || val === undefined || val === "") continue;
      const numericVal = typeof val === "number" ? val : parseFloat(String(val));
      fieldInserts.push({
        batch_id,
        source_file_id: file_id,
        field_name: key,
        field_value: String(val),
        field_value_numeric: isNaN(numericVal) ? null : numericVal,
        confidence_score,
        source_document_type: documentType,
        review_status: "Pending",
        created_at: new Date().toISOString(),
      });
    }

    if (fieldInserts.length > 0) {
      await admin
        .from("document_ingestion_extracted_fields")
        .delete()
        .eq("source_file_id", file_id);

      await admin
        .from("document_ingestion_extracted_fields")
        .insert(fieldInserts);
    }

    // Recalculate batch average confidence
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

    const newBatchStatus = avgConfidence !== null && avgConfidence < 70
      ? "Review Required"
      : "Extraction Completed";

    await admin
      .from("document_ingestion_batches")
      .update({
        confidence_score:    avgConfidence,
        ingestion_status:    newBatchStatus,
        extraction_provider: ENABLE_DUAL_LLM ? "OpenAI + Anthropic" : "OpenAI",
        extraction_model:    ENABLE_DUAL_LLM ? "gpt-4o + claude-haiku-4-5-20251001" : "gpt-4o",
        updated_at:          new Date().toISOString(),
      })
      .eq("id", batch_id);

    return NextResponse.json({
      ok: true,
      extracted_data,
      confidence_score,
      extraction_label: extractionLabel,
      comparison_status: comparisonStatus,
      dual_llm_enabled: ENABLE_DUAL_LLM,
      fields_count: fieldInserts.length,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    await admin
      .from("document_ingestion_files")
      .update({ extraction_status: "Failed" })
      .eq("id", file_id);

    await admin
      .from("document_ingestion_batches")
      .update({
        ingestion_status: "Failed",
        error_message:    msg,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", batch_id);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
