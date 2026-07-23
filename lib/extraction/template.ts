// ─── Nexum Extraction Engine v1 — Template / Regex Extractor ─────────────────
// Extracts structured fields from raw text using regex patterns.
// Zero LLM cost. Covers ~70–80% of standard trade documents.

import type { DocumentType, ExtractedFields } from "./types";

export interface TemplateResult {
  fields: ExtractedFields;
  confidence: number; // 0–100
  matched_count: number;
  total_fields: number;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function first(text: string, ...patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] ?? m[0]).trim().replace(/\s+/g, " ");
  }
  return null;
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // YYYY/MM/DD
  const m2 = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  return raw;
}

function cleanAmount(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/,/g, "").trim();
}

// ─── Field patterns ────────────────────────────────────────────────────────────

const P = {
  // Invoice number — handles INV-0001, INV/2024/001, KUL-4029, JING HONG 1150709 etc.
  invoiceNo: [
    /(?:invoice\s*(?:no|number|#|num)[\s:.\-]*)([\w\-\/]+)/i,
    /(?:inv[\s#\.\-:]+)([\w\-\/]+)/i,
  ],

  // Date patterns
  date: [
    /(?:invoice\s*date|date\s*of\s*invoice)[\s:.\-]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
    /(?:date)[\s:.\-]*(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i,
    /(?:date)[\s:.\-]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
  ],

  // Currency + amount
  totalAmount: [
    /(?:total\s*amount|grand\s*total|amount\s*due|total\s*payable|total\s*invoice)[\s:.\-]*(USD|MYR|SGD|EUR|CNY|GBP|THB)?\s*([\d,]+\.?\d{0,2})/i,
    /(?:total)[\s:.\-]*(USD|MYR|SGD|EUR|CNY|GBP|THB)\s*([\d,]+\.?\d{0,2})/i,
  ],

  currency: [/(USD|MYR|SGD|EUR|CNY|GBP|THB|IDR|AUD)/],

  // Party names — grab the line after the label
  sellerName: [
    /(?:seller|shipper|exporter|from|issued\s*by)[\s:.\-]+([A-Z][A-Za-z0-9\s,\.&()]{3,60})/i,
  ],
  buyerName: [
    /(?:buyer|consignee|importer|bill\s*to|sold\s*to)[\s:.\-]+([A-Z][A-Za-z0-9\s,\.&()]{3,60})/i,
  ],

  // BL / AWB
  blNumber: [
    /(?:b\/l\s*(?:no|number)|bill\s*of\s*lading\s*(?:no|number))[\s:.\-]*([\w\-\/]+)/i,
    /(?:b\/l)[\s:.\-]*([\w\-\/]+)/i,
  ],
  awbNumber: [
    /(?:awb\s*(?:no|number)|air\s*way\s*bill\s*(?:no|number)|airway\s*bill)[\s:.\-]*([\d\-\/\s]{5,20})/i,
  ],

  // Container  ABCD1234567
  containerNo: [
    /(?:container\s*(?:no|number))[\s:.\-]*([A-Z]{4}\d{7})/i,
    /\b([A-Z]{4}\d{7})\b/,
  ],

  // Vessel & voyage
  vesselName: [
    /(?:vessel[\s:.\-]*name|m\.?v\.?|vessel)[\s:.\-]+([A-Z][A-Za-z0-9\s]{2,40})/i,
  ],
  voyageNo: [
    /(?:voyage\s*(?:no|number)|voy\.?)[\s:.\-]*([\w\-\/]+)/i,
  ],

  // Ports
  portOfLoading: [
    /(?:port\s*of\s*(?:loading|departure|origin)|pol)[\s:.\-]+([A-Za-z\s,]{3,40})/i,
  ],
  portOfDischarge: [
    /(?:port\s*of\s*(?:discharge|destination|delivery)|pod)[\s:.\-]+([A-Za-z\s,]{3,40})/i,
  ],

  // Airports
  airportOrigin: [
    /(?:airport\s*of\s*(?:departure|origin))[\s:.\-]+([A-Za-z\s,]{3,40})/i,
  ],
  airportDest: [
    /(?:airport\s*of\s*(?:destination|arrival))[\s:.\-]+([A-Za-z\s,]{3,40})/i,
  ],

  // Weight & dimensions
  grossWeight: [
    /(?:gross\s*weight)[\s:.\-]*([\d,\.]+)\s*(?:kg|kgs|kilogram)?/i,
  ],
  netWeight: [
    /(?:net\s*weight)[\s:.\-]*([\d,\.]+)\s*(?:kg|kgs|kilogram)?/i,
  ],
  volumeCBM: [
    /(?:(?:total\s*)?(?:cbm|m3|volume|measurement))[\s:.\-]*([\d,\.]+)/i,
  ],
  cartonCount: [
    /(?:(?:total\s*)?(?:cartons?|ctns?|packages?|pkgs?|pieces?|pcs))[\s:.\-]*([\d,]+)/i,
  ],

  // HS code
  hsCode: [
    /(?:hs\s*code|h\.s\.|tariff\s*(?:code|no))[\s:.\-]*([\d\.]{6,12})/i,
    /\b([\d]{4}\.[\d]{2}\.[\d]{2})\b/,
    /\b([\d]{8,10})\b/,
  ],

  // Permit
  permitNo: [
    /(?:permit\s*(?:no|number)|import\s*permit|export\s*permit|k[12389]\s*(?:no|number))[\s:.\-]*([\w\-\/]+)/i,
  ],

  // Customs / duty
  dutyAmount: [
    /(?:duty\s*(?:amount|payable|total)|customs\s*duty|import\s*duty)[\s:.\-]*(MYR|USD)?\s*([\d,\.]+)/i,
  ],
  taxAmount: [
    /(?:gst|sst|tax|vat)[\s:.\-]*(MYR|USD)?\s*([\d,\.]+)/i,
  ],

  // Payment ref
  paymentRef: [
    /(?:payment\s*(?:ref|reference|no)|ref\s*(?:no|number)|transaction\s*(?:id|no))[\s:.\-]*([\w\-\/]+)/i,
  ],
};

// ─── Per-document-type extractors ──────────────────────────────────────────────

function extractCommercialInvoice(text: string): Partial<ExtractedFields> {
  const totalMatch = text.match(
    /(?:total\s*amount|grand\s*total|amount\s*due|total\s*payable|total\s*invoice)[\s:.\-]*(USD|MYR|SGD|EUR|CNY|GBP|THB)?\s*([\d,]+\.?\d{0,2})/i,
  );
  return {
    invoice_number: first(text, ...P.invoiceNo),
    invoice_date:   normalizeDate(first(text, ...P.date)),
    seller_name:    first(text, ...P.sellerName),
    buyer_name:     first(text, ...P.buyerName),
    currency:       first(text, ...P.currency),
    total_amount:   cleanAmount(totalMatch ? totalMatch[2] : null),
    gross_weight_kg: cleanAmount(first(text, ...P.grossWeight)),
    net_weight_kg:   cleanAmount(first(text, ...P.netWeight)),
    volume_cbm:      cleanAmount(first(text, ...P.volumeCBM)),
    carton_count:    first(text, ...P.cartonCount),
    hs_code:         first(text, ...P.hsCode),
    bl_awb_number:  first(text, ...P.blNumber) ?? first(text, ...P.awbNumber),
  };
}

function extractPackingList(text: string): Partial<ExtractedFields> {
  return {
    invoice_number:  first(text, ...P.invoiceNo),
    invoice_date:    normalizeDate(first(text, ...P.date)),
    seller_name:     first(text, ...P.sellerName),
    buyer_name:      first(text, ...P.buyerName),
    gross_weight_kg: cleanAmount(first(text, ...P.grossWeight)),
    net_weight_kg:   cleanAmount(first(text, ...P.netWeight)),
    volume_cbm:      cleanAmount(first(text, ...P.volumeCBM)),
    carton_count:    first(text, ...P.cartonCount),
    bl_awb_number:  first(text, ...P.blNumber),
  };
}

function extractBillOfLading(text: string): Partial<ExtractedFields> {
  return {
    bl_awb_number:     first(text, ...P.blNumber),
    container_number:  first(text, ...P.containerNo),
    vessel_name:       first(text, ...P.vesselName),
    voyage_number:     first(text, ...P.voyageNo),
    shipper_name:      first(text, ...P.sellerName),
    consignee_name:    first(text, ...P.buyerName),
    port_of_loading:   first(text, ...P.portOfLoading),
    port_of_discharge: first(text, ...P.portOfDischarge),
    gross_weight_kg:   cleanAmount(first(text, ...P.grossWeight)),
    volume_cbm:        cleanAmount(first(text, ...P.volumeCBM)),
    carton_count:      first(text, ...P.cartonCount),
  };
}

function extractAirWaybill(text: string): Partial<ExtractedFields> {
  return {
    bl_awb_number:      first(text, ...P.awbNumber),
    flight_number:      first(text, /(?:flight\s*(?:no|number))[\s:.\-]*([\w\-]+)/i),
    shipper_name:       first(text, ...P.sellerName),
    consignee_name:     first(text, ...P.buyerName),
    airport_origin:     first(text, ...P.airportOrigin),
    airport_destination: first(text, ...P.airportDest),
    gross_weight_kg:    cleanAmount(first(text, ...P.grossWeight)),
    volume_cbm:         cleanAmount(first(text, ...P.volumeCBM)),
    carton_count:       first(text, ...P.cartonCount),
  };
}

function extractKastamForm(text: string): Partial<ExtractedFields> {
  return {
    permit_number:  first(text, ...P.permitNo),
    invoice_date:   normalizeDate(first(text, ...P.date)),
    hs_code:        first(text, ...P.hsCode),
    customs_value:  cleanAmount(first(text, /(?:customs\s*value|c\.i\.f\.|dutiable\s*value)[\s:.\-]*([\d,\.]+)/i)),
    duty_amount:    cleanAmount(first(text, ...P.dutyAmount)?.split(/\s+/).pop() ?? null),
    tax_amount:     cleanAmount(first(text, ...P.taxAmount)?.split(/\s+/).pop() ?? null),
    shipper_name:   first(text, ...P.sellerName),
    consignee_name: first(text, ...P.buyerName),
    gross_weight_kg: cleanAmount(first(text, ...P.grossWeight)),
  };
}

function extractDutyInvoice(text: string): Partial<ExtractedFields> {
  const dutyMatch = text.match(
    /(?:duty\s*(?:amount|payable|total)|customs\s*duty|import\s*duty)[\s:.\-]*(MYR|USD)?\s*([\d,\.]+)/i,
  );
  return {
    invoice_number: first(text, ...P.invoiceNo),
    invoice_date:   normalizeDate(first(text, ...P.date)),
    currency:       first(text, ...P.currency),
    duty_amount:    cleanAmount(dutyMatch ? dutyMatch[2] : null),
    tax_amount:     cleanAmount(first(text, ...P.taxAmount)?.split(/\s+/).pop() ?? null),
    permit_number:  first(text, ...P.permitNo),
    hs_code:        first(text, ...P.hsCode),
    customs_value:  cleanAmount(first(text, /(?:customs\s*value|dutiable\s*value)[\s:.\-]*([\d,\.]+)/i)),
  };
}

function extractProviderInvoice(text: string): Partial<ExtractedFields> {
  const totalMatch = text.match(
    /(?:total\s*amount|grand\s*total|amount\s*due|total\s*payable)[\s:.\-]*(USD|MYR|SGD|EUR|CNY|GBP|THB)?\s*([\d,]+\.?\d{0,2})/i,
  );
  return {
    invoice_number: first(text, ...P.invoiceNo),
    invoice_date:   normalizeDate(first(text, ...P.date)),
    provider_name:  first(text, ...P.sellerName),
    customer_name:  first(text, ...P.buyerName),
    currency:       first(text, ...P.currency),
    total_amount:   cleanAmount(totalMatch ? totalMatch[2] : null),
    job_value:      cleanAmount(totalMatch ? totalMatch[2] : null),
    bl_awb_number:  first(text, ...P.blNumber) ?? first(text, ...P.awbNumber),
    container_number: first(text, ...P.containerNo),
    service_type:   first(text, /(?:service\s*type|mode\s*of\s*transport|shipment\s*mode)[\s:.\-]+([A-Za-z\s]{3,30})/i),
  };
}

function extractPaymentSlip(text: string): Partial<ExtractedFields> {
  const amountMatch = text.match(
    /(?:amount\s*paid|payment\s*amount|total\s*paid|amount)[\s:.\-]*(USD|MYR|SGD|EUR|CNY|GBP|THB)?\s*([\d,]+\.?\d{0,2})/i,
  );
  return {
    payment_reference: first(text, ...P.paymentRef),
    invoice_date:      normalizeDate(first(text, ...P.date)),
    currency:          first(text, ...P.currency),
    total_amount:      cleanAmount(amountMatch ? amountMatch[2] : null),
  };
}

// ─── Main template extractor ────────────────────────────────────────────────────

export function templateExtract(
  text: string,
  documentType: DocumentType,
): TemplateResult {
  let raw: Partial<ExtractedFields>;

  switch (documentType) {
    case "Commercial Invoice":  raw = extractCommercialInvoice(text); break;
    case "Packing List":        raw = extractPackingList(text);        break;
    case "Bill of Lading":      raw = extractBillOfLading(text);       break;
    case "Air Waybill":         raw = extractAirWaybill(text);         break;
    case "Kastam Form":         raw = extractKastamForm(text);         break;
    case "Duty Invoice":        raw = extractDutyInvoice(text);        break;
    case "Provider Invoice":    raw = extractProviderInvoice(text);    break;
    case "Payment Slip":        raw = extractPaymentSlip(text);        break;
    default:
      // Generic — try common fields
      raw = {
        invoice_number: first(text, ...P.invoiceNo),
        invoice_date:   normalizeDate(first(text, ...P.date)),
        currency:       first(text, ...P.currency),
        total_amount:   cleanAmount(first(text, /(?:total|amount)[\s:.\-]*([\d,\.]+)/i)),
      };
  }

  // Count non-null fields
  const total_fields  = Object.keys(raw).length;
  const matched_count = Object.values(raw).filter((v) => v != null && v !== "").length;
  const confidence    = total_fields > 0
    ? Math.round((matched_count / total_fields) * 100)
    : 0;

  return {
    fields: raw as ExtractedFields,
    confidence,
    matched_count,
    total_fields,
  };
}
