// ─── Nexum Extraction Engine v1 — LLM Client ─────────────────────────────────
// Sends EXTRACTED TEXT (not raw PDF) to LLM — dramatically cheaper than
// sending the full PDF file via vision API.
//
// Primary:   OpenAI gpt-4o-mini  ($0.15/1M in, $0.60/1M out)
// Secondary: Anthropic claude-3-5-haiku ($0.80/1M in, $4/1M out)
// Keys are server-side only — never exposed to browser.

import type { DocumentType, ExtractedFields } from "./types";
import { estimateCost } from "./types";
import { truncateForLLM } from "./pdf-text";

export interface LLMExtractionResult {
  fields: ExtractedFields;
  confidence: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string;
  provider: "openai" | "anthropic";
  ai_unavailable?: boolean;
}

// ─── Schema prompts ────────────────────────────────────────────────────────────

function buildPrompt(documentType: DocumentType): string {
  const schemas: Record<DocumentType, string> = {
    "Commercial Invoice": `{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "seller_name": "string",
  "buyer_name": "string",
  "currency": "USD|MYR|SGD|EUR|etc",
  "total_amount": "numeric string",
  "gross_weight_kg": "numeric string",
  "net_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "carton_count": "numeric string",
  "hs_code": "string",
  "bl_awb_number": "string",
  "confidence_score": 0-100
}`,
    "Packing List": `{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "seller_name": "string",
  "buyer_name": "string",
  "gross_weight_kg": "numeric string",
  "net_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "carton_count": "numeric string",
  "confidence_score": 0-100
}`,
    "Bill of Lading": `{
  "bl_awb_number": "string",
  "container_number": "string",
  "vessel_name": "string",
  "voyage_number": "string",
  "shipper_name": "string",
  "consignee_name": "string",
  "port_of_loading": "string",
  "port_of_discharge": "string",
  "gross_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "carton_count": "numeric string",
  "confidence_score": 0-100
}`,
    "Air Waybill": `{
  "bl_awb_number": "string",
  "flight_number": "string",
  "shipper_name": "string",
  "consignee_name": "string",
  "airport_origin": "string",
  "airport_destination": "string",
  "gross_weight_kg": "numeric string",
  "volume_cbm": "numeric string",
  "confidence_score": 0-100
}`,
    "Kastam Form": `{
  "permit_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "shipper_name": "string",
  "consignee_name": "string",
  "hs_code": "string",
  "customs_value": "numeric string",
  "duty_amount": "numeric string",
  "tax_amount": "numeric string",
  "gross_weight_kg": "numeric string",
  "confidence_score": 0-100
}`,
    "Duty Invoice": `{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "currency": "string",
  "duty_amount": "numeric string",
  "tax_amount": "numeric string",
  "permit_number": "string",
  "hs_code": "string",
  "customs_value": "numeric string",
  "confidence_score": 0-100
}`,
    "Provider Invoice": `{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "provider_name": "string",
  "customer_name": "string",
  "currency": "string",
  "total_amount": "numeric string",
  "job_value": "numeric string",
  "bl_awb_number": "string",
  "container_number": "string",
  "service_type": "string",
  "confidence_score": 0-100
}`,
    "Payment Slip": `{
  "payment_reference": "string",
  "invoice_date": "YYYY-MM-DD",
  "currency": "string",
  "total_amount": "numeric string",
  "confidence_score": 0-100
}`,
    "Delivery Order": `{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "consignee_name": "string",
  "container_number": "string",
  "bl_awb_number": "string",
  "confidence_score": 0-100
}`,
    "Proof of Delivery": `{
  "invoice_date": "YYYY-MM-DD",
  "consignee_name": "string",
  "bl_awb_number": "string",
  "confidence_score": 0-100
}`,
    "Other": `{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "total_amount": "numeric string",
  "currency": "string",
  "confidence_score": 0-100
}`,
  };
  return schemas[documentType] ?? schemas["Other"];
}

const SYSTEM_PROMPT = `You are a trade document data extraction expert.
Extract structured data from the document text provided.
Return ONLY valid JSON matching the schema. No explanation, no markdown code fences.
If a field is not found, use null. Set confidence_score (0-100) based on extraction quality.`;

// ─── OpenAI text extraction (gpt-4o-mini — cheapest capable model) ────────────

export async function extractWithOpenAIText(
  text: string,
  documentType: DocumentType,
): Promise<LLMExtractionResult> {
  const schema   = buildPrompt(documentType);
  const truncated = truncateForLLM(text, 3500);

  const body = {
    model: "gpt-4o-mini",
    max_tokens: 800,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Document type: ${documentType}\n\nExtract these fields:\n${schema}\n\nDocument text:\n${truncated}`,
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const rawContent: string = json?.choices?.[0]?.message?.content ?? "{}";
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let fields: ExtractedFields = {};
  try { fields = JSON.parse(cleaned); } catch { fields = { raw_response: rawContent }; }

  const inputTokens  = json?.usage?.prompt_tokens     ?? 0;
  const outputTokens = json?.usage?.completion_tokens  ?? 0;
  const cost_usd     = estimateCost("gpt-4o-mini", inputTokens, outputTokens);

  const confidence = typeof fields.confidence_score === "number"
    ? fields.confidence_score
    : parseFloat(String(fields.confidence_score ?? "0")) || 0;

  return {
    fields,
    confidence,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd,
    model: "gpt-4o-mini",
    provider: "openai",
  };
}

// ─── Anthropic text extraction (claude-3-5-haiku — for secondary/critical) ────

export async function extractWithAnthropicText(
  text: string,
  documentType: DocumentType,
): Promise<LLMExtractionResult> {
  const schema    = buildPrompt(documentType);
  const truncated = truncateForLLM(text, 3500);
  const model     = "claude-3-5-haiku-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Document type: ${documentType}\n\nExtract these fields:\n${schema}\n\nDocument text:\n${truncated}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Detect account-level issues (disabled org, low credit) — mark as unavailable
    const isAccountIssue =
      errText.includes("credit balance") ||
      errText.includes("organization has been disabled") ||
      errText.includes("account has been disabled") ||
      res.status === 403;
    if (isAccountIssue) {
      const err = new Error("Anthropic unavailable: " + errText.slice(0, 120)) as Error & { ai_unavailable: boolean };
      err.ai_unavailable = true;
      throw err;
    }
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const rawContent: string = json?.content?.[0]?.text ?? "{}";
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let fields: ExtractedFields = {};
  try { fields = JSON.parse(cleaned); } catch { fields = { raw_response: rawContent }; }

  const inputTokens  = json?.usage?.input_tokens  ?? 0;
  const outputTokens = json?.usage?.output_tokens ?? 0;
  const cost_usd     = estimateCost("claude-3-5-haiku-20241022", inputTokens, outputTokens);

  const confidence = typeof fields.confidence_score === "number"
    ? fields.confidence_score
    : parseFloat(String(fields.confidence_score ?? "0")) || 0;

  return {
    fields,
    confidence,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd,
    model,
    provider: "anthropic",
  };
}
