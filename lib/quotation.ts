// ─── lib/quotation.ts — Service Inquiry & Quotation Workflow v1 ──────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export type InquiryStatus =
  | "Submitted"
  | "Assigned"
  | "Quoted"
  | "Converted"
  | "Cancelled";

export type QuotationStatus =
  | "Submitted"
  | "Accepted"
  | "Rejected"
  | "Expired"
  | "Converted";

export interface InquiryRow {
  id:                           string;
  inquiry_reference:            string;
  customer_company_id:          string | null;
  requested_by:                 string | null;
  service_type:                 string;
  origin:                       string | null;
  destination:                  string | null;
  route:                        string | null;
  cargo_description:            string | null;
  estimated_cargo_value:        number | null;
  currency:                     string;
  incoterm_preference:          string | null;
  target_delivery_date:         string | null;
  special_requirements:         string | null;
  assigned_provider_company_id: string | null;
  admin_notes:                  string | null;
  status:                       InquiryStatus;
  created_at:                   string;
  updated_at:                   string;
}

export interface QuotationRow {
  id:                      string;
  quotation_reference:     string;
  inquiry_id:              string | null;
  inquiry_reference:       string | null;
  job_reference:           string | null;
  provider_company_id:     string | null;
  customer_company_id:     string | null;
  quoted_by:               string | null;
  service_type:            string;
  route:                   string | null;
  cargo_description:       string | null;
  job_value:               number;
  currency:                string;
  payment_terms:           string | null;
  required_deposit:        number | null;
  balance_terms:           string | null;
  incoterm:                string | null;
  estimated_delivery_date: string | null;
  special_conditions:      string | null;
  validity_days:           number;
  valid_until:             string | null;
  status:                  QuotationStatus;
  accepted_by:             string | null;
  accepted_at:             string | null;
  rejection_reason:        string | null;
  converted_at:            string | null;
  created_at:              string;
  updated_at:              string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const SERVICE_TYPES = [
  "Air Freight",
  "Sea Freight — FCL",
  "Sea Freight — LCL",
  "Road Transport",
  "Rail Freight",
  "Multimodal",
  "Customs Clearance",
  "Warehousing",
  "Other",
] as const;

export const INCOTERMS = [
  "EXW", "FCA", "FAS", "FOB", "CFR", "CIF",
  "CPT", "CIP", "DAP", "DPU", "DDP",
  "Not Specified",
] as const;

export const CURRENCIES = ["RM", "USD", "SGD", "EUR", "CNY", "GBP"] as const;

export const PAYMENT_TERMS_OPTIONS = [
  "Full Upfront",
  "50% Deposit, Balance on Delivery",
  "30% Deposit, Balance on Delivery",
  "70% Deposit, Balance on Delivery",
  "Payment on Delivery",
  "Net 30",
  "Net 60",
  "Other",
] as const;

export const INQUIRY_AUDIT_ACTIONS = {
  submitted:           "inquiry_submitted",
  provider_assigned:   "inquiry_provider_assigned",
  cancelled:           "inquiry_cancelled",
  converted:           "inquiry_converted_to_job",
} as const;

export const QUOTATION_AUDIT_ACTIONS = {
  submitted:           "quotation_submitted",
  accepted:            "quotation_accepted",
  rejected:            "quotation_rejected",
  job_created:         "job_created_from_quotation",
} as const;

// ── Reference generators ──────────────────────────────────────────────────────

export function generateInquiryRef(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INQ-${d}-${r}`;
}

export function generateQuotationRef(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `QUO-${d}-${r}`;
}

export function generateJobRefFromQuotation(): string {
  const d = new Date().toISOString().slice(0, 7).replace(/-/g, "");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `NX-${d}-${r}`;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function fmtInquiryStatus(status: InquiryStatus): { label: string; cls: string } {
  const map: Record<InquiryStatus, { label: string; cls: string }> = {
    Submitted:  { label: "Submitted",  cls: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    Assigned:   { label: "Assigned",   cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
    Quoted:     { label: "Quoted",     cls: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
    Converted:  { label: "Converted",  cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
    Cancelled:  { label: "Cancelled",  cls: "text-slate-600 border-slate-700 bg-slate-800/50" },
  };
  return map[status] ?? { label: status, cls: "text-slate-400 border-slate-700" };
}

export function fmtQuotationStatus(status: QuotationStatus): { label: string; cls: string } {
  const map: Record<QuotationStatus, { label: string; cls: string }> = {
    Submitted:  { label: "Submitted",  cls: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    Accepted:   { label: "Accepted",   cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
    Rejected:   { label: "Rejected",   cls: "text-red-400 border-red-500/30 bg-red-500/10" },
    Expired:    { label: "Expired",    cls: "text-slate-500 border-slate-700 bg-slate-800/50" },
    Converted:  { label: "Job Created", cls: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
  };
  return map[status] ?? { label: status, cls: "text-slate-400 border-slate-700" };
}

export function fmtQDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

export function fmtQAmount(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function buildRoute(origin: string | null, destination: string | null): string {
  if (!origin && !destination) return "—";
  if (!origin) return destination ?? "—";
  if (!destination) return origin;
  return `${origin} → ${destination}`;
}
