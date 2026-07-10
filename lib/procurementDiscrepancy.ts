// ─── Procurement Discrepancy Detection v1 ────────────────────────────────────
// Discrepancy detection and review workflow only.
// NOT legal conclusions. NOT automatic blocking. NOT fraud detection.
// Detects possible mismatches across procurement documents and records.

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiscrepancyType =
  | "Supplier Name Mismatch"
  | "Buyer Name Mismatch"
  | "Value Mismatch"
  | "Currency Mismatch"
  | "Quantity Mismatch"
  | "HS Code Mismatch"
  | "Incoterm Mismatch"
  | "Cargo Description Mismatch"
  | "Weight / CBM Mismatch"
  | "Container / BL Mismatch"
  | "Port / Route Mismatch"
  | "Payment Terms Mismatch"
  | "Advance Amount Mismatch"
  | "Document Missing"
  | "Date / Timeline Mismatch"
  | "Other";

export type DiscrepancySeverity = "Low" | "Medium" | "High" | "Critical";

export type DiscrepancyStatus =
  | "Open"
  | "Under Review"
  | "Resolved"
  | "Ignored"
  | "Escalated";

// ── DB row type ───────────────────────────────────────────────────────────────

export interface ProcurementDiscrepancyRow {
  id:                    string;
  procurement_reference: string | null;
  job_reference:         string | null;
  discrepancy_type:      DiscrepancyType;
  severity:              DiscrepancySeverity;
  status:                DiscrepancyStatus;
  source_a:              string | null;
  source_a_value:        string | null;
  source_b:              string | null;
  source_b_value:        string | null;
  detected_rule:         string | null;
  recommended_action:    string | null;
  reviewed_by:           string | null;
  reviewed_at:           string | null;
  resolution_note:       string | null;
  created_at:            string;
  updated_at:            string;
}

// ── Badge styles ──────────────────────────────────────────────────────────────

export const SEVERITY_BADGE: Record<DiscrepancySeverity, string> = {
  Low:      "bg-slate-700/40 text-slate-400 border-slate-600/40",
  Medium:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  High:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const SEVERITY_ICON: Record<DiscrepancySeverity, string> = {
  Low:      "◦",
  Medium:   "⚠",
  High:     "⛔",
  Critical: "🚨",
};

export const STATUS_BADGE: Record<DiscrepancyStatus, string> = {
  "Open":         "bg-red-500/15 text-red-400 border-red-500/30",
  "Under Review": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Resolved":     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Ignored":      "bg-slate-700/40 text-slate-500 border-slate-600/40",
  "Escalated":    "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export const DISCREPANCY_TYPE_ICON: Partial<Record<DiscrepancyType, string>> = {
  "Supplier Name Mismatch":      "🏭",
  "Buyer Name Mismatch":         "🏢",
  "Value Mismatch":              "💰",
  "Currency Mismatch":           "💱",
  "Quantity Mismatch":           "📦",
  "HS Code Mismatch":            "🔖",
  "Incoterm Mismatch":           "🚢",
  "Cargo Description Mismatch":  "📋",
  "Weight / CBM Mismatch":       "⚖",
  "Container / BL Mismatch":     "📄",
  "Port / Route Mismatch":       "🗺",
  "Payment Terms Mismatch":      "📑",
  "Advance Amount Mismatch":     "💸",
  "Document Missing":            "📭",
  "Date / Timeline Mismatch":    "📅",
  "Other":                       "❓",
};

// ── Audit actions ─────────────────────────────────────────────────────────────

export const DISCREPANCY_AUDIT_ACTIONS = {
  detected:                        "procurement_discrepancy_detected",
  reviewed:                        "procurement_discrepancy_reviewed",
  resolved:                        "procurement_discrepancy_resolved",
  ignored:                         "procurement_discrepancy_ignored",
  escalated:                       "procurement_discrepancy_escalated",
  release_blocked:                 "release_blocked_by_procurement_discrepancy",
} as const;

export type DiscrepancyAuditAction =
  (typeof DISCREPANCY_AUDIT_ACTIONS)[keyof typeof DISCREPANCY_AUDIT_ACTIONS];

// ── Compliance wording ────────────────────────────────────────────────────────

export const DISCREPANCY_COMPLIANCE_WORDING = {
  basis:
    "Discrepancy detection is a document review workflow only. Nexum SecureFlow does not make legal, customs, or fraud determinations. All detected mismatches require human review before any action is taken.",
  not_fraud:
    "A detected discrepancy indicates a possible mismatch between document data. It does not constitute evidence of fraud, legal violation, or customs breach.",
  not_permanent_block:
    "Nexum SecureFlow does not permanently block payments automatically. Admin review and override is always available.",
  escalation:
    "Escalated discrepancies are flagged for senior review. They do not constitute automatic rejection of the transaction.",
} as const;

// ── All types and statuses for dropdowns ──────────────────────────────────────

export const ALL_DISCREPANCY_TYPES: DiscrepancyType[] = [
  "Supplier Name Mismatch",
  "Buyer Name Mismatch",
  "Value Mismatch",
  "Currency Mismatch",
  "Quantity Mismatch",
  "HS Code Mismatch",
  "Incoterm Mismatch",
  "Cargo Description Mismatch",
  "Weight / CBM Mismatch",
  "Container / BL Mismatch",
  "Port / Route Mismatch",
  "Payment Terms Mismatch",
  "Advance Amount Mismatch",
  "Document Missing",
  "Date / Timeline Mismatch",
  "Other",
];

export const ALL_DISCREPANCY_STATUSES: DiscrepancyStatus[] = [
  "Open",
  "Under Review",
  "Resolved",
  "Ignored",
  "Escalated",
];

export const ALL_SEVERITIES: DiscrepancySeverity[] = ["Low", "Medium", "High", "Critical"];

// ── Detection result (before DB write) ───────────────────────────────────────

export interface DetectedDiscrepancy {
  procurement_reference: string | null;
  job_reference:         string | null;
  discrepancy_type:      DiscrepancyType;
  severity:              DiscrepancySeverity;
  source_a:              string;
  source_a_value:        string | null;
  source_b:              string;
  source_b_value:        string | null;
  detected_rule:         string;
  recommended_action:    string;
  // Dedup key — do not insert if Open discrepancy with same key already exists
  dedup_key:             string;
}

// ── Value tolerance helper ─────────────────────────────────────────────────────

export const VALUE_TOLERANCE_PCT = 2; // 2% tolerance for value mismatch

export function valueMismatch(a: number, b: number, tolerancePct = VALUE_TOLERANCE_PCT): boolean {
  if (a === 0 && b === 0) return false;
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return false;
  return Math.abs(a - b) / base * 100 > tolerancePct;
}

// ── Fuzzy name mismatch (normalized comparison) ───────────────────────────────

export function nameMismatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) =>
    s.toLowerCase()
     .replace(/[^a-z0-9]/g, " ")
     .replace(/\s+/g, " ")
     .trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return false;
  // Check if one contains the other (partial match = no mismatch)
  if (na.includes(nb) || nb.includes(na)) return false;
  // Check significant word overlap (>50% = no mismatch)
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  const overlapRate = overlap / Math.min(wordsA.size, wordsB.size);
  return overlapRate < 0.5;
}

// ── HS Code normalization (strip dots/spaces) ─────────────────────────────────

export function hsCodeMismatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/[^0-9]/g, "").slice(0, 6);
  const na = norm(a);
  const nb = norm(b);
  return na !== nb && na.length > 0 && nb.length > 0;
}

// ── Incoterm normalization ────────────────────────────────────────────────────

export function incotermMismatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toUpperCase().slice(0, 3).trim();
  return norm(a) !== norm(b);
}

// ── Severity derivation ───────────────────────────────────────────────────────

export function deriveSeverity(type: DiscrepancyType): DiscrepancySeverity {
  switch (type) {
    case "Value Mismatch":
    case "Advance Amount Mismatch":
    case "Container / BL Mismatch":
      return "High";
    case "Supplier Name Mismatch":
    case "Buyer Name Mismatch":
    case "Currency Mismatch":
    case "HS Code Mismatch":
    case "Port / Route Mismatch":
      return "High";
    case "Document Missing":
      return "High";
    case "Incoterm Mismatch":
    case "Payment Terms Mismatch":
    case "Cargo Description Mismatch":
      return "Medium";
    case "Quantity Mismatch":
    case "Weight / CBM Mismatch":
      return "Medium";
    case "Date / Timeline Mismatch":
      return "Low";
    default:
      return "Medium";
  }
}

// ── Recommended action map ────────────────────────────────────────────────────

export const RECOMMENDED_ACTION: Partial<Record<DiscrepancyType, string>> = {
  "Supplier Name Mismatch":      "Verify supplier name against corporate profile and confirm with buyer. Do not release advance until resolved.",
  "Buyer Name Mismatch":         "Verify buyer/consignee name matches purchase order and company record.",
  "Value Mismatch":              "Reconcile invoice value against purchase order. Obtain written explanation for any difference before advance release.",
  "Currency Mismatch":           "Confirm currency agreement between buyer and supplier. Update procurement order if currency was legitimately changed.",
  "Quantity Mismatch":           "Verify actual quantity against packing list, purchase order, and invoice.",
  "HS Code Mismatch":            "Review HS code across all documents. Correct the procurement order or flag for customs review.",
  "Incoterm Mismatch":           "Reconcile incoterm across quotation, PO, and invoice. Confirm which terms apply to this shipment.",
  "Cargo Description Mismatch":  "Confirm goods description matches between PO, invoice, and packing list.",
  "Weight / CBM Mismatch":       "Verify weight/CBM against packing list and shipment tracking data.",
  "Container / BL Mismatch":     "Verify container number against Bill of Lading and shipment tracking. Do not release until confirmed.",
  "Port / Route Mismatch":       "Confirm port of loading/discharge against job route and BL. Investigate if cargo has been re-routed.",
  "Payment Terms Mismatch":      "Reconcile payment terms between PI/invoice and supplier payment protection.",
  "Advance Amount Mismatch":     "Verify advance amount against agreed PI and supplier payment protection. Do not release excess advance.",
  "Document Missing":            "Request missing document from supplier/shipper immediately. Do not proceed with advance release until received.",
  "Date / Timeline Mismatch":    "Verify ship dates and delivery dates across documents.",
};
