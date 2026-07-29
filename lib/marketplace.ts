// ─── Service Marketplace — types & helpers ────────────────────────────────────

export const SERVICE_TYPES = [
  "Freight & Logistics",
  "Customs Brokerage",
  "Trade Finance Support",
  "Legal & Compliance",
  "Inspection & Certification",
] as const;

export type ServiceType = typeof SERVICE_TYPES[number];

export const PRICING_MODELS = ["Fixed", "Per Shipment", "Hourly", "Quote on Request"] as const;

export const LISTING_STATUSES = [
  "Draft",
  "Pending Review",
  "Approved",
  "Rejected",
  "Suspended",
] as const;

export const REQUEST_STATUSES = [
  "Submitted",
  "Under Review",
  "Quoted",
  "Accepted",
  "In Progress",
  "Completed",
  "Cancelled",
] as const;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ServiceListing {
  id:                   string;
  listing_reference:    string;
  provider_company_id:  string;
  service_type:         ServiceType;
  title:                string;
  description:          string | null;
  service_scope:        string | null;
  service_modes:        string[] | null;
  certifications:       string[] | null;
  languages_supported:  string[] | null;
  pricing_model:        string | null;
  base_price:           number | null;
  currency:             string;
  commission_rate:      number | null;
  service_details:      Record<string, unknown> | null;
  listing_status:       string;
  admin_notes:          string | null;
  approved_at:          string | null;
  rejection_reason:     string | null;
  available_from:       string | null;
  available_until:      string | null;
  is_active:            boolean;
  created_at:           string;
  updated_at:           string;
  // Joined fields
  provider_company?:    { name: string; country: string | null } | null;
}

export interface ServiceCustomerRequest {
  id:                   string;
  request_reference:    string;
  listing_id:           string;
  customer_company_id:  string;
  provider_company_id:  string;
  job_id:               string | null;
  message:              string | null;
  quantity:             number | null;
  requested_start_date: string | null;
  requested_end_date:   string | null;
  origin_country:       string | null;
  destination_country:  string | null;
  cargo_description:    string | null;
  special_requirements: string | null;
  attached_documents:   unknown[] | null;
  agreed_price:         number | null;
  agreed_currency:      string;
  platform_commission:  number | null;
  request_status:       string;
  provider_response:    string | null;
  provider_quote:       number | null;
  provider_quote_notes: string | null;
  provider_responded_at:string | null;
  admin_notes:          string | null;
  completed_at:         string | null;
  customer_rating:      number | null;
  customer_review:      string | null;
  created_at:           string;
  updated_at:           string;
  // Joined
  listing?:             Pick<ServiceListing, "title" | "service_type" | "currency"> | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function listingStatusColor(status: string): string {
  switch (status) {
    case "Approved":      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "Pending Review":return "border-amber-500/30  bg-amber-500/10  text-amber-400";
    case "Rejected":      return "border-red-500/30    bg-red-500/10    text-red-400";
    case "Suspended":     return "border-orange-500/30 bg-orange-500/10 text-orange-400";
    default:              return "border-slate-600      bg-slate-800/40  text-slate-400";  // Draft
  }
}

export function requestStatusColor(status: string): string {
  switch (status) {
    case "Completed":     return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "In Progress":   return "border-blue-500/30    bg-blue-500/10    text-blue-400";
    case "Accepted":      return "border-cyan-500/30    bg-cyan-500/10    text-cyan-400";
    case "Quoted":        return "border-purple-500/30  bg-purple-500/10  text-purple-400";
    case "Under Review":  return "border-amber-500/30   bg-amber-500/10   text-amber-400";
    case "Cancelled":     return "border-red-500/30     bg-red-500/10     text-red-400";
    default:              return "border-slate-600       bg-slate-800/40   text-slate-400";
  }
}

export function formatPrice(amount: number | null, currency = "USD"): string {
  if (amount == null) return "Quote on Request";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export const SERVICE_TYPE_ICON: Record<ServiceType, string> = {
  "Freight & Logistics":       "🚢",
  "Customs Brokerage":         "📋",
  "Trade Finance Support":     "💰",
  "Legal & Compliance":        "⚖️",
  "Inspection & Certification":"🔍",
};

// Field hints for the provider listing form, per service type
export const SERVICE_TYPE_FIELDS: Record<ServiceType, { label: string; key: string; type: "text" | "number" | "textarea" | "boolean" }[]> = {
  "Freight & Logistics": [
    { label: "Cargo Types Handled",      key: "cargo_types",      type: "text" },
    { label: "Max Weight (kg)",          key: "max_weight_kg",    type: "number" },
    { label: "Hazmat Capable",           key: "hazmat",           type: "boolean" },
    { label: "Reefer / Cold Chain",      key: "reefer",           type: "boolean" },
    { label: "Port Pairs / Routes",      key: "port_pairs",       type: "textarea" },
  ],
  "Customs Brokerage": [
    { label: "HS Code Expertise",        key: "hs_code_expertise",type: "text" },
    { label: "Countries Covered",        key: "countries",        type: "text" },
    { label: "Permit / Licence Types",   key: "permit_types",     type: "text" },
  ],
  "Trade Finance Support": [
    { label: "Finance Types Offered",    key: "finance_types",    type: "text" },
    { label: "Min Transaction Amount",   key: "min_amount",       type: "number" },
    { label: "Max Transaction Amount",   key: "max_amount",       type: "number" },
    { label: "Supported Currencies",     key: "supported_currencies", type: "text" },
  ],
  "Legal & Compliance": [
    { label: "Practice Areas",           key: "practice_areas",   type: "text" },
    { label: "Jurisdictions",            key: "jurisdictions",    type: "text" },
    { label: "Document Types",           key: "document_types",   type: "text" },
  ],
  "Inspection & Certification": [
    { label: "Inspection Types",         key: "inspection_types", type: "text" },
    { label: "Lab Accreditations",       key: "lab_accreditations", type: "text" },
    { label: "Turnaround (Days)",        key: "turnaround_days",  type: "number" },
  ],
};
