import { supabase } from "./supabaseClient";
import { insertAuditLog } from "./auditLog";
import { SUPPLIER_AUDIT_ACTIONS } from "./supplierProfile";

// ─── Field mappings ───────────────────────────────────────────────────────────
// Maps verified extraction fields → target DB columns

interface FieldMapping {
  sourceKey:   string;  // key in verified_data
  targetTable: "trade_intelligence_profiles" | "secured_jobs";
  targetField: string;
}

const FIELD_MAPPINGS: Partial<Record<string, FieldMapping[]>> = {
  "Commercial Invoice": [
    { sourceKey: "commodity_description", targetTable: "trade_intelligence_profiles", targetField: "commodity_name" },
    { sourceKey: "hs_code",               targetTable: "trade_intelligence_profiles", targetField: "hs_code" },
    { sourceKey: "origin_country",        targetTable: "trade_intelligence_profiles", targetField: "origin_country" },
    { sourceKey: "incoterm",              targetTable: "trade_intelligence_profiles", targetField: "incoterm" },
    { sourceKey: "invoice_value",         targetTable: "trade_intelligence_profiles", targetField: "estimated_goods_value" },
  ],
  "Bill of Lading": [
    { sourceKey: "port_of_loading",   targetTable: "trade_intelligence_profiles", targetField: "origin_country" },
    { sourceKey: "port_of_discharge", targetTable: "trade_intelligence_profiles", targetField: "destination_country" },
  ],
  "Airway Bill": [
    { sourceKey: "origin_airport",      targetTable: "trade_intelligence_profiles", targetField: "origin_country" },
    { sourceKey: "destination_airport", targetTable: "trade_intelligence_profiles", targetField: "destination_country" },
  ],
  "Purchase Order": [
    { sourceKey: "commodity_description", targetTable: "trade_intelligence_profiles", targetField: "commodity_name" },
    { sourceKey: "total_value",           targetTable: "trade_intelligence_profiles", targetField: "estimated_goods_value" },
    { sourceKey: "delivery_terms",        targetTable: "trade_intelligence_profiles", targetField: "incoterm" },
  ],
};

// ─── Labels & key fields ──────────────────────────────────────────────────────

export const TIP_FIELD_LABELS: Record<string, string> = {
  commodity_name:           "Commodity Name",
  commodity_category:       "Commodity Category",
  hs_code:                  "HS Code",
  origin_country:           "Origin Country",
  destination_country:      "Destination Country",
  incoterm:                 "Incoterm",
  estimated_goods_value:    "Est. Goods Value",
  estimated_logistics_cost: "Est. Logistics Cost",
  estimated_duty_tax:       "Est. Duty / Tax",
  estimated_landed_cost:    "Est. Landed Cost",
  estimated_selling_price:  "Est. Selling Price",
  estimated_margin:         "Est. Margin",
  route_risk_level:         "Route Risk",
  payment_risk_level:       "Payment Risk",
  document_risk_level:      "Document Risk",
  overall_trade_risk:       "Overall Trade Risk",
  financing_readiness:      "Financing Readiness",
  inventory_urgency:        "Inventory Urgency",
  rescue_plan:              "Rescue Plan",
  recommended_action:       "Recommended Action",
};

// Fields that matter most for data completeness checks
export const KEY_TIP_FIELDS = [
  "commodity_name",
  "hs_code",
  "origin_country",
  "destination_country",
  "incoterm",
  "estimated_goods_value",
  "route_risk_level",
  "payment_risk_level",
  "overall_trade_risk",
  "financing_readiness",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuggestionRow {
  id:               string;
  job_reference:    string;
  extraction_id:    string | null;
  target_table:     string;
  target_field:     string;
  current_value:    string | null;
  suggested_value:  string;
  confidence_score: number;
  status:           "Pending" | "Approved" | "Rejected" | "Applied";
  reviewed_by:      string | null;
  reviewed_at:      string | null;
  created_at:       string;
  // Supabase join
  document_extractions?: { document_type: string } | null;
}

// ─── Pure: build suggestion candidates ───────────────────────────────────────

interface SuggestionCandidate {
  target_table:    string;
  target_field:    string;
  current_value:   string | null;
  suggested_value: string;
  auto_apply:      boolean; // true → field was empty + confidence ≥ 0.90
}

function buildSuggestions(
  documentType:    string,
  verifiedData:    Record<string, string>,
  confidenceScore: number,
  existingTIP:     Record<string, unknown> | null,
): SuggestionCandidate[] {
  const mappings = FIELD_MAPPINGS[documentType] ?? [];
  const result: SuggestionCandidate[] = [];

  for (const m of mappings) {
    const suggestedValue = verifiedData[m.sourceKey]?.trim();
    if (!suggestedValue) continue;

    // Read current value from TIP
    let currentValue: string | null = null;
    if (existingTIP && m.targetTable === "trade_intelligence_profiles") {
      const v = existingTIP[m.targetField];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        currentValue = String(v);
      }
    }

    // No suggestion needed if values already match (case-insensitive)
    if (currentValue?.toLowerCase().trim() === suggestedValue.toLowerCase().trim()) continue;

    const isEmpty  = !currentValue;
    const autoApply = isEmpty && confidenceScore >= 0.90;

    result.push({
      target_table:    m.targetTable,
      target_field:    m.targetField,
      current_value:   currentValue,
      suggested_value: suggestedValue,
      auto_apply:      autoApply,
    });
  }

  return result;
}

// ─── Async: generate suggestions, insert to DB, auto-apply where eligible ─────

export async function generateAndSaveSuggestions(
  jobReference:    string,
  extractionId:    string,
  documentType:    string,
  verifiedData:    Record<string, string>,
  confidenceScore: number,
  actorName:       string,
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Fetch existing TIP for comparison
  const { data: tipData } = await supabase
    .from("trade_intelligence_profiles")
    .select("*")
    .eq("job_reference", jobReference)
    .maybeSingle();

  const existingTIP = tipData as Record<string, unknown> | null;

  // 2. Build candidates (pure, no DB)
  const candidates = buildSuggestions(documentType, verifiedData, confidenceScore, existingTIP);
  if (candidates.length === 0) return;

  // 3. Insert all candidates as suggestion rows
  const rowsToInsert = candidates.map((c) => ({
    job_reference:    jobReference,
    extraction_id:    extractionId,
    target_table:     c.target_table,
    target_field:     c.target_field,
    current_value:    c.current_value,
    suggested_value:  c.suggested_value,
    confidence_score: confidenceScore,
    status:           c.auto_apply ? "Applied" : "Pending",
    reviewed_at:      c.auto_apply ? now : null,
    created_at:       now,
  }));

  await supabase.from("ontology_update_suggestions").insert(rowsToInsert);

  // 4. Auto-apply: write to TIP for empty fields with confidence ≥ 0.90
  const autoApply = candidates.filter((c) => c.auto_apply);
  if (autoApply.length > 0) {
    const tipUpdates: Record<string, unknown> = { updated_at: now };
    for (const c of autoApply) {
      if (c.target_table === "trade_intelligence_profiles") {
        tipUpdates[c.target_field] = c.suggested_value;
      }
    }

    if (!existingTIP) {
      await supabase
        .from("trade_intelligence_profiles")
        .insert({ job_reference: jobReference, ...tipUpdates, created_at: now });
    } else {
      await supabase
        .from("trade_intelligence_profiles")
        .update(tipUpdates)
        .eq("job_reference", jobReference);
    }

    insertAuditLog({
      job_reference: jobReference,
      actor_role:    "admin",
      actor_name:    actorName,
      action:        "ontology_updated_from_document",
      description:   `${autoApply.length} ontology field(s) auto-applied from verified ${documentType} (confidence ≥ 90%).`,
      metadata:      { document_type: documentType, auto_applied: autoApply.map((c) => c.target_field) },
    }).catch(() => {});
  }

  // 5. Log pending suggestions
  const pending = candidates.filter((c) => !c.auto_apply);
  if (pending.length > 0) {
    insertAuditLog({
      job_reference: jobReference,
      actor_role:    "admin",
      actor_name:    actorName,
      action:        "ontology_suggestions_created",
      description:   `${pending.length} ontology update suggestion(s) created from ${documentType} — admin review required.`,
      metadata:      { document_type: documentType, pending_fields: pending.map((c) => c.target_field) },
    }).catch(() => {});
  }
}

// ─── Async: apply a single suggestion to its target table ────────────────────

export async function applyOntologySuggestion(
  suggestion: SuggestionRow,
  actorId:    string | undefined,
  actorName:  string,
): Promise<{ error?: string }> {
  const now = new Date().toISOString();

  // 1. Write to target table
  if (suggestion.target_table === "trade_intelligence_profiles") {
    const { data: existing } = await supabase
      .from("trade_intelligence_profiles")
      .select("id")
      .eq("job_reference", suggestion.job_reference)
      .maybeSingle();

    const fieldUpdate = {
      [suggestion.target_field]: suggestion.suggested_value,
      updated_at: now,
    };

    let writeError;
    if (existing) {
      const { error } = await supabase
        .from("trade_intelligence_profiles")
        .update(fieldUpdate)
        .eq("job_reference", suggestion.job_reference);
      writeError = error;
    } else {
      const { error } = await supabase
        .from("trade_intelligence_profiles")
        .insert({ job_reference: suggestion.job_reference, ...fieldUpdate, created_at: now });
      writeError = error;
    }
    if (writeError) return { error: writeError.message };
  }

  // 2. Mark suggestion as Applied
  const { error: sugError } = await supabase
    .from("ontology_update_suggestions")
    .update({ status: "Applied", reviewed_by: actorId ?? null, reviewed_at: now })
    .eq("id", suggestion.id);

  if (sugError) return { error: sugError.message };

  // 3. Audit log
  insertAuditLog({
    job_reference: suggestion.job_reference,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        "ontology_update_applied",
    description:   `Ontology field "${TIP_FIELD_LABELS[suggestion.target_field] ?? suggestion.target_field}" updated from verified document extraction.`,
    metadata:      {
      target_table:    suggestion.target_table,
      target_field:    suggestion.target_field,
      previous_value:  suggestion.current_value,
      applied_value:   suggestion.suggested_value,
    },
  }).catch(() => {});

  return {};
}

// ─── Async: generate supplier suggestion from document extraction ──────────────
// Called after document extraction when seller_name, shipper, or supplier_name
// is found. Creates/finds a supplier_counterparty record and links to the job.

export async function generateAndSaveSupplierSuggestion(
  jobReference:    string,
  extractionId:    string,
  documentType:    string,
  verifiedData:    Record<string, string>,
  confidenceScore: number,
  actorName:       string,
): Promise<void> {
  // Determine supplier name from document type
  let supplierName: string | null = null;
  let supplierCountry: string | null = null;
  let supplierAddress: string | null = null;
  let relationshipType = "Seller";

  if (documentType === "Commercial Invoice") {
    supplierName    = verifiedData.seller_name    ?? null;
    supplierCountry = verifiedData.seller_country ?? verifiedData.origin_country ?? null;
    supplierAddress = verifiedData.seller_address ?? null;
    relationshipType = "Seller";
  } else if (documentType === "Bill of Lading" || documentType === "Airway Bill") {
    supplierName    = verifiedData.shipper ?? null;
    relationshipType = "Shipper";
  } else if (documentType === "Purchase Order") {
    supplierName    = verifiedData.supplier_name ?? null;
    relationshipType = "Seller";
  }

  if (!supplierName?.trim()) return; // No supplier name extractable from this document type

  const now = new Date().toISOString();

  // Check if this supplier already exists (case-insensitive name match)
  const { data: existing } = await supabase
    .from("supplier_counterparties")
    .select("id, supplier_name, supplier_status")
    .ilike("supplier_name", supplierName.trim())
    .maybeSingle();

  let supplierId: string;

  if (existing) {
    // Use existing supplier
    supplierId = existing.id;
  } else {
    // Create new supplier from extracted data
    const { data: newSupplier, error: createError } = await supabase
      .from("supplier_counterparties")
      .insert({
        supplier_name:    supplierName.trim(),
        supplier_country: supplierCountry ?? null,
        supplier_address: supplierAddress ?? null,
        hs_code:          verifiedData.hs_code ?? null,
        hs_code_description: verifiedData.commodity_description ?? null,
        supplier_status:  "New",
        risk_level:       "Medium",
        created_by_role:  "document_extraction",
        created_at:       now,
        updated_at:       now,
      })
      .select("id")
      .single();

    if (createError || !newSupplier) return;
    supplierId = newSupplier.id;

    insertAuditLog({
      job_reference: jobReference,
      actor_role:    "admin",
      actor_name:    actorName,
      action:        SUPPLIER_AUDIT_ACTIONS.supplier_extracted_from_document,
      description:   `Supplier "${supplierName.trim()}" extracted from ${documentType} (confidence ${(confidenceScore * 100).toFixed(0)}%). Supplier profile created — status: New. Admin verification required.`,
    }).catch(() => {});
  }

  // Check if link already exists for this job
  const { data: existingLink } = await supabase
    .from("job_supplier_links")
    .select("id")
    .eq("job_reference", jobReference)
    .eq("supplier_id", supplierId)
    .maybeSingle();

  if (!existingLink) {
    await supabase
      .from("job_supplier_links")
      .insert({
        job_reference:     jobReference,
        supplier_id:       supplierId,
        relationship_type: relationshipType,
        source:            "Document Extraction",
        confidence_score:  confidenceScore,
        created_at:        now,
      });

    insertAuditLog({
      job_reference: jobReference,
      actor_role:    "admin",
      actor_name:    actorName,
      action:        SUPPLIER_AUDIT_ACTIONS.supplier_linked_to_job,
      description:   `Supplier "${supplierName.trim()}" linked to job ${jobReference} as ${relationshipType} from ${documentType} (confidence ${(confidenceScore * 100).toFixed(0)}%). Source: Document Extraction.`,
    }).catch(() => {});
  }
}
