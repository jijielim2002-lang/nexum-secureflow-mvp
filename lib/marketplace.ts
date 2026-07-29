// ─── Nexum Marketplace v2 — types, field schemas & helpers ───────────────────

// ─── Constants ───────────────────────────────────────────────────────────────

export const SERVICE_CATEGORIES = [
  "Sea Freight",
  "Air Freight",
  "Courier",
  "Small Parcel",
  "Transport",
  "Console Truck",
  "Custom Broker",
] as const;

export type ServiceCategory = typeof SERVICE_CATEGORIES[number];

export const SERVICE_CATEGORY_ICON: Record<ServiceCategory, string> = {
  "Sea Freight":    "🚢",
  "Air Freight":    "✈️",
  "Courier":        "📦",
  "Small Parcel":   "📬",
  "Transport":      "🚛",
  "Console Truck":  "🏭",
  "Custom Broker":  "📋",
};

export const SERVICE_CATEGORY_DESC: Record<ServiceCategory, string> = {
  "Sea Freight":   "FCL / LCL ocean freight between ports",
  "Air Freight":   "Air cargo with weight-break rate cards",
  "Courier":       "Door-to-door courier, typically >5 kg",
  "Small Parcel":  "Parcel / e-commerce, typically ≤ 30 kg",
  "Transport":     "Point-to-point truck hire within country",
  "Console Truck": "Consolidation truck — warehouse to warehouse",
  "Custom Broker": "Import / export customs clearance & permit",
};

export const LISTING_STATUSES = ["Draft","Pending Review","Approved","Live","Rejected","Suspended","Expired"] as const;
export const ADMIN_REVIEW_STATUSES = ["Pending Review","Approved","Rejected"] as const;

export const RFQ_STATUSES = [
  "Draft",
  "Open for Quotation",
  "Quotes Received",
  "Customer Reviewing",
  "Provider Selected",
  "Converted to Job",
  "Expired",
  "Cancelled",
] as const;

export const QUOTE_STATUSES = [
  "Submitted",
  "Withdrawn",
  "Customer Shortlisted",
  "Selected",
  "Rejected",
  "Expired",
] as const;

// ─── Listing field schema (drives the wizard form) ────────────────────────────

export type FieldType = "text" | "textarea" | "number" | "select" | "toggle" | "date" | "rate_table";

export interface ListingField {
  key:         string;
  label:       string;
  type:        FieldType;
  options?:    string[];
  placeholder?: string;
  required?:   boolean;
  hint?:       string;
  /** Only show this field when sibling field key === value */
  showWhen?:   { key: string; value: string };
  span?:       "full" | "half";  // grid column span
}

// ── Sea Freight ──
export const SEA_FREIGHT_FIELDS: ListingField[] = [
  { key: "freight_type",      label: "Freight Type",             type: "select",  options: ["FCL","LCL"], required: true, span: "half" },
  { key: "country_of_origin", label: "Country of Origin",        type: "text",    required: true, placeholder: "e.g. Malaysia", span: "half" },
  { key: "country_of_destination", label: "Country of Destination", type: "text", required: true, placeholder: "e.g. China",    span: "half" },
  { key: "port_of_loading",   label: "Port of Loading",          type: "text",    required: true, placeholder: "e.g. Port Klang (PKL)", span: "half" },
  { key: "port_of_discharge", label: "Port of Discharge",        type: "text",    required: true, placeholder: "e.g. Yantian (YTN)",   span: "half" },
  { key: "carrier",           label: "Carrier / Shipping Line",  type: "text",    placeholder: "e.g. Maersk, MSC, ONE", span: "half" },
  { key: "transit_time_days", label: "Transit Time (Days)",      type: "number",  placeholder: "e.g. 7", span: "half" },
  { key: "routing",           label: "Routing / Via",            type: "text",    placeholder: "e.g. Direct / via Singapore", span: "half" },
  { key: "container_type",    label: "Container Type",           type: "select",  options: ["20GP","40GP","40HQ","20RF","40RF"], showWhen: { key: "freight_type", value: "FCL" }, span: "half" },
  { key: "lcl_unit",          label: "LCL Pricing Unit",         type: "select",  options: ["per CBM","per Kg","per CBM (min 1 CBM)"], showWhen: { key: "freight_type", value: "LCL" }, span: "half" },
  { key: "local_charges_included", label: "Local Charges Included", type: "toggle", span: "half" },
  { key: "free_time_origin",  label: "Free Time at Origin",      type: "text",    placeholder: "e.g. 7 days", span: "half" },
  { key: "free_time_destination", label: "Free Time at Destination", type: "text", placeholder: "e.g. 7 days", span: "half" },
  { key: "limitations",       label: "Limitations / Exclusions", type: "textarea", placeholder: "e.g. Excludes hazardous cargo, out-of-gauge, and live animals", span: "full" },
];

// ── Air Freight ──
export const AIR_FREIGHT_FIELDS: ListingField[] = [
  { key: "country_of_origin",      label: "Country of Origin",         type: "text",   required: true, placeholder: "e.g. Malaysia", span: "half" },
  { key: "country_of_destination", label: "Country of Destination",    type: "text",   required: true, placeholder: "e.g. United Kingdom", span: "half" },
  { key: "airport_of_loading",     label: "Airport of Loading (IATA)", type: "text",   required: true, placeholder: "e.g. KUL", span: "half" },
  { key: "airport_of_discharge",   label: "Airport of Discharge (IATA)", type: "text", required: true, placeholder: "e.g. LHR", span: "half" },
  { key: "carrier",                label: "Carrier / Airline",         type: "text",   placeholder: "e.g. MAS Kargo, Cathay Cargo", span: "half" },
  { key: "routing",                label: "Routing / Via",             type: "text",   placeholder: "e.g. Direct / via HKG", span: "half" },
  { key: "transit_time_days",      label: "Transit Time (Days)",       type: "number", placeholder: "e.g. 3", span: "half" },
  { key: "volumetric_divisor",     label: "Volumetric Divisor",        type: "select", options: ["5000","6000"], span: "half" },
  // Weight-break rates
  { key: "rate_min",       label: "Minimum Rate (flat)",               type: "number", placeholder: "0.00", hint: "Minimum charge per shipment", span: "half" },
  { key: "rate_minus_45",  label: "Rate < 45 kg (per kg)",            type: "number", placeholder: "0.00", span: "half" },
  { key: "rate_plus_45",   label: "Rate +45 kg (per kg)",             type: "number", placeholder: "0.00", span: "half" },
  { key: "rate_plus_100",  label: "Rate +100 kg (per kg)",            type: "number", placeholder: "0.00", span: "half" },
  { key: "rate_plus_500",  label: "Rate +500 kg (per kg)",            type: "number", placeholder: "0.00", span: "half" },
  { key: "rate_plus_1000", label: "Rate +1000 kg (per kg)",           type: "number", placeholder: "0.00", span: "half" },
  { key: "limitations",    label: "Limitations / Exclusions",         type: "textarea", placeholder: "e.g. General cargo only. No live animals, lithium batteries, or DG.", span: "full" },
];

// ── Courier ──
export const COURIER_FIELDS: ListingField[] = [
  { key: "country_of_origin",      label: "Country of Origin",      type: "text",   required: true, placeholder: "e.g. Malaysia", span: "half" },
  { key: "country_of_destination", label: "Country of Destination", type: "text",   required: true, placeholder: "e.g. Australia", span: "half" },
  { key: "service_level",          label: "Service Level",          type: "select", options: ["Economy","Express","Same Day","Next Day"], required: true, span: "half" },
  { key: "max_weight_per_parcel_kg", label: "Max Weight per Parcel (kg)", type: "number", placeholder: "e.g. 30", span: "half" },
  { key: "max_dimension",          label: "Max Dimensions (cm)",    type: "text",   placeholder: "e.g. 100 x 80 x 60 cm", span: "half" },
  { key: "pricing_unit",           label: "Pricing Unit",           type: "select", options: ["per kg","per parcel","per shipment"], span: "half" },
  { key: "remote_area_surcharge_note", label: "Remote Area Surcharge", type: "text", placeholder: "e.g. +RM 15 for postcode 9xxxx", span: "full" },
  { key: "limitations",            label: "Limitations",            type: "textarea", placeholder: "e.g. No lithium batteries, no liquids", span: "full" },
];

// ── Small Parcel ──
export const SMALL_PARCEL_FIELDS: ListingField[] = [
  { key: "country_of_origin",      label: "Country of Origin",      type: "text",   required: true, placeholder: "e.g. Malaysia", span: "half" },
  { key: "country_of_destination", label: "Country of Destination", type: "text",   required: true, placeholder: "e.g. Singapore", span: "half" },
  { key: "pickup_postcode",        label: "Pickup Postcode / Area",  type: "text",   placeholder: "e.g. 50000 (KL) or All Malaysia", span: "half" },
  { key: "delivery_postcode",      label: "Delivery Postcode / Area", type: "text",  placeholder: "e.g. All Singapore", span: "half" },
  { key: "service_level",          label: "Service Level",          type: "select", options: ["Economy","Express","Standard"], required: true, span: "half" },
  { key: "max_weight_per_parcel_kg", label: "Max Weight (kg)",      type: "number", placeholder: "e.g. 30", span: "half" },
  { key: "max_dimension",          label: "Max Dimensions (cm)",    type: "text",   placeholder: "e.g. 60 x 40 x 40 cm", span: "half" },
  { key: "pricing_unit",           label: "Pricing Unit",           type: "select", options: ["per kg","per parcel","per 500g"], span: "half" },
  { key: "remote_area_surcharge_note", label: "Remote Area / East Malaysia Note", type: "text", placeholder: "e.g. +RM 5 surcharge for Sabah/Sarawak", span: "full" },
  { key: "limitations",            label: "Limitations",            type: "textarea", placeholder: "e.g. No hazardous items", span: "full" },
];

// ── Transport ──
export const TRANSPORT_FIELDS: ListingField[] = [
  { key: "country_of_origin",         label: "Country",             type: "text",   required: true, placeholder: "e.g. Malaysia", span: "half" },
  { key: "pickup_area",               label: "Pickup Area / State", type: "text",   required: true, placeholder: "e.g. Klang Valley", span: "half" },
  { key: "delivery_area",             label: "Delivery Area / State", type: "text", required: true, placeholder: "e.g. Johor Bahru", span: "half" },
  { key: "truck_size",                label: "Truck Size",          type: "select", options: ["1 Ton","3 Ton","5 Ton","8 Ton","10 Ton","40 Foot Trailer"], required: true, span: "half" },
  { key: "truck_type",                label: "Truck Body Type",     type: "select", options: ["Box Truck","Open Truck","Crane Truck","Side Curtain","Bonded Truck","Refrigerated Truck"], required: true, span: "half" },
  { key: "pricing_unit",              label: "Pricing Unit",        type: "select", options: ["per trip","per day","per kg","per km"], span: "half" },
  { key: "loading_unloading_included", label: "Loading / Unloading Included", type: "toggle", span: "half" },
  { key: "manpower_included",         label: "Manpower Included",   type: "toggle", span: "half" },
  { key: "waiting_time_charge",       label: "Waiting Time Charge", type: "text",   placeholder: "e.g. RM 50/hr after first 30 min free", span: "half" },
  { key: "limitations",               label: "Limitations",         type: "textarea", placeholder: "e.g. General cargo only. No hazmat.", span: "full" },
];

// ── Console Truck ──
export const CONSOLE_TRUCK_FIELDS: ListingField[] = [
  { key: "country_of_origin",        label: "Origin Country",           type: "text",   required: true, placeholder: "e.g. Malaysia", span: "half" },
  { key: "country_of_destination",   label: "Destination Country",      type: "text",   required: true, placeholder: "e.g. Thailand", span: "half" },
  { key: "origin_warehouse",         label: "Origin Warehouse / Hub",   type: "text",   required: true, placeholder: "e.g. Klang Warehouse, Selangor", span: "half" },
  { key: "origin_postcode",          label: "Origin Postcode",          type: "text",   placeholder: "e.g. 41000", span: "half" },
  { key: "destination_warehouse",    label: "Destination Warehouse / Hub", type: "text", required: true, placeholder: "e.g. Lat Krabang Warehouse, Bangkok", span: "half" },
  { key: "destination_postcode",     label: "Destination Postcode",     type: "text",   placeholder: "e.g. 10520", span: "half" },
  { key: "schedule",                 label: "Departure Schedule",       type: "text",   required: true, placeholder: "e.g. Every Monday & Thursday", span: "half" },
  { key: "cutoff_time",              label: "Cargo Cutoff Time",        type: "text",   required: true, placeholder: "e.g. Friday 5:00 PM", span: "half" },
  { key: "transit_time_days",        label: "Transit Time (Days)",      type: "number", placeholder: "e.g. 3", span: "half" },
  { key: "pricing_unit",             label: "Pricing Unit",             type: "select", options: ["per kg","per CBM","per pallet","per carton"], required: true, span: "half" },
  { key: "minimum_charge",           label: "Minimum Charge",           type: "number", placeholder: "e.g. 50.00", span: "half" },
  { key: "max_weight_per_piece",     label: "Max Weight per Piece (kg)", type: "number", placeholder: "e.g. 500", span: "half" },
  { key: "max_dimension_per_piece",  label: "Max Dimension per Piece",  type: "text",   placeholder: "e.g. 120 x 100 x 100 cm", span: "half" },
  { key: "limitations",              label: "Limitations",              type: "textarea", placeholder: "e.g. General cargo only. No hazardous, no liquid.", span: "full" },
];

// ── Custom Broker ──
export const CUSTOM_BROKER_FIELDS: ListingField[] = [
  { key: "country",                       label: "Country",                       type: "text",   required: true, placeholder: "e.g. Malaysia", span: "half" },
  { key: "clearance_station",             label: "Clearance Station / Port",      type: "text",   required: true, placeholder: "e.g. Port Klang, KLIA, JB CIQ", span: "half" },
  { key: "import_export",                 label: "Import / Export",               type: "select", options: ["Import","Export","Both"], required: true, span: "half" },
  { key: "declaration_type",              label: "Declaration Type(s)",           type: "text",   required: true, placeholder: "e.g. K1, K2, K8 or All", span: "half" },
  { key: "pricing_unit",                  label: "Pricing Unit",                  type: "select", options: ["per declaration","per HS code","per invoice","per shipment","per permit"], required: true, span: "half" },
  { key: "permit_handling_available",     label: "Permit Handling (AP / OGA)",    type: "toggle", span: "half" },
  { key: "inspection_support_available",  label: "Customs Inspection Support",    type: "toggle", span: "half" },
  { key: "document_checking_included",    label: "Document Checking Included",    type: "toggle", span: "half" },
  { key: "disbursement_handling_available", label: "Disbursement / Duty Payment Handling", type: "toggle", span: "half" },
  { key: "limitations",                   label: "Limitations / Notes",           type: "textarea", placeholder: "e.g. Complex permits require separate quotation", span: "full" },
];

export const CATEGORY_FIELDS: Record<ServiceCategory, ListingField[]> = {
  "Sea Freight":   SEA_FREIGHT_FIELDS,
  "Air Freight":   AIR_FREIGHT_FIELDS,
  "Courier":       COURIER_FIELDS,
  "Small Parcel":  SMALL_PARCEL_FIELDS,
  "Transport":     TRANSPORT_FIELDS,
  "Console Truck": CONSOLE_TRUCK_FIELDS,
  "Custom Broker": CUSTOM_BROKER_FIELDS,
};

/** Categories where "price" is a single rate (goes in Step 3 pricing) */
export const SINGLE_PRICE_CATEGORIES: ServiceCategory[] = [
  "Sea Freight","Courier","Small Parcel","Transport","Console Truck","Custom Broker",
];
/** Categories where pricing = weight-break table (Air Freight) — price in detail_json */
export const RATE_TABLE_CATEGORIES: ServiceCategory[] = ["Air Freight"];

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ServiceListing {
  id:                  string;
  listing_reference:   string;
  provider_company_id: string;
  created_by:          string;
  service_category:    ServiceCategory;
  listing_title:       string;
  description:         string | null;
  cargo_type:          string;
  status:              string;
  currency:            string;
  validity_from:       string | null;
  validity_to:         string | null;
  remarks:             string | null;
  admin_review_status: string;
  review_note:         string | null;
  reviewed_at:         string | null;
  created_at:          string;
  updated_at:          string;
  // Joined
  provider_company?:   { name: string; country: string | null } | null;
  detail_json?:        Record<string, unknown> | null;
}

export interface MarketplaceRFQ {
  id:                      string;
  rfq_reference:           string;
  customer_company_id:     string;
  created_by:              string;
  service_category:        string;
  origin_country:          string | null;
  destination_country:     string | null;
  origin_location:         string | null;
  destination_location:    string | null;
  cargo_description:       string | null;
  cargo_type:              string;
  weight_kg:               number | null;
  volume_cbm:              number | null;
  quantity:                string | null;
  ready_date:              string | null;
  target_delivery_date:    string | null;
  special_requirements:    string | null;
  quote_deadline:          string | null;
  rfq_status:              string;
  customer_identity_masked: boolean;
  selected_quote_id:       string | null;
  converted_job_id:        string | null;
  created_at:              string;
  updated_at:              string;
}

export interface MarketplaceQuote {
  id:                  string;
  quote_reference:     string;
  rfq_id:              string;
  rfq_reference:       string;
  provider_company_id: string;
  quoted_by:           string;
  quote_amount:        number;
  currency:            string;
  pricing_breakdown:   Record<string, unknown>;
  transit_time_days:   number | null;
  validity_until:      string | null;
  terms_note:          string | null;
  remarks:             string | null;
  quote_status:        string;
  created_at:          string;
  updated_at:          string;
  // Joined for customer view
  provider_score?:     ProviderMarketplaceScore | null;
  provider_company?:   { name: string; country: string | null } | null;
}

export interface ProviderMarketplaceScore {
  provider_company_id:         string;
  completed_jobs:              number;
  on_time_rate:                number | null;
  average_response_time_hours: number | null;
  pod_upload_speed_days:       number | null;
  document_accuracy_rate:      number | null;
  dispute_rate:                number | null;
  cancellation_rate:           number | null;
  customer_rating:             number | null;
  nexum_verified:              boolean;
  score_updated_at:            string;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function listingStatusColor(status: string): string {
  switch (status) {
    case "Live":           return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "Approved":       return "border-cyan-500/30    bg-cyan-500/10    text-cyan-400";
    case "Pending Review": return "border-amber-500/30   bg-amber-500/10   text-amber-400";
    case "Rejected":       return "border-red-500/30     bg-red-500/10     text-red-400";
    case "Suspended":      return "border-orange-500/30  bg-orange-500/10  text-orange-400";
    case "Expired":        return "border-slate-600      bg-slate-800/40   text-slate-500";
    default:               return "border-slate-600      bg-slate-800/40   text-slate-400";   // Draft
  }
}

export function rfqStatusColor(status: string): string {
  switch (status) {
    case "Open for Quotation": return "border-blue-500/30    bg-blue-500/10    text-blue-400";
    case "Quotes Received":    return "border-purple-500/30  bg-purple-500/10  text-purple-400";
    case "Customer Reviewing": return "border-amber-500/30   bg-amber-500/10   text-amber-400";
    case "Provider Selected":  return "border-cyan-500/30    bg-cyan-500/10    text-cyan-400";
    case "Converted to Job":   return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "Expired":
    case "Cancelled":          return "border-red-500/30     bg-red-500/10     text-red-400";
    default:                   return "border-slate-600      bg-slate-800/40   text-slate-400";
  }
}

export function quoteStatusColor(status: string): string {
  switch (status) {
    case "Selected":            return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "Customer Shortlisted":return "border-blue-500/30    bg-blue-500/10    text-blue-400";
    case "Submitted":           return "border-purple-500/30  bg-purple-500/10  text-purple-400";
    case "Rejected":
    case "Withdrawn":           return "border-red-500/30     bg-red-500/10     text-red-400";
    default:                   return "border-slate-600      bg-slate-800/40   text-slate-400";
  }
}

export function formatAmount(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function starRating(rating: number | null): string {
  if (!rating) return "—";
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - half);
}
