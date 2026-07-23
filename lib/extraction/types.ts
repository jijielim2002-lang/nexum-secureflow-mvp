// ─── Nexum Extraction Engine v1 — Shared Types ────────────────────────────────

export type DocumentType =
  | "Commercial Invoice"
  | "Packing List"
  | "Kastam Form"
  | "Bill of Lading"
  | "Air Waybill"
  | "Delivery Order"
  | "Payment Slip"
  | "Proof of Delivery"
  | "Provider Invoice"
  | "Duty Invoice"
  | "Other";

export type ExtractionProvider =
  | "pdf_text"
  | "ocr"
  | "vision"
  | "template"
  | "openai"
  | "anthropic"
  | "manual";

export interface ExtractionStageResult {
  stage: ExtractionProvider;
  label: string;
  status: "success" | "skipped" | "failed" | "unavailable";
  confidence?: number;
  cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
  reason?: string;
}

export interface ExtractedFields {
  // Invoice / reference
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  // Parties
  seller_name?: string | null;
  buyer_name?: string | null;
  shipper_name?: string | null;
  consignee_name?: string | null;
  customer_name?: string | null;
  provider_name?: string | null;
  // Money
  currency?: string | null;
  total_amount?: string | null;
  subtotal?: string | null;
  tax_amount?: string | null;
  duty_amount?: string | null;
  job_value?: string | null;
  // Logistics refs
  bl_awb_number?: string | null;
  container_number?: string | null;
  vessel_name?: string | null;
  voyage_number?: string | null;
  flight_number?: string | null;
  // Ports / airports
  port_of_loading?: string | null;
  port_of_discharge?: string | null;
  airport_origin?: string | null;
  airport_destination?: string | null;
  // Cargo
  gross_weight_kg?: string | null;
  net_weight_kg?: string | null;
  volume_cbm?: string | null;
  carton_count?: string | null;
  cargo_description?: string | null;
  // Customs
  hs_code?: string | null;
  customs_value?: string | null;
  permit_number?: string | null;
  // Payment
  payment_reference?: string | null;
  // Other
  service_type?: string | null;
  route?: string | null;
  confidence_score?: number;
  [key: string]: unknown;
}

export interface ExtractionEngineResult {
  document_type: DocumentType;
  type_confidence: number;
  fields: ExtractedFields;
  confidence_score: number;   // 0–100
  raw_text: string;
  text_length: number;
  stages: ExtractionStageResult[];
  llm_used: boolean;
  dual_llm_used: boolean;
  total_cost_usd: number;
  primary_provider: ExtractionProvider;
  model_used?: string;
  needs_review: boolean;
  manual_required: boolean;
  ai_unavailable: boolean;    // true when LLM credits exhausted
  extraction_mode: string;    // "cost_controlled" | "full_llm"
}

// Cost rates (USD per 1 million tokens)
export const LLM_COSTS = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o":      { input: 2.50, output: 10.00 },
  "claude-3-5-haiku-20241022": { input: 0.80, output: 4.00 },
  "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
} as const;

export function estimateCost(
  model: keyof typeof LLM_COSTS,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = LLM_COSTS[model];
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}
