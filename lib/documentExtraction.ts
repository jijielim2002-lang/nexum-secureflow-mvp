// ─── Document types ───────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  "Commercial Invoice",
  "Packing List",
  "Bill of Lading",
  "Airway Bill",
  "Form E",
  "Custom Form",
  "Payment Slip",
  "Purchase Order",
  "Delivery Order",
  "Permit / License",
  "Inspection Report",
  "Other",
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

// Types that have simulated extraction support
export const EXTRACTABLE_TYPES = new Set([
  "Commercial Invoice",
  "Packing List",
  "Bill of Lading",
  "Airway Bill",
  "Form E",
  "Custom Form",
  "Payment Slip",
  "Purchase Order",
]);

// ─── Field definitions ────────────────────────────────────────────────────────

export interface FieldDef {
  key:   string;
  label: string;
  type:  "text" | "number" | "date";
}

export const FIELD_DEFS: Partial<Record<string, FieldDef[]>> = {
  "Commercial Invoice": [
    { key: "seller_name",            label: "Seller Name",            type: "text"   },
    { key: "seller_country",         label: "Seller Country",         type: "text"   },
    { key: "seller_address",         label: "Seller Address",         type: "text"   },
    { key: "manufacturer",           label: "Manufacturer",           type: "text"   },
    { key: "buyer_name",             label: "Buyer Name",             type: "text"   },
    { key: "invoice_no",             label: "Invoice No.",            type: "text"   },
    { key: "invoice_date",           label: "Invoice Date",           type: "date"   },
    { key: "currency",               label: "Currency",               type: "text"   },
    { key: "invoice_value",          label: "Invoice Value",          type: "number" },
    { key: "commodity_description",  label: "Commodity Description",  type: "text"   },
    { key: "quantity",               label: "Quantity",               type: "text"   },
    { key: "unit_price",             label: "Unit Price",             type: "number" },
    { key: "incoterm",               label: "Incoterm",               type: "text"   },
    { key: "origin_country",         label: "Origin Country",         type: "text"   },
    { key: "hs_code",                label: "HS Code",                type: "text"   },
    { key: "payment_terms",          label: "Payment Terms",          type: "text"   },
  ],
  "Packing List": [
    { key: "package_count",      label: "Package Count",       type: "number" },
    { key: "gross_weight",       label: "Gross Weight (kg)",   type: "number" },
    { key: "net_weight",         label: "Net Weight (kg)",     type: "number" },
    { key: "cbm",                label: "CBM",                 type: "number" },
    { key: "container_count",    label: "Container Count",     type: "number" },
    { key: "cargo_description",  label: "Cargo Description",   type: "text"   },
    { key: "marks_and_numbers",  label: "Marks & Numbers",     type: "text"   },
  ],
  "Bill of Lading": [
    { key: "bl_number",           label: "B/L No.",               type: "text" },
    { key: "booking_number",      label: "Booking No.",           type: "text" },
    { key: "shipper",             label: "Shipper",               type: "text" },
    { key: "consignee",           label: "Consignee",             type: "text" },
    { key: "notify_party",        label: "Notify Party",          type: "text" },
    { key: "shipping_line",       label: "Shipping Line",         type: "text" },
    { key: "vessel_name",         label: "Vessel Name",           type: "text" },
    { key: "voyage_number",       label: "Voyage No.",            type: "text" },
    { key: "port_of_loading",     label: "Port of Loading",       type: "text" },
    { key: "port_of_discharge",   label: "Port of Discharge",     type: "text" },
    { key: "transshipment_port",  label: "Transshipment Port",    type: "text" },
    { key: "container_number",    label: "Container No.",         type: "text" },
    { key: "seal_number",         label: "Seal No.",              type: "text" },
    { key: "freight_terms",       label: "Freight Terms",         type: "text" },
    { key: "etd",                 label: "ETD",                   type: "date" },
    { key: "eta",                 label: "ETA",                   type: "date" },
  ],
  "Airway Bill": [
    { key: "awb_number",          label: "AWB No.",             type: "text"   },
    { key: "mawb_number",         label: "MAWB No.",            type: "text"   },
    { key: "hawb_number",         label: "HAWB No.",            type: "text"   },
    { key: "shipper",             label: "Shipper",             type: "text"   },
    { key: "consignee",           label: "Consignee",           type: "text"   },
    { key: "airline",             label: "Airline",             type: "text"   },
    { key: "flight_number",       label: "Flight No.",          type: "text"   },
    { key: "origin_airport",      label: "Origin Airport",      type: "text"   },
    { key: "destination_airport", label: "Destination Airport", type: "text"   },
    { key: "gross_weight",        label: "Gross Weight (kg)",   type: "number" },
    { key: "etd",                 label: "ETD",                 type: "date"   },
    { key: "eta",                 label: "ETA",                 type: "date"   },
  ],
  "Payment Slip": [
    { key: "payer_name",             label: "Payer Name",              type: "text"   },
    { key: "payee_name",             label: "Payee Name",              type: "text"   },
    { key: "amount",                 label: "Amount",                  type: "number" },
    { key: "currency",               label: "Currency",                type: "text"   },
    { key: "payment_date",           label: "Payment Date",            type: "date"   },
    { key: "bank_reference",         label: "Bank Reference",          type: "text"   },
    { key: "transaction_reference",  label: "Transaction Reference",   type: "text"   },
    { key: "payment_type",           label: "Payment Type",            type: "text"   },
  ],
  "Purchase Order": [
    { key: "po_no",                   label: "PO No.",              type: "text"   },
    { key: "buyer_name",              label: "Buyer Name",          type: "text"   },
    { key: "supplier_name",           label: "Supplier Name",       type: "text"   },
    { key: "po_date",                 label: "PO Date",             type: "date"   },
    { key: "currency",                label: "Currency",            type: "text"   },
    { key: "total_value",             label: "Total Value",         type: "number" },
    { key: "delivery_terms",          label: "Delivery Terms",      type: "text"   },
    { key: "commodity_description",   label: "Commodity",           type: "text"   },
  ],
  "Form E": [
    { key: "form_e_number",           label: "Form E No.",                  type: "text" },
    { key: "issuing_country",         label: "Issuing Country",             type: "text" },
    { key: "exporter_name",           label: "Exporter Name",               type: "text" },
    { key: "exporter_address",        label: "Exporter Address",            type: "text" },
    { key: "importer_name",           label: "Importer Name",               type: "text" },
    { key: "importer_address",        label: "Importer Address",            type: "text" },
    { key: "importing_country",       label: "Importing Country",           type: "text" },
    { key: "transport_mode",          label: "Transport Mode",              type: "text" },
    { key: "vessel_flight",           label: "Vessel / Flight No.",         type: "text" },
    { key: "port_of_loading",         label: "Port of Loading",             type: "text" },
    { key: "port_of_discharge",       label: "Port of Discharge",           type: "text" },
    { key: "commodity_description",   label: "Commodity Description",       type: "text" },
    { key: "hs_code",                 label: "HS Code",                     type: "text" },
    { key: "origin_criterion",        label: "Origin Criterion (A/B/C/D)",  type: "text" },
    { key: "gross_weight",            label: "Gross Weight (kg)",           type: "number" },
    { key: "quantity",                label: "Quantity",                    type: "text" },
    { key: "invoice_no",              label: "Invoice No.",                 type: "text" },
    { key: "invoice_date",            label: "Invoice Date",                type: "date" },
    { key: "invoice_value",           label: "Invoice Value",               type: "number" },
    { key: "currency",                label: "Currency",                    type: "text" },
    { key: "issue_date",              label: "Issue Date",                  type: "date" },
    { key: "issuing_authority",       label: "Issuing Authority",           type: "text" },
  ],
  "Custom Form": [
    { key: "custom_form_number",      label: "Custom Form No.",             type: "text" },
    { key: "declaration_type",        label: "Declaration Type",            type: "text" },
    { key: "declarant_name",          label: "Declarant / Agent Name",      type: "text" },
    { key: "declarant_license",       label: "Declarant License No.",       type: "text" },
    { key: "importer_name",           label: "Importer Name",               type: "text" },
    { key: "importer_id",             label: "Importer ID / BRN",           type: "text" },
    { key: "exporter_name",           label: "Exporter Name",               type: "text" },
    { key: "exporter_country",        label: "Exporter Country",            type: "text" },
    { key: "origin_country",          label: "Country of Origin",           type: "text" },
    { key: "port_of_entry",           label: "Port of Entry",               type: "text" },
    { key: "transport_mode",          label: "Transport Mode",              type: "text" },
    { key: "vessel_name",             label: "Vessel / Flight Name",        type: "text" },
    { key: "bill_of_lading_no",       label: "B/L or AWB No.",              type: "text" },
    { key: "container_no",            label: "Container No.",               type: "text" },
    { key: "commodity_description",   label: "Commodity Description",       type: "text" },
    { key: "hs_code",                 label: "HS Code",                     type: "text" },
    { key: "quantity",                label: "Quantity",                    type: "text" },
    { key: "gross_weight",            label: "Gross Weight (kg)",           type: "number" },
    { key: "net_weight",              label: "Net Weight (kg)",             type: "number" },
    { key: "invoice_no",              label: "Invoice No.",                 type: "text" },
    { key: "invoice_value",           label: "Invoice Value",               type: "number" },
    { key: "currency",                label: "Currency",                    type: "text" },
    { key: "cif_value",               label: "CIF Value",                   type: "number" },
    { key: "customs_duty",            label: "Customs Duty",                type: "number" },
    { key: "sales_tax",               label: "Sales Tax / VAT / GST",       type: "number" },
    { key: "declaration_date",        label: "Declaration Date",            type: "date" },
    { key: "approval_date",           label: "Approval Date",               type: "date" },
    { key: "customs_office",          label: "Customs Office",              type: "text" },
  ],
};

// ─── Simulated sample extraction data ────────────────────────────────────────
// Representative placeholders keyed to match FIELD_DEFS exactly.

const SAMPLE_DATA: Partial<Record<string, Record<string, string>>> = {
  "Commercial Invoice": {
    seller_name:           "Shenzhen Electronics Manufacturing Co. Ltd",
    seller_country:        "China",
    seller_address:        "Block B, Futian Free Trade Zone, Shenzhen 518048, China",
    manufacturer:          "Shenzhen Electronics Manufacturing Co. Ltd",
    buyer_name:            "KL Import & Distribution Sdn Bhd",
    invoice_no:            "INV-2025-04821",
    invoice_date:          "2025-04-15",
    currency:              "USD",
    invoice_value:         "85000",
    commodity_description: "Electronic Components — Printed Circuit Boards (PCB)",
    quantity:              "500 PCS",
    unit_price:            "170",
    incoterm:              "FOB",
    origin_country:        "China",
    hs_code:               "8542.31",
    payment_terms:         "30 days after BL date",
  },
  "Packing List": {
    package_count:     "42",
    gross_weight:      "1850",
    net_weight:        "1620",
    cbm:               "12.4",
    container_count:   "1",
    cargo_description: "Electronic Components — PCB Boards in cartons",
    marks_and_numbers: "KL-PCB-2025 / 1-42",
  },
  "Bill of Lading": {
    bl_number:          "OOLU2025041500",
    booking_number:     "BKG-SZ-04821",
    shipper:            "Shenzhen Electronics Manufacturing Co. Ltd",
    consignee:          "KL Import & Distribution Sdn Bhd",
    notify_party:       "KL Import & Distribution Sdn Bhd",
    shipping_line:      "OOCL",
    vessel_name:        "EVER FORWARD",
    voyage_number:      "0142E",
    port_of_loading:    "Yantian, Shenzhen, China",
    port_of_discharge:  "Port Klang, Malaysia",
    transshipment_port: "",
    container_number:   "TCNU7392841",
    seal_number:        "SZ-220941",
    freight_terms:      "Prepaid",
    etd:                "2025-04-20",
    eta:                "2025-05-05",
  },
  "Airway Bill": {
    awb_number:          "232-48291047",
    mawb_number:         "232-48291047",
    hawb_number:         "",
    shipper:             "Beijing Tech Exports Ltd",
    consignee:           "KL Import & Distribution Sdn Bhd",
    airline:             "Malaysia Airlines Cargo",
    flight_number:       "MH382",
    origin_airport:      "PEK — Beijing Capital International",
    destination_airport: "KUL — Kuala Lumpur International",
    gross_weight:        "284",
    etd:                 "2025-04-22",
    eta:                 "2025-04-22",
  },
  "Payment Slip": {
    payer_name:            "KL Import & Distribution Sdn Bhd",
    payee_name:            "Nexum SecureFlow (Escrow)",
    amount:                "42500",
    currency:              "USD",
    payment_date:          "2025-04-18",
    bank_reference:        "TT-20250418-00293",
    transaction_reference: "TXN-00293",
    payment_type:          "Telegraphic Transfer (TT)",
  },
  "Purchase Order": {
    po_no:                 "PO-2025-0328",
    buyer_name:            "KL Import & Distribution Sdn Bhd",
    supplier_name:         "Shenzhen Electronics Manufacturing Co. Ltd",
    po_date:               "2025-03-28",
    currency:              "USD",
    total_value:           "85000",
    delivery_terms:        "FOB Shenzhen, Q2 2025",
    commodity_description: "PCB Electronic Components — 500 units",
  },
  "Form E": {
    form_e_number:         "E-MY-2025-048291",
    issuing_country:       "China",
    exporter_name:         "Shenzhen Electronics Manufacturing Co. Ltd",
    exporter_address:      "Block B, Futian Free Trade Zone, Shenzhen 518048, China",
    importer_name:         "KL Import & Distribution Sdn Bhd",
    importer_address:      "Level 12, Menara KL, Jalan Ampang, 50450 Kuala Lumpur, Malaysia",
    importing_country:     "Malaysia",
    transport_mode:        "Sea",
    vessel_flight:         "EVER FORWARD V.0142E",
    port_of_loading:       "Yantian, Shenzhen, China",
    port_of_discharge:     "Port Klang, Malaysia",
    commodity_description: "Printed Circuit Boards (PCB) — Electronic Components",
    hs_code:               "8542.31",
    origin_criterion:      "B",
    gross_weight:          "1850",
    quantity:              "500 PCS",
    invoice_no:            "INV-2025-04821",
    invoice_date:          "2025-04-15",
    invoice_value:         "85000",
    currency:              "USD",
    issue_date:            "2025-04-16",
    issuing_authority:     "China Council for the Promotion of International Trade (CCPIT)",
  },
  "Custom Form": {
    custom_form_number:    "K1-2025-PK-00293847",
    declaration_type:      "Import (K1)",
    declarant_name:        "Ace Forwarding Sdn Bhd",
    declarant_license:     "AF-MY-20193821",
    importer_name:         "KL Import & Distribution Sdn Bhd",
    importer_id:           "202001034821 (1234567-A)",
    exporter_name:         "Shenzhen Electronics Manufacturing Co. Ltd",
    exporter_country:      "China",
    origin_country:        "China",
    port_of_entry:         "Westport, Port Klang (MYPKG)",
    transport_mode:        "Sea",
    vessel_name:           "EVER FORWARD",
    bill_of_lading_no:     "OOLU2025041500",
    container_no:          "TCNU7392841",
    commodity_description: "Printed Circuit Boards (PCB) — Electronic Components",
    hs_code:               "8542.31.0000",
    quantity:              "500 PCS",
    gross_weight:          "1850",
    net_weight:            "1620",
    invoice_no:            "INV-2025-04821",
    invoice_value:         "85000",
    currency:              "USD",
    cif_value:             "88200",
    customs_duty:          "4410",
    sales_tax:             "5292",
    declaration_date:      "2025-05-06",
    approval_date:         "2025-05-07",
    customs_office:        "Royal Malaysian Customs — Port Klang",
  },
};

// ─── AI extraction prompts ────────────────────────────────────────────────────
// These are sent to GPT-4o as the user text alongside the document image.

export function getExtractionPrompt(documentType: string): string {
  const fields = FIELD_DEFS[documentType];
  if (!fields) return "";

  const fieldList = fields
    .map((f) => `  "${f.key}": "<${f.label}${f.type === "number" ? ", numeric string" : f.type === "date" ? ", YYYY-MM-DD" : ""}>"`)
    .join(",\n");

  return `You are extracting structured trade finance data from a ${documentType}.

Return ONLY a valid JSON object with exactly these keys. Use "" for any field you cannot find. Do NOT invent values. Dates must be in YYYY-MM-DD format. Numbers must be plain numeric strings (no currency symbols or commas).

Also include "_confidence": a number from 0 to 1 reflecting how certain you are about the overall extraction quality.

{
${fieldList},
  "_confidence": <0.0–1.0>
}`;
}

// ─── MIME type helpers ────────────────────────────────────────────────────────

export function getMimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf:  "application/pdf",
    png:  "image/png",
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    gif:  "image/gif",
    webp: "image/webp",
    tif:  "image/tiff",
    tiff: "image/tiff",
  };
  return map[ext] ?? "application/octet-stream";
}

export function isExtractableMime(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf"
  );
}

// ─── Shipment status detection ────────────────────────────────────────────────
// Determines the correct tracking_status based on ETD/ETA vs current date.

export type DetectedTrackingStatus =
  | "Booked" | "In Transit" | "Arrived" | "Delayed";

export function detectShipmentStatusFromDates(
  etd: string | null | undefined,
  eta: string | null | undefined,
): DetectedTrackingStatus {
  const now     = new Date();
  const etdDate = etd ? new Date(etd) : null;
  const etaDate = eta ? new Date(eta) : null;

  // Validate dates
  const etdValid = etdDate !== null && !isNaN(etdDate.getTime());
  const etaValid = etaDate !== null && !isNaN(etaDate.getTime());

  // No useful dates → default Booked
  if (!etdValid) return "Booked";

  // ETD in the future → not yet departed
  if (etdDate! > now) return "Booked";

  // ETD in the past — cargo has departed
  if (etaValid) {
    if (etaDate! > now) return "In Transit";   // ETA still ahead
    // ETA has passed → delayed (not yet delivered)
    return "Delayed";
  }

  // ETD past, no ETA
  return "In Transit";
}

export function calculateDelayDaysFromETA(eta: string | null | undefined): number {
  if (!eta) return 0;
  const etaDate = new Date(eta);
  if (isNaN(etaDate.getTime())) return 0;
  const now = new Date();
  if (now <= etaDate) return 0;
  return Math.floor((now.getTime() - etaDate.getTime()) / 86_400_000);
}

// ─── Tracking key extraction ──────────────────────────────────────────────────
// Returns a structured summary of the shipment identifiers found in verified data.

export type TrackingMode = "Sea Freight" | "Air Freight";

export interface TrackingKeyEntry {
  label: string;
  value: string;
}

export interface ExtractedTrackingResult {
  mode:      TrackingMode;
  action:    "created" | "updated";
  keys:      TrackingKeyEntry[];
  eta:       string | null;
  etd:       string | null;
  delayDays: number;
  status:    DetectedTrackingStatus;
}

export function extractTrackingKeys(
  documentType: string,
  verifiedData:  Record<string, string>,
): Pick<ExtractedTrackingResult, "mode" | "keys" | "eta" | "etd"> | null {
  const v = verifiedData;

  if (documentType === "Bill of Lading") {
    const keys: TrackingKeyEntry[] = [];
    if (v.bl_number)          keys.push({ label: "BL No.",     value: v.bl_number });
    if (v.booking_number)     keys.push({ label: "Booking",    value: v.booking_number });
    if (v.container_number)   keys.push({ label: "Container",  value: v.container_number });
    if (v.vessel_name)        keys.push({ label: "Vessel",     value: v.vessel_name });
    if (v.voyage_number)      keys.push({ label: "Voyage",     value: v.voyage_number });
    if (v.shipping_line)      keys.push({ label: "Line",       value: v.shipping_line });
    if (v.port_of_loading)    keys.push({ label: "POL",        value: v.port_of_loading });
    if (v.port_of_discharge)  keys.push({ label: "POD",        value: v.port_of_discharge });
    if (v.seal_number)        keys.push({ label: "Seal",       value: v.seal_number });
    if (keys.length === 0) return null;
    return { mode: "Sea Freight", keys, eta: v.eta || null, etd: v.etd || null };
  }

  if (documentType === "Airway Bill") {
    const keys: TrackingKeyEntry[] = [];
    if (v.awb_number)          keys.push({ label: "AWB No.",  value: v.awb_number });
    if (v.mawb_number)         keys.push({ label: "MAWB",     value: v.mawb_number });
    if (v.airline)             keys.push({ label: "Airline",  value: v.airline });
    if (v.flight_number)       keys.push({ label: "Flight",   value: v.flight_number });
    if (v.origin_airport)      keys.push({ label: "From",     value: v.origin_airport });
    if (v.destination_airport) keys.push({ label: "To",       value: v.destination_airport });
    if (keys.length === 0) return null;
    return { mode: "Air Freight", keys, eta: v.eta || null, etd: v.etd || null };
  }

  return null;
}

// ─── Extraction runner ────────────────────────────────────────────────────────

export type ExtractionSource = "ai" | "simulated";

export interface ExtractionResult {
  data:       Record<string, string>;
  confidence: number;
  source:     ExtractionSource;
}

export function runSimulatedExtraction(documentType: string): ExtractionResult | null {
  const sample = SAMPLE_DATA[documentType];
  if (!sample) return null;
  // Confidence varies per run: 0.82–0.96
  const raw = 0.82 + Math.random() * 0.14;
  const confidence = Math.round(raw * 100) / 100;
  return { data: { ...sample }, confidence, source: "simulated" };
}

// ─── Ontology mapping ─────────────────────────────────────────────────────────
// Maps verified extraction fields → trade_intelligence_profiles columns

export interface TIPUpdates {
  commodity_name?:          string;
  hs_code?:                 string;
  origin_country?:          string;
  destination_country?:     string;
  estimated_goods_value?:   number;
  incoterm?:                string;
}

export function getOntologyUpdates(
  documentType: string,
  verifiedData:  Record<string, string>,
): TIPUpdates {
  const u: TIPUpdates = {};

  if (documentType === "Commercial Invoice") {
    if (verifiedData.commodity_description) u.commodity_name        = verifiedData.commodity_description;
    if (verifiedData.hs_code)               u.hs_code               = verifiedData.hs_code;
    if (verifiedData.origin_country)        u.origin_country        = verifiedData.origin_country;
    if (verifiedData.incoterm)              u.incoterm              = verifiedData.incoterm;
    if (verifiedData.invoice_value) {
      const v = parseFloat(verifiedData.invoice_value);
      if (!isNaN(v) && v > 0)              u.estimated_goods_value = v;
    }
  }

  if (documentType === "Bill of Lading") {
    if (verifiedData.port_of_loading)   u.origin_country      = verifiedData.port_of_loading;
    if (verifiedData.port_of_discharge) u.destination_country = verifiedData.port_of_discharge;
  }

  if (documentType === "Airway Bill") {
    if (verifiedData.origin_airport)      u.origin_country      = verifiedData.origin_airport;
    if (verifiedData.destination_airport) u.destination_country = verifiedData.destination_airport;
  }

  return u;
}

// ─── Extraction row type (mirrors DB) ─────────────────────────────────────────

export interface ExtractionRow {
  id:                string;
  job_reference:     string;
  document_id:       string | null;
  document_type:     string;
  extraction_status: "Pending" | "Extracted" | "Verified" | "Rejected";
  extracted_data:    Record<string, string> | null;
  confidence_score:  number | null;
  extraction_source: ExtractionSource | null;  // "ai" | "simulated" — stored in DB
  verified_data:     Record<string, string> | null;
  verified_by:       string | null;
  verified_at:       string | null;
  created_at:        string;
  updated_at:        string;
  // joined from documents table
  documents?: {
    file_name:        string;
    file_path:        string;      // storage path — needed by the extract API
    mime_type:        string | null;
    uploaded_by_name: string;
    uploaded_by_role: string;
  } | null;
}
