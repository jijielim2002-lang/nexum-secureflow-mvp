// ─── Supplier / Counterparty Profile ─────────────────────────────────────────
// Types, constants, helpers, and audit actions for Supplier Profile support.
//
// Compliance wording (per spec):
//   "Supplier profile"
//   "Supplier risk context"
//   "Document-derived supplier information"
//   Do NOT use: "Best supplier", "Approved supplier", "Guaranteed supplier"
//   Do NOT make legal/compliance guarantees.

// ─── Supplier Status ──────────────────────────────────────────────────────────

export const SUPPLIER_STATUS_LIST = ["New", "Known", "Verified", "Watchlist", "Blocked"] as const;
export type SupplierStatus = typeof SUPPLIER_STATUS_LIST[number];

export const SUPPLIER_STATUS_BADGE: Record<SupplierStatus, string> = {
  New:       "bg-slate-700/50 text-slate-300 border-slate-600",
  Known:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Verified:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Watchlist: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Blocked:   "bg-red-500/15 text-red-400 border-red-500/30",
};

export const SUPPLIER_STATUS_ICON: Record<SupplierStatus, string> = {
  New:       "◌",
  Known:     "◉",
  Verified:  "✓",
  Watchlist: "⚠",
  Blocked:   "⛔",
};

// ─── Supplier Risk Level ──────────────────────────────────────────────────────

export const SUPPLIER_RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;
export type SupplierRiskLevel = typeof SUPPLIER_RISK_LEVELS[number];

export const SUPPLIER_RISK_BADGE: Record<SupplierRiskLevel, string> = {
  Low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium:   "bg-amber-500/15   text-amber-400   border-amber-500/30",
  High:     "bg-orange-500/15  text-orange-400  border-orange-500/30",
  Critical: "bg-red-500/15     text-red-400     border-red-500/30",
};

// ─── Relationship Types ───────────────────────────────────────────────────────

export const RELATIONSHIP_TYPES = [
  "Seller",
  "Shipper",
  "Manufacturer",
  "Exporter",
  "Consignee",
  "Notify Party",
  "Other",
] as const;
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

// ─── Link Sources ─────────────────────────────────────────────────────────────

export const LINK_SOURCES = [
  "Manual",
  "Document Extraction",
  "Admin Verified",
  "Customer Provided",
  "Provider Provided",
] as const;
export type LinkSource = typeof LINK_SOURCES[number];

export const LINK_SOURCE_BADGE: Record<LinkSource, string> = {
  "Manual":               "bg-slate-700/50 text-slate-400 border-slate-600",
  "Document Extraction":  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Admin Verified":       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Customer Provided":    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Provider Provided":    "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
};

// ─── Supplier Profile Interface ───────────────────────────────────────────────

export interface SupplierProfile {
  id:                  string;
  supplier_name:       string;
  supplier_country?:   string | null;
  supplier_address?:   string | null;
  contact_person?:     string | null;
  contact_email?:      string | null;
  contact_phone?:      string | null;
  business_type?:      string | null;
  commodity_category?: string | null;
  hs_code?:            string | null;
  hs_code_description?: string | null;
  tax_registration_no?: string | null;
  export_license_note?: string | null;
  supplier_status?:    string | null;
  risk_level?:         string | null;
  risk_note?:          string | null;
  created_by_role?:    string | null;
  created_at?:         string;
  updated_at?:         string;
}

// ─── Job Supplier Link Interface ──────────────────────────────────────────────

export interface JobSupplierLink {
  id:                string;
  job_reference:     string;
  supplier_id:       string;
  relationship_type?: string | null;
  source?:           string | null;
  confidence_score?: number | null;
  created_at?:       string;
  // Joined
  supplier_counterparties?: SupplierProfile | null;
}

// ─── Audit Actions ────────────────────────────────────────────────────────────

export const SUPPLIER_AUDIT_ACTIONS = {
  supplier_counterparty_created:      "supplier_counterparty_created",
  supplier_counterparty_updated:      "supplier_counterparty_updated",
  supplier_linked_to_job:             "supplier_linked_to_job",
  supplier_extracted_from_document:   "supplier_extracted_from_document",
  supplier_marked_watchlist:          "supplier_marked_watchlist",
  supplier_marked_blocked:            "supplier_marked_blocked",
  supplier_verified:                  "supplier_verified",
} as const;

export type SupplierAuditAction = typeof SUPPLIER_AUDIT_ACTIONS[keyof typeof SUPPLIER_AUDIT_ACTIONS];

// ─── Compliance Wording ───────────────────────────────────────────────────────

export const SUPPLIER_COMPLIANCE_WORDING = {
  profile_only:      "Supplier profile — not an approved supplier guarantee. Information is based on documents and manual entry.",
  risk_context:      "Supplier risk context is indicative only. Nexum does not conduct supplier due diligence or verification services.",
  document_derived:  "Document-derived supplier information is subject to verification. Engage appropriate KYC procedures before transacting.",
  watchlist_notice:  "This supplier is on the watchlist. Review before proceeding. Nexum does not provide legal/compliance advice.",
  blocked_notice:    "This supplier is marked Blocked. Do not proceed without admin clearance. Nexum does not make legal compliance determinations.",
} as const;

// ─── Helper: Summary line ─────────────────────────────────────────────────────

export function buildSupplierSummaryLine(supplier: SupplierProfile, link?: Partial<JobSupplierLink>): string {
  const parts: string[] = [];
  parts.push(supplier.supplier_name);
  if (supplier.supplier_country)   parts.push(supplier.supplier_country);
  if (link?.relationship_type)     parts.push(link.relationship_type);
  if (supplier.supplier_status && supplier.supplier_status !== "New") {
    parts.push(supplier.supplier_status);
  }
  return parts.join(" · ");
}

// ─── Helper: Brain summary ────────────────────────────────────────────────────

export function supplierBrainSummary(supplier: SupplierProfile, link?: Partial<JobSupplierLink>): string {
  const lines: string[] = [];
  lines.push(`Supplier: ${supplier.supplier_name}`);
  if (supplier.supplier_country)   lines.push(`Country: ${supplier.supplier_country}`);
  if (link?.relationship_type)     lines.push(`Role: ${link.relationship_type}`);
  if (link?.source)                lines.push(`Source: ${link.source}`);
  if (supplier.supplier_status)    lines.push(`Status: ${supplier.supplier_status}`);
  if (supplier.risk_level)         lines.push(`Risk Level: ${supplier.risk_level}`);
  if (supplier.risk_note)          lines.push(`Risk Note: ${supplier.risk_note}`);
  if (supplier.commodity_category) lines.push(`Commodity: ${supplier.commodity_category}`);
  if (supplier.hs_code)            lines.push(`HS Code: ${supplier.hs_code}`);
  if (supplier.business_type)      lines.push(`Business Type: ${supplier.business_type}`);
  if (link?.confidence_score != null) {
    lines.push(`Extraction Confidence: ${(link.confidence_score * 100).toFixed(0)}%`);
  }
  return lines.join("\n");
}

// ─── Helper: Missing fields check ─────────────────────────────────────────────

export function getMissingSupplierFields(supplier: SupplierProfile): string[] {
  const missing: string[] = [];
  if (!supplier.supplier_country)   missing.push("Supplier Country");
  if (!supplier.contact_person)     missing.push("Contact Person");
  if (!supplier.contact_email)      missing.push("Contact Email");
  if (!supplier.commodity_category) missing.push("Commodity Category");
  if (!supplier.hs_code)            missing.push("HS Code");
  if (!supplier.tax_registration_no) missing.push("Tax Registration No.");
  return missing;
}
