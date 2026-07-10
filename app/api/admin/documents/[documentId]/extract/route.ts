// POST /api/admin/documents/[documentId]/extract
// Server-side only. LLM API key is NEVER sent to the browser.
// Admin-only for v1. Feature-gated by ENABLE_LLM_DOCUMENT_EXTRACTION=true.
// Max effective timeout: 60 s (AbortSignal set to 55 s, leaving margin for DB ops).

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

// ─── Document extraction prompts ──────────────────────────────────────────────

function buildSchema(documentType: string): { prompt: string; fieldKeys: string[] } {
  switch (documentType) {
    case "commercial_invoice":
      return {
        fieldKeys: ["invoice_number","invoice_date","seller_name","buyer_name","consignee_name",
          "product_description","hs_code","quantity","unit_price","total_invoice_value",
          "currency","incoterm","origin_country","destination_country","payment_terms"],
        prompt: `Extract from this Commercial Invoice and return ONLY valid JSON (no markdown, no explanation):
{
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "seller_name": "string or null",
  "buyer_name": "string or null",
  "consignee_name": "string or null",
  "product_description": "string or null",
  "hs_code": "string or null",
  "quantity": number_or_null,
  "unit_price": number_or_null,
  "total_invoice_value": number_or_null,
  "currency": "3-letter ISO code or null",
  "incoterm": "string or null",
  "origin_country": "string or null",
  "destination_country": "string or null",
  "payment_terms": "string or null",
  "confidence": 0.0_to_1.0
}`,
      };

    case "packing_list":
      return {
        fieldKeys: ["packing_list_number","carton_count","package_count","gross_weight_kg",
          "net_weight_kg","volume_cbm","product_description","quantity","container_number","seal_number"],
        prompt: `Extract from this Packing List and return ONLY valid JSON:
{
  "packing_list_number": "string or null",
  "carton_count": number_or_null,
  "package_count": number_or_null,
  "gross_weight_kg": number_or_null,
  "net_weight_kg": number_or_null,
  "volume_cbm": number_or_null,
  "product_description": "string or null",
  "quantity": number_or_null,
  "container_number": "string or null",
  "seal_number": "string or null",
  "confidence": 0.0_to_1.0
}`,
      };

    case "kastam_form":
      return {
        fieldKeys: ["customs_form_number","declaration_date","importer_name","exporter_name",
          "hs_code","declared_value","duty_amount","tax_amount","permit_required",
          "permit_number","origin_country","port_of_entry","clearance_status"],
        prompt: `Extract from this Kastam / Customs Form and return ONLY valid JSON:
{
  "customs_form_number": "string or null",
  "declaration_date": "YYYY-MM-DD or null",
  "importer_name": "string or null",
  "exporter_name": "string or null",
  "hs_code": "string or null",
  "declared_value": number_or_null,
  "duty_amount": number_or_null,
  "tax_amount": number_or_null,
  "permit_required": "yes or no or null",
  "permit_number": "string or null",
  "origin_country": "string or null",
  "port_of_entry": "string or null",
  "clearance_status": "string or null",
  "confidence": 0.0_to_1.0
}`,
      };

    case "bl_awb_do":
      return {
        fieldKeys: ["bl_awb_do_number","carrier_name","shipper_name","consignee_name","notify_party",
          "vessel_or_flight","origin_port","destination_port","etd","eta",
          "container_number","seal_number","packages","gross_weight_kg","volume_cbm"],
        prompt: `Extract from this Bill of Lading / Airway Bill / Delivery Order and return ONLY valid JSON:
{
  "bl_awb_do_number": "string or null",
  "carrier_name": "string or null",
  "shipper_name": "string or null",
  "consignee_name": "string or null",
  "notify_party": "string or null",
  "vessel_or_flight": "string or null",
  "origin_port": "string or null",
  "destination_port": "string or null",
  "etd": "YYYY-MM-DD or null",
  "eta": "YYYY-MM-DD or null",
  "container_number": "string or null",
  "seal_number": "string or null",
  "packages": number_or_null,
  "gross_weight_kg": number_or_null,
  "volume_cbm": number_or_null,
  "confidence": 0.0_to_1.0
}`,
      };

    case "payment_slip":
      return {
        fieldKeys: ["payment_reference","payer_name","payee_name","payment_date","payment_amount",
          "payment_currency","bank_name","transaction_reference","job_reference_matched"],
        prompt: `Extract from this Payment Slip / Transfer Receipt and return ONLY valid JSON:
{
  "payment_reference": "string or null",
  "payer_name": "string or null",
  "payee_name": "string or null",
  "payment_date": "YYYY-MM-DD or null",
  "payment_amount": number_or_null,
  "payment_currency": "3-letter ISO code or null",
  "bank_name": "string or null",
  "transaction_reference": "string or null",
  "job_reference_matched": "any job or reference number visible on the slip or null",
  "confidence": 0.0_to_1.0
}`,
      };

    case "pod":
      return {
        fieldKeys: ["delivery_date","receiver_name","receiver_signature_available","delivery_location",
          "vehicle_number","driver_name","pod_reference","damage_remark","shortfall_remark"],
        prompt: `Extract from this Proof of Delivery (POD) and return ONLY valid JSON:
{
  "delivery_date": "YYYY-MM-DD or null",
  "receiver_name": "string or null",
  "receiver_signature_available": "yes or no or null",
  "delivery_location": "string or null",
  "vehicle_number": "string or null",
  "driver_name": "string or null",
  "pod_reference": "string or null",
  "damage_remark": "any damage noted, or null",
  "shortfall_remark": "any shortage noted, or null",
  "confidence": 0.0_to_1.0
}`,
      };

    case "quotation_job_order":
      return {
        fieldKeys: ["quoted_amount","quoted_currency","service_scope","route",
          "payment_terms","liability_terms","provider_name","customer_name"],
        prompt: `Extract from this Quotation / Job Order and return ONLY valid JSON:
{
  "quoted_amount": number_or_null,
  "quoted_currency": "3-letter ISO code or null",
  "service_scope": "string or null",
  "route": "string or null",
  "payment_terms": "string or null",
  "liability_terms": "string or null",
  "provider_name": "string or null",
  "customer_name": "string or null",
  "confidence": 0.0_to_1.0
}`,
      };

    default:
      return {
        fieldKeys: [],
        prompt: `Extract any structured data from this logistics document and return as JSON with a "confidence" field (0.0–1.0). Return ONLY valid JSON.`,
      };
  }
}

// ─── Field label map ──────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  invoice_number: "Invoice Number", invoice_date: "Invoice Date",
  seller_name: "Seller Name", buyer_name: "Buyer Name",
  consignee_name: "Consignee Name", product_description: "Product Description",
  hs_code: "HS Code", quantity: "Quantity", unit_price: "Unit Price",
  total_invoice_value: "Total Invoice Value", currency: "Currency",
  incoterm: "Incoterm", origin_country: "Origin Country",
  destination_country: "Destination Country", payment_terms: "Payment Terms",
  packing_list_number: "Packing List No.", carton_count: "Carton Count",
  package_count: "Package Count", gross_weight_kg: "Gross Weight (kg)",
  net_weight_kg: "Net Weight (kg)", volume_cbm: "Volume (CBM)",
  container_number: "Container No.", seal_number: "Seal No.",
  customs_form_number: "Customs Form No.", declaration_date: "Declaration Date",
  importer_name: "Importer Name", exporter_name: "Exporter Name",
  declared_value: "Declared Value", duty_amount: "Duty Amount",
  tax_amount: "Tax Amount", permit_required: "Permit Required?",
  permit_number: "Permit No.", port_of_entry: "Port of Entry",
  clearance_status: "Clearance Status", bl_awb_do_number: "BL / AWB / DO No.",
  carrier_name: "Carrier Name", shipper_name: "Shipper Name",
  notify_party: "Notify Party", vessel_or_flight: "Vessel / Flight",
  origin_port: "Origin Port", destination_port: "Destination Port",
  etd: "ETD", eta: "ETA", packages: "Packages",
  payment_reference: "Payment Reference", payer_name: "Payer Name",
  payee_name: "Payee Name", payment_date: "Payment Date",
  payment_amount: "Payment Amount", payment_currency: "Currency",
  bank_name: "Bank Name", transaction_reference: "Transaction Reference",
  job_reference_matched: "Job Ref on Slip",
  delivery_date: "Delivery Date", receiver_name: "Receiver Name",
  receiver_signature_available: "Signature Available?",
  delivery_location: "Delivery Location", vehicle_number: "Vehicle No.",
  driver_name: "Driver Name", pod_reference: "POD Reference",
  damage_remark: "Damage Remark", shortfall_remark: "Shortfall Remark",
  quoted_amount: "Quoted Amount", quoted_currency: "Currency",
  service_scope: "Service Scope", route: "Route",
  liability_terms: "Liability Terms", provider_name: "Provider Name",
  customer_name: "Customer Name",
};

// ─── LLM callers (native fetch — no SDK installed) ────────────────────────────

async function callOpenAI(imageUrl: string, prompt: string, model: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{
        role:    "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          { type: "text", text: prompt },
        ],
      }],
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: unknown;
  };
  return { text: data.choices[0]?.message?.content ?? "", usage: data.usage };
}

async function callClaude(imageUrl: string, prompt: string, model: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // Anthropic vision requires base64 — fetch the signed URL and convert
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error("Failed to fetch document for vision");
  const imgBuf   = await imgRes.arrayBuffer();
  const imgB64   = Buffer.from(imgBuf).toString("base64");
  const mimeType = (imgRes.headers.get("content-type") ?? "application/pdf") as
    "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{
        role:    "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imgB64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage?: unknown;
  };
  const text = data.content.find(b => b.type === "text")?.text ?? "";
  return { text, usage: data.usage };
}

// ─── Parse LLM JSON response ──────────────────────────────────────────────────

function parseExtracted(text: string): Record<string, unknown> {
  const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as Record<string, unknown>;
    throw new Error("LLM returned non-JSON response");
  }
}

// ─── Expanded mismatch detection (9 comparisons) ─────────────────────────────

interface MismatchRecord {
  mismatch_type:   string;
  severity:        "Low" | "Medium" | "High" | "Critical";
  field_name:      string;
  expected_value:  string;
  extracted_value: string;
}

async function detectMismatches(
  svc:          ReturnType<typeof svcClient>,
  jobReference: string,
  documentType: string,
  extracted:    Record<string, unknown>,
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];

  const toNum = (v: unknown): number | null =>
    typeof v === "number" ? v : typeof v === "string" ? (parseFloat(v) || null) : null;
  const toStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  try {
    // Fetch job base fields + payment obligations in parallel
    const [jobRes, oblRes, prevFieldsRes] = await Promise.all([
      svc.from("secured_jobs")
        .select("cargo_value_amount, cargo_value_currency")
        .eq("job_reference", jobReference)
        .single(),
      svc.from("payment_obligations")
        .select("amount, currency")
        .eq("job_reference", jobReference)
        .in("status", ["Pending", "Partially Paid"])
        .order("created_at")
        .limit(1),
      svc.from("job_document_extracted_fields")
        .select("field_key, field_value, field_value_numeric")
        .eq("job_reference", jobReference)
        .in("field_key", ["hs_code","total_invoice_value","currency","origin_port","destination_port","gross_weight_kg"]),
    ]);

    const job = jobRes.data as { cargo_value_amount: number|null; cargo_value_currency: string|null } | null;
    const obl = (oblRes.data ?? [])[0] as { amount: number|null; currency: string|null } | undefined;

    const prev: Record<string, { value: string|null; numeric: number|null }> = {};
    for (const f of (prevFieldsRes.data ?? []) as Array<{ field_key: string; field_value: string|null; field_value_numeric: number|null }>) {
      prev[f.field_key] = { value: f.field_value, numeric: f.field_value_numeric };
    }

    // 1. Payment slip: amount vs open obligation
    if (documentType === "payment_slip" && obl?.amount != null) {
      const paid = toNum(extracted.payment_amount);
      if (paid != null) {
        const diff = Math.abs(paid - obl.amount) / obl.amount;
        if (diff > 0.05) {
          mismatches.push({
            mismatch_type:   "payment_amount_vs_obligation",
            severity:        diff > 0.2 ? "High" : "Medium",
            field_name:      "payment_amount",
            expected_value:  String(obl.amount),
            extracted_value: String(paid),
          });
        }
      }
    }

    // 2. Payment slip: currency vs job currency
    if (documentType === "payment_slip" && job?.cargo_value_currency) {
      const pCurr = toStr(extracted.payment_currency);
      if (pCurr && pCurr !== job.cargo_value_currency) {
        mismatches.push({
          mismatch_type:   "payment_currency_mismatch",
          severity:        "High",
          field_name:      "payment_currency",
          expected_value:  job.cargo_value_currency,
          extracted_value: pCurr,
        });
      }
    }

    // 3. Invoice: value vs cargo_value_amount (>10%)
    if (documentType === "commercial_invoice" && job?.cargo_value_amount != null && job.cargo_value_amount > 0) {
      const invVal = toNum(extracted.total_invoice_value);
      if (invVal != null) {
        const diff = Math.abs(invVal - job.cargo_value_amount) / job.cargo_value_amount;
        if (diff > 0.1) {
          mismatches.push({
            mismatch_type:   "invoice_value_vs_cargo_value",
            severity:        diff > 0.3 ? "High" : "Medium",
            field_name:      "total_invoice_value",
            expected_value:  String(job.cargo_value_amount),
            extracted_value: String(invVal),
          });
        }
      }
    }

    // 4. Invoice: currency vs job currency
    if (documentType === "commercial_invoice" && job?.cargo_value_currency) {
      const invCurr = toStr(extracted.currency);
      if (invCurr && invCurr !== job.cargo_value_currency) {
        mismatches.push({
          mismatch_type:   "invoice_currency_mismatch",
          severity:        "High",
          field_name:      "currency",
          expected_value:  job.cargo_value_currency,
          extracted_value: invCurr,
        });
      }
    }

    // 5. Customs: declared_value vs invoice total_invoice_value (>10%)
    if (documentType === "kastam_form") {
      const declared = toNum(extracted.declared_value);
      const invVal   = prev["total_invoice_value"]?.numeric ?? null;
      if (declared != null && invVal != null && invVal > 0) {
        const diff = Math.abs(declared - invVal) / invVal;
        if (diff > 0.1) {
          mismatches.push({
            mismatch_type:   "declared_value_vs_invoice",
            severity:        diff > 0.3 ? "High" : "Medium",
            field_name:      "declared_value",
            expected_value:  String(invVal),
            extracted_value: String(declared),
          });
        }
      }
    }

    // 6. Customs: HS code vs invoice HS code
    if (documentType === "kastam_form") {
      const custHs = toStr(extracted.hs_code);
      const invHs  = prev["hs_code"]?.value;
      if (custHs && invHs && custHs !== invHs) {
        mismatches.push({
          mismatch_type:   "hs_code_mismatch",
          severity:        "High",
          field_name:      "hs_code",
          expected_value:  invHs,
          extracted_value: custHs,
        });
      }
    }

    // 7. Packing list: gross_weight_kg vs prior extracted weight (>10%)
    if (documentType === "packing_list") {
      const plWeight  = toNum(extracted.gross_weight_kg);
      const jobWeight = prev["gross_weight_kg"]?.numeric ?? null;
      if (plWeight != null && jobWeight != null && jobWeight > 0) {
        const diff = Math.abs(plWeight - jobWeight) / jobWeight;
        if (diff > 0.1) {
          mismatches.push({
            mismatch_type:   "packing_list_weight_vs_job",
            severity:        diff > 0.3 ? "High" : "Medium",
            field_name:      "gross_weight_kg",
            expected_value:  String(jobWeight),
            extracted_value: String(plWeight),
          });
        }
      }
    }

    // 8 & 9. BL/AWB: route vs prior extracted route from other doc
    if (documentType === "bl_awb_do") {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const blOrigin  = toStr(extracted.origin_port);
      const blDest    = toStr(extracted.destination_port);
      const prevOrigin = prev["origin_port"]?.value;
      const prevDest   = prev["destination_port"]?.value;

      if (blOrigin && prevOrigin) {
        const n1 = norm(blOrigin), n2 = norm(prevOrigin);
        if (!n1.includes(n2) && !n2.includes(n1)) {
          mismatches.push({
            mismatch_type:   "bl_origin_vs_prior_doc",
            severity:        "Medium",
            field_name:      "origin_port",
            expected_value:  prevOrigin,
            extracted_value: blOrigin,
          });
        }
      }

      if (blDest && prevDest) {
        const n1 = norm(blDest), n2 = norm(prevDest);
        if (!n1.includes(n2) && !n2.includes(n1)) {
          mismatches.push({
            mismatch_type:   "bl_destination_vs_prior_doc",
            severity:        "Medium",
            field_name:      "destination_port",
            expected_value:  prevDest,
            extracted_value: blDest,
          });
        }
      }
    }

    // POD: missing signature
    if (documentType === "pod") {
      const sig = toStr(extracted.receiver_signature_available);
      if (sig === "no") {
        mismatches.push({
          mismatch_type:   "pod_signature_missing",
          severity:        "Medium",
          field_name:      "receiver_signature_available",
          expected_value:  "yes",
          extracted_value: "no",
        });
      }
    }
  } catch {
    // Mismatch detection is non-blocking — never crash the extraction
  }

  return mismatches;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  // Feature flag — default off
  if (process.env.ENABLE_LLM_DOCUMENT_EXTRACTION !== "true") {
    return NextResponse.json({
      error:   "disabled",
      message: "AI extraction not enabled. Set ENABLE_LLM_DOCUMENT_EXTRACTION=true and configure an API key.",
    }, { status: 503 });
  }

  const provider = process.env.DOCUMENT_EXTRACTION_PROVIDER ?? "OpenAI";
  const hasKey   =
    provider === "OpenAI" ? !!process.env.OPENAI_API_KEY :
    provider === "Claude" ? !!process.env.ANTHROPIC_API_KEY :
    false;

  if (!hasKey) {
    const keyName = provider === "Claude" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    return NextResponse.json({
      error:   "not_configured",
      message: `${provider} API key not configured. Add ${keyName} to environment.`,
    }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as {
    actor_id?:   string;
    actor_name?: string;
    actor_role?: string;
  };
  const { actor_id, actor_name, actor_role } = body;

  if (actor_role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const svc = svcClient();

  // Fetch document
  const { data: docRaw, error: docErr } = await svc
    .from("job_documents")
    .select("id, job_reference, document_type, file_name, storage_bucket, storage_path, llm_extraction_enabled")
    .eq("id", documentId)
    .single();

  if (docErr || !docRaw) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const doc = docRaw as {
    id:                     string;
    job_reference:          string;
    document_type:          string;
    file_name:              string;
    storage_bucket:         string;
    storage_path:           string;
    llm_extraction_enabled: boolean | null;
  };

  if (doc.llm_extraction_enabled === false) {
    return NextResponse.json({ error: "Extraction disabled for this document" }, { status: 422 });
  }

  const model   = provider === "OpenAI" ? "gpt-4o-mini" : "claude-opus-4-8";
  const schema  = buildSchema(doc.document_type);
  const startAt = new Date().toISOString();

  // Create extraction run
  const { data: runRaw, error: runErr } = await svc
    .from("document_extraction_runs")
    .insert({
      job_document_id:   documentId,
      job_reference:     doc.job_reference,
      document_type:     doc.document_type,
      provider,
      model_name:        model,
      extraction_status: "Processing",
      started_at:        startAt,
    })
    .select("id")
    .single();

  if (runErr || !runRaw) {
    return NextResponse.json({ error: "Failed to create extraction run" }, { status: 500 });
  }
  const runId = (runRaw as { id: string }).id;

  // Audit: started
  await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
    job_reference: doc.job_reference,
    action:        "document_extraction_started",
    actor_id:      actor_id   ?? null,
    actor_role:    "admin",
    actor_name:    actor_name ?? "Nexum Admin",
    description:   `AI extraction started for ${doc.document_type}: ${doc.file_name}`,
    metadata:      { document_id: documentId, provider, model, extraction_run_id: runId },
  }).catch(() => {});

  try {
    // Generate signed URL (300 s — enough for the LLM round-trip)
    const { data: signed, error: signErr } = await svc.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 300);

    if (signErr || !signed?.signedUrl) {
      throw new Error("Failed to generate signed URL for document");
    }

    // Call LLM
    const llmResult =
      provider === "OpenAI"
        ? await callOpenAI(signed.signedUrl, schema.prompt, model)
        : await callClaude(signed.signedUrl, schema.prompt, model);

    const extracted   = parseExtracted(llmResult.text);
    const confidence  = typeof extracted.confidence === "number"
      ? Math.min(1, Math.max(0, extracted.confidence))
      : 0.5;
    delete extracted.confidence;

    // Update extraction run
    await svc.from("document_extraction_runs").update({
      extraction_status: "Extracted",
      raw_response:      { text: llmResult.text, usage: llmResult.usage },
      structured_output: extracted,
      confidence_score:  confidence,
      completed_at:      new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }).eq("id", runId);

    // Upsert extracted fields — ai_extracted, is_verified=false (draft state)
    const fieldRows = schema.fieldKeys
      .filter(key => extracted[key] !== undefined && extracted[key] !== null && extracted[key] !== "")
      .map(key => {
        const val    = extracted[key];
        const isNum  = typeof val === "number";
        const isDate = typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val);
        return {
          job_document_id:     documentId,
          job_reference:       doc.job_reference,
          field_key:           key,
          field_label:         FIELD_LABELS[key] ?? key,
          field_value:         !isNum && !isDate ? String(val) : null,
          field_value_numeric: isNum ? (val as number) : null,
          field_value_date:    isDate ? (val as string) : null,
          extraction_method:   "ai_extracted",
          confidence_score:    confidence,
          extraction_run_id:   runId,
          is_verified:         false,
        };
      });

    if (fieldRows.length > 0) {
      await svc.from("job_document_extracted_fields")
        .upsert(fieldRows, { onConflict: "job_document_id,field_key" });
    }

    // Expanded mismatch detection — non-blocking
    const mismatches = await detectMismatches(svc, doc.job_reference, doc.document_type, extracted);

    if (mismatches.length > 0) {
      try {
        await svc.from("document_mismatch_flags").insert(
          mismatches.map(m => ({
            job_reference:   doc.job_reference,
            job_document_id: documentId,
            mismatch_type:   m.mismatch_type,
            severity:        m.severity,
            field_name:      m.field_name,
            expected_value:  m.expected_value,
            extracted_value: m.extracted_value,
            status:          "Open",
          }))
        );
      } catch { /* non-blocking */ }
    }

    // Update job_documents extraction metadata
    await svc.from("job_documents").update({
      extraction_provider:          provider,
      extraction_model:             model,
      extraction_confidence_score:  confidence,
      extraction_review_required:   true,
      extracted_at:                 new Date().toISOString(),
      extraction_warning:           confidence < 0.6
        ? "Low confidence — manual review recommended"
        : null,
    }).eq("id", documentId);

    // Audit: completed
    await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
      job_reference: doc.job_reference,
      action:        "document_extraction_completed",
      actor_id:      actor_id   ?? null,
      actor_role:    "admin",
      actor_name:    actor_name ?? "Nexum Admin",
      description:   `AI extracted ${fieldRows.length} field(s) from ${doc.document_type}: ${doc.file_name} (${provider} · ${(confidence * 100).toFixed(0)}% confidence)`,
      metadata:      {
        document_id:       documentId,
        document_type:     doc.document_type,
        provider,
        model,
        field_count:       fieldRows.length,
        mismatches_found:  mismatches.length,
        confidence_score:  confidence,
        extraction_run_id: runId,
      },
    }).catch(() => {});

    return NextResponse.json({
      extraction_run:      { id: runId, status: "Extracted", confidence_score: confidence },
      fields_extracted:    fieldRows.length,
      mismatches_detected: mismatches.length,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";

    try {
      await svc.from("document_extraction_runs").update({
        extraction_status: "Failed",
        error_message:     message,
        completed_at:      new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).eq("id", runId);
    } catch { /* best-effort */ }

    await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
      job_reference: doc.job_reference,
      action:        "document_extraction_failed",
      actor_id:      actor_id   ?? null,
      actor_role:    "admin",
      actor_name:    actor_name ?? "Nexum Admin",
      description:   `AI extraction failed for ${doc.document_type}: ${doc.file_name} — ${message}`,
      metadata:      { document_id: documentId, extraction_run_id: runId, error: message },
    }).catch(() => {});

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
