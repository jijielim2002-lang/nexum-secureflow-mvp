// ─── Procurement Order Control v1 ─────────────────────────────────────────────
// Procurement order control and document verification workflow.
// NOT a legal contract. NOT credit approval. NOT escrow guarantee.
// NOT "purchase legally approved". NOT "guaranteed supplier".

// ── Status type ───────────────────────────────────────────────────────────────

export type ProcurementStatus =
  | "Draft"
  | "Pending Supplier Quotation"
  | "Quotation Received"
  | "PO Issued"
  | "Supplier Accepted"
  | "Advance Payment Required"
  | "Advance Secured"
  | "In Production"
  | "Ready for Inspection"
  | "Ready for Shipment"
  | "Shipped"
  | "Delivered"
  | "Completed"
  | "Disputed"
  | "Cancelled";

export type DocumentType =
  | "Supplier Quotation"
  | "Proforma Invoice"
  | "Purchase Order"
  | "Supplier Acceptance"
  | "Commercial Invoice"
  | "Packing List"
  | "Inspection Report"
  | "Production Photo"
  | "Bill of Lading"
  | "Airway Bill"
  | "Payment Proof"
  | "Other";

export type DocumentVerificationStatus = "Pending" | "Verified" | "Rejected" | "Needs Review";

// ── Status ordering (pipeline position 0–100) ─────────────────────────────────

const STATUS_ORDER: Record<ProcurementStatus, number> = {
  "Draft":                       0,
  "Pending Supplier Quotation":  8,
  "Quotation Received":         16,
  "PO Issued":                  24,
  "Supplier Accepted":          32,
  "Advance Payment Required":   40,
  "Advance Secured":            48,
  "In Production":              56,
  "Ready for Inspection":       64,
  "Ready for Shipment":         72,
  "Shipped":                    80,
  "Delivered":                  90,
  "Completed":                 100,
  "Disputed":                   -1,
  "Cancelled":                  -2,
};

export function getProcurementStatusProgress(status: ProcurementStatus): number {
  return Math.max(0, STATUS_ORDER[status] ?? 0);
}

// ── Status badge styles ───────────────────────────────────────────────────────

export const PROCUREMENT_STATUS_BADGE: Record<ProcurementStatus, string> = {
  "Draft":                       "bg-slate-700/50 text-slate-400 border-slate-600",
  "Pending Supplier Quotation":  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Quotation Received":          "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "PO Issued":                   "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "Supplier Accepted":           "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "Advance Payment Required":    "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Advance Secured":             "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "In Production":               "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Ready for Inspection":        "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "Ready for Shipment":          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Shipped":                     "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  "Delivered":                   "bg-green-500/15 text-green-400 border-green-500/30",
  "Completed":                   "bg-green-600/20 text-green-300 border-green-600/40",
  "Disputed":                    "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":                   "bg-slate-600/30 text-slate-500 border-slate-600/40",
};

export const PROCUREMENT_STATUS_ICON: Record<ProcurementStatus, string> = {
  "Draft":                       "✏",
  "Pending Supplier Quotation":  "⏳",
  "Quotation Received":          "📄",
  "PO Issued":                   "📋",
  "Supplier Accepted":           "✅",
  "Advance Payment Required":    "💰",
  "Advance Secured":             "🔒",
  "In Production":               "🏭",
  "Ready for Inspection":        "🔍",
  "Ready for Shipment":          "📦",
  "Shipped":                     "🚢",
  "Delivered":                   "✔",
  "Completed":                   "🏁",
  "Disputed":                    "⚠",
  "Cancelled":                   "✗",
};

// ── Document type badges ──────────────────────────────────────────────────────

export const DOCUMENT_TYPE_BADGE: Record<DocumentType, string> = {
  "Supplier Quotation":  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Proforma Invoice":    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Purchase Order":      "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  "Supplier Acceptance": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "Commercial Invoice":  "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Packing List":        "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "Inspection Report":   "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "Production Photo":    "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Bill of Lading":      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Airway Bill":         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Payment Proof":       "bg-green-500/15 text-green-400 border-green-500/30",
  "Other":               "bg-slate-600/30 text-slate-500 border-slate-600/40",
};

export const VERIFICATION_STATUS_BADGE: Record<DocumentVerificationStatus, string> = {
  "Pending":      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Verified":     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Rejected":     "bg-red-500/15 text-red-400 border-red-500/30",
  "Needs Review": "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

// ── Audit actions ─────────────────────────────────────────────────────────────

export const PROCUREMENT_AUDIT_ACTIONS = {
  order_created:                 "procurement_order_created",
  document_uploaded:             "procurement_document_uploaded",
  document_verified:             "procurement_document_verified",
  status_updated:                "procurement_order_status_updated",
  linked_to_supplier_protection: "procurement_linked_to_supplier_protection",
  linked_to_secured_job:         "procurement_linked_to_secured_job",
  discrepancy_flagged:           "procurement_discrepancy_flagged",
} as const;

export type ProcurementAuditAction =
  (typeof PROCUREMENT_AUDIT_ACTIONS)[keyof typeof PROCUREMENT_AUDIT_ACTIONS];

// ── Compliance wording ────────────────────────────────────────────────────────

export const PROCUREMENT_COMPLIANCE_WORDING = {
  basis:
    "This procurement order record is for procurement order control and document verification workflow only. It does not constitute a legal contract, credit approval, or payment guarantee.",
  not_legal:
    "This is not a legally binding contract. Nexum SecureFlow provides procurement order control and evidence workflow support only.",
  not_escrow:
    "Advance payment protection is provided through supplier payment protection controls. This is not an escrow guarantee.",
  not_approved:
    "Document verification indicates administrative review status only. It does not constitute legal approval or authorisation to pay.",
  discrepancy:
    "A document discrepancy has been flagged for admin review. Do not proceed with advance payment until resolved.",
  no_auto_release:
    "Nexum SecureFlow does not auto-release supplier payment. All payment releases require verified evidence and admin review.",
} as const;

// ── Document intelligence fields extractable from PI/PO/Invoice ──────────────

export const EXTRACTABLE_FIELDS: Array<{
  field: string;
  label: string;
  docTypes: DocumentType[];
}> = [
  { field: "supplier_name",           label: "Supplier Name",         docTypes: ["Proforma Invoice", "Commercial Invoice", "Supplier Quotation"] },
  { field: "supplier_pi_number",      label: "PI / Quotation Number", docTypes: ["Proforma Invoice", "Supplier Quotation"] },
  { field: "supplier_invoice_number", label: "Invoice Number",        docTypes: ["Commercial Invoice"] },
  { field: "buyer_po_number",         label: "PO Number",             docTypes: ["Purchase Order"] },
  { field: "goods_description",       label: "Goods Description",     docTypes: ["Proforma Invoice", "Commercial Invoice", "Purchase Order", "Supplier Quotation"] },
  { field: "hs_code",                 label: "HS Code",               docTypes: ["Proforma Invoice", "Commercial Invoice"] },
  { field: "incoterm",                label: "Incoterm",              docTypes: ["Proforma Invoice", "Commercial Invoice", "Purchase Order"] },
  { field: "order_value_amount",      label: "Order Value",           docTypes: ["Proforma Invoice", "Commercial Invoice", "Purchase Order", "Supplier Quotation"] },
  { field: "order_value_currency",    label: "Currency",              docTypes: ["Proforma Invoice", "Commercial Invoice", "Purchase Order", "Supplier Quotation"] },
  { field: "advance_required_amount", label: "Advance Amount",        docTypes: ["Proforma Invoice", "Supplier Quotation"] },
  { field: "supplier_payment_terms",  label: "Payment Terms",         docTypes: ["Proforma Invoice", "Commercial Invoice", "Supplier Quotation"] },
  { field: "expected_ship_date",      label: "Ship Date",             docTypes: ["Proforma Invoice", "Commercial Invoice"] },
  { field: "expected_delivery_date",  label: "Delivery Date",         docTypes: ["Proforma Invoice", "Commercial Invoice"] },
];

// ── DB row types ──────────────────────────────────────────────────────────────

export interface ProcurementOrderRow {
  id:                       string;
  procurement_reference:    string;
  job_reference:            string | null;
  buyer_company_id:         string | null;
  supplier_id:              string | null;
  supplier_name:            string | null;
  supplier_country:         string | null;
  procurement_status:       ProcurementStatus;
  goods_description:        string | null;
  commodity_category:       string | null;
  hs_code:                  string | null;
  hs_code_description:      string | null;
  incoterm:                 string | null;
  order_value_amount:       number | null;
  order_value_currency:     string;
  advance_required_amount:  number | null;
  advance_currency:         string;
  advance_percentage:       number | null;
  balance_amount:           number | null;
  balance_currency:         string;
  expected_production_days: number | null;
  expected_ready_date:      string | null;
  expected_ship_date:       string | null;
  expected_delivery_date:   string | null;
  supplier_payment_terms:   string | null;
  buyer_po_number:          string | null;
  supplier_pi_number:       string | null;
  supplier_invoice_number:  string | null;
  required_documents:       string[] | null;
  quality_requirement:      string | null;
  inspection_required:      boolean;
  linked_spp_id:            string | null;
  linked_spp_reference:     string | null;
  discrepancy_flagged:      boolean;
  discrepancy_notes:        string | null;
  admin_remarks:            string | null;
  remarks:                  string | null;
  created_by:               string | null;
  created_at:               string;
  updated_at:               string;
}

export interface ProcurementOrderDocumentRow {
  id:                    string;
  procurement_reference: string;
  job_reference:         string | null;
  document_id:           string | null;
  document_type:         DocumentType | null;
  verification_status:   DocumentVerificationStatus;
  uploaded_by_role:      string | null;
  uploaded_by_user_id:   string | null;
  verified_by:           string | null;
  verified_at:           string | null;
  rejection_reason:      string | null;
  remarks:               string | null;
  created_at:            string;
}

// ── Helper: derive missing documents ─────────────────────────────────────────

export function getMissingDocuments(
  order: Pick<ProcurementOrderRow, "required_documents">,
  documents: Pick<ProcurementOrderDocumentRow, "document_type" | "verification_status">[],
): string[] {
  const required = order.required_documents ?? [];
  const uploaded = documents
    .filter((d) => d.document_type !== null && d.verification_status !== "Rejected")
    .map((d) => d.document_type as string);
  return required.filter((r) => !uploaded.includes(r));
}

// ── Helper: derive next recommended status ────────────────────────────────────

export function getNextStatus(
  current: ProcurementStatus,
  hasQuotation: boolean,
  hasPO: boolean,
  hasAcceptance: boolean,
  advanceRequired: boolean,
  advanceSecured: boolean,
  hasInspectionReport: boolean,
  hasBLorAWB: boolean,
): ProcurementStatus | null {
  switch (current) {
    case "Draft":                       return "Pending Supplier Quotation";
    case "Pending Supplier Quotation":  return hasQuotation ? "Quotation Received" : null;
    case "Quotation Received":          return hasPO ? "PO Issued" : null;
    case "PO Issued":                   return hasAcceptance ? "Supplier Accepted" : null;
    case "Supplier Accepted":           return advanceRequired ? "Advance Payment Required" : "In Production";
    case "Advance Payment Required":    return advanceSecured ? "Advance Secured" : null;
    case "Advance Secured":             return "In Production";
    case "In Production":               return hasInspectionReport ? "Ready for Inspection" : "Ready for Shipment";
    case "Ready for Inspection":        return "Ready for Shipment";
    case "Ready for Shipment":          return hasBLorAWB ? "Shipped" : null;
    case "Shipped":                     return "Delivered";
    case "Delivered":                   return "Completed";
    default:                            return null;
  }
}

// ── ALL STATUSES (for dropdowns) ──────────────────────────────────────────────

export const ALL_PROCUREMENT_STATUSES: ProcurementStatus[] = [
  "Draft",
  "Pending Supplier Quotation",
  "Quotation Received",
  "PO Issued",
  "Supplier Accepted",
  "Advance Payment Required",
  "Advance Secured",
  "In Production",
  "Ready for Inspection",
  "Ready for Shipment",
  "Shipped",
  "Delivered",
  "Completed",
  "Disputed",
  "Cancelled",
];

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  "Supplier Quotation",
  "Proforma Invoice",
  "Purchase Order",
  "Supplier Acceptance",
  "Commercial Invoice",
  "Packing List",
  "Inspection Report",
  "Production Photo",
  "Bill of Lading",
  "Airway Bill",
  "Payment Proof",
  "Other",
];

export const ALL_INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"];
