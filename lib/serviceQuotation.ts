// ─── lib/serviceQuotation.ts — Provider Commercial Quotation Workflow v1 ──────
//
// COMPLIANCE NOTE:
//   Commercial quotation only. Not a legal invoice or regulated financial
//   instrument. No accounting integration. No e-invoicing.

// ── Types ─────────────────────────────────────────────────────────────────────

export type ServiceQuotationStatus =
  | "Draft"
  | "Sent"
  | "Viewed"
  | "Accepted"
  | "Rejected"
  | "Expired"
  | "Converted to Secured Job";

export interface ServiceQuotationRow {
  id:                               string;
  quotation_reference:              string;
  provider_company_id:              string | null;
  customer_company_id:              string | null;
  customer_email:                   string | null;
  created_by:                       string | null;

  service_type:                     string | null;
  route:                            string | null;
  incoterm:                         string | null;
  cargo_description:                string | null;

  currency:                         string;
  quoted_amount:                    number;
  required_deposit:                 number;
  balance_amount:                   number | null;
  payment_terms:                    string | null;

  validity_until:                   string | null;

  scope_of_service:                 string | null;
  exclusions:                       string | null;
  assumptions:                      string | null;
  required_documents:               string[] | null;
  release_condition:                string | null;
  delivery_confirmation_window_hours: number;
  remarks:                          string | null;

  quotation_status:                 ServiceQuotationStatus;

  sent_at:                          string | null;
  viewed_at:                        string | null;
  accepted_at:                      string | null;
  accepted_by:                      string | null;
  rejection_reason:                 string | null;
  rejected_at:                      string | null;
  converted_job_reference:          string | null;
  converted_at:                     string | null;

  invite_token:                     string | null;
  invite_token_expires_at:          string | null;

  created_at:                       string;
  updated_at:                       string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const SQ_SERVICE_TYPES = [
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

export const SQ_INCOTERMS = [
  "EXW", "FCA", "FAS", "FOB", "CFR", "CIF",
  "CPT", "CIP", "DAP", "DPU", "DDP",
  "Not Specified",
] as const;

export const SQ_CURRENCIES = ["RM", "USD", "SGD", "EUR", "CNY", "GBP"] as const;

export const SQ_PAYMENT_TERMS = [
  "Full Payment Upfront",
  "50% Deposit, 50% on Delivery",
  "30% Deposit, 70% on Delivery",
  "70% Deposit, 30% on Delivery",
  "Payment on Delivery (POD)",
  "Net 30 Days",
  "Net 60 Days",
  "Other (see remarks)",
] as const;

export const SQ_DEFAULT_REQUIRED_DOCUMENTS = [
  "Commercial Invoice",
  "Packing List",
  "Bill of Lading / Airway Bill",
  "Certificate of Origin",
  "Delivery Order",
  "Proof of Delivery (POD)",
] as const;

export const SQ_DELIVERY_WINDOW_OPTIONS = [
  { label: "24 hours", value: 24 },
  { label: "48 hours (recommended)", value: 48 },
  { label: "72 hours", value: 72 },
  { label: "5 business days", value: 120 },
] as const;

export const SQ_DEFAULT_RELEASE_CONDITION =
  "Payment recorded as held under a designated workflow arrangement. " +
  "Release instruction issued upon customer delivery confirmation or auto-confirmation after the agreed window. " +
  "Subject to maker-checker approval. Actual fund transfer through approved bank or licensed payment partner.";

// ── Audit actions ─────────────────────────────────────────────────────────────

export const SQ_AUDIT_ACTIONS = {
  created:          "quotation_created",
  sent:             "quotation_sent",
  viewed:           "quotation_viewed",
  accepted:         "quotation_accepted",
  rejected:         "quotation_rejected",
  converted:        "quotation_converted_to_secured_job",
  expired:          "quotation_expired",
} as const;

// ── Reference generator ───────────────────────────────────────────────────────

export function generateSQRef(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SQ-${d}-${r}`;
}

export function generateSQInviteToken(): string {
  return Array.from({ length: 32 }, () =>
    Math.random().toString(36)[2] ?? "x",
  ).join("");
}

// ── Status display helpers ────────────────────────────────────────────────────

export function fmtSQStatus(status: ServiceQuotationStatus): { label: string; cls: string } {
  const map: Record<ServiceQuotationStatus, { label: string; cls: string }> = {
    "Draft":                   { label: "Draft",      cls: "text-slate-400 border-slate-700 bg-slate-800/50" },
    "Sent":                    { label: "Sent",        cls: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    "Viewed":                  { label: "Viewed",      cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
    "Accepted":                { label: "Accepted",    cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
    "Rejected":                { label: "Rejected",    cls: "text-red-400 border-red-500/30 bg-red-500/10" },
    "Expired":                 { label: "Expired",     cls: "text-slate-500 border-slate-700 bg-slate-800/50" },
    "Converted to Secured Job":{ label: "Job Created", cls: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
  };
  return map[status] ?? { label: status, cls: "text-slate-400 border-slate-700" };
}

export function fmtSQDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

export function fmtSQAmount(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function isQuotationExpired(q: ServiceQuotationRow): boolean {
  if (!q.validity_until) return false;
  if (["Accepted", "Converted to Secured Job", "Rejected"].includes(q.quotation_status)) return false;
  return new Date(q.validity_until) < new Date();
}

export function isQuotationActionable(q: ServiceQuotationRow): boolean {
  return ["Sent", "Viewed"].includes(q.quotation_status) && !isQuotationExpired(q);
}

// ── Scope default text ────────────────────────────────────────────────────────

export const SQ_DEFAULT_SCOPE =
  "Provision of logistics services as described above, including coordination, " +
  "documentation, and delivery to the agreed destination.";

export const SQ_DEFAULT_EXCLUSIONS =
  "Customs duties, taxes, import/export permits, storage charges beyond agreed period, " +
  "insurance (unless explicitly included), and any charges arising from force majeure events.";

export const SQ_DEFAULT_ASSUMPTIONS =
  "Cargo dimensions and weight as declared. Packaging is export-standard. " +
  "Customer is responsible for export permits and compliance with destination country regulations.";
