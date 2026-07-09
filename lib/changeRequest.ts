// ─── lib/changeRequest.ts — Amendment / Change Request Workflow v1 ────────────

export type ChangeRequestType =
  | "Route Change"
  | "ETA Change"
  | "Delivery Address Change"
  | "Additional Charge"
  | "Payment Terms Change"
  | "Incoterm Change"
  | "Release Condition Change"
  | "Document Requirement Change"
  | "Partial Delivery"
  | "Storage / Demurrage"
  | "Customs / Permit Cost"
  | "Other";

export type ChangeRequestStatus =
  | "Draft"
  | "Submitted"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Applied"
  | "Cancelled";

export type ApprovalRequiredFrom =
  | "Customer"
  | "Provider"
  | "Admin"
  | "Customer and Provider"
  | "Admin and Customer"
  | "All Parties";

export interface ChangeRequestRow {
  id:                       string;
  job_reference:            string;
  requested_by:             string | null;
  requested_by_role:        string | null;
  requested_by_company_id:  string | null;
  change_type:              ChangeRequestType;
  change_reason:            string | null;
  current_value:            Record<string, unknown> | null;
  proposed_value:           Record<string, unknown> | null;
  financial_impact_amount:  number | null;
  currency:                 string;
  approval_required_from:   ApprovalRequiredFrom;
  status:                   ChangeRequestStatus;
  customer_approved_by:     string | null;
  customer_approved_at:     string | null;
  provider_approved_by:     string | null;
  provider_approved_at:     string | null;
  admin_approved_by:        string | null;
  admin_approved_at:        string | null;
  rejection_reason:         string | null;
  applied_at:               string | null;
  created_at:               string;
  updated_at:               string;
}

// ── Allowed types per role ────────────────────────────────────────────────────

export const PROVIDER_ALLOWED_TYPES: ChangeRequestType[] = [
  "ETA Change",
  "Route Change",
  "Delivery Address Change",
  "Additional Charge",
  "Storage / Demurrage",
  "Document Requirement Change",
  "Partial Delivery",
];

export const CUSTOMER_ALLOWED_TYPES: ChangeRequestType[] = [
  "Delivery Address Change",
  "Partial Delivery",
  "Payment Terms Change",
  "Document Requirement Change",
];

export const ALL_CHANGE_TYPES: ChangeRequestType[] = [
  "Route Change",
  "ETA Change",
  "Delivery Address Change",
  "Additional Charge",
  "Payment Terms Change",
  "Incoterm Change",
  "Release Condition Change",
  "Document Requirement Change",
  "Partial Delivery",
  "Storage / Demurrage",
  "Customs / Permit Cost",
  "Other",
];

// ── Financial-impact types ────────────────────────────────────────────────────

export const FINANCIAL_IMPACT_TYPES: ChangeRequestType[] = [
  "Additional Charge",
  "Storage / Demurrage",
  "Customs / Permit Cost",
  "Partial Delivery",
];

export function hasFinancialImpactType(type: ChangeRequestType): boolean {
  return FINANCIAL_IMPACT_TYPES.includes(type);
}

// ── Types that create an amended terms snapshot when applied ──────────────────

export const TERMS_SNAPSHOT_TYPES: ChangeRequestType[] = [
  "Payment Terms Change",
  "Incoterm Change",
  "Release Condition Change",
  "Document Requirement Change",
];

// ── Audit actions ─────────────────────────────────────────────────────────────

export const CHANGE_AUDIT_ACTIONS = {
  created:        "change_request_created",
  submitted:      "change_request_submitted",
  approved:       "change_request_approved",
  rejected:       "change_request_rejected",
  applied:        "change_request_applied",
  charge_created: "additional_charge_created_from_change_request",
  terms_amended:  "amended_terms_snapshot_created",
} as const;

// ── Default approval_required_from by change type ─────────────────────────────

export function getDefaultApprovalRequired(type: ChangeRequestType): ApprovalRequiredFrom {
  switch (type) {
    case "Additional Charge":
    case "Payment Terms Change":
    case "Release Condition Change":
    case "Incoterm Change":
    case "Customs / Permit Cost":
      return "Admin and Customer";
    case "Route Change":
    case "ETA Change":
    case "Delivery Address Change":
    case "Partial Delivery":
    case "Storage / Demurrage":
      return "Customer and Provider";
    case "Document Requirement Change":
      return "Admin and Customer";
    default:
      return "Admin and Customer";
  }
}

// ── Approval helpers ──────────────────────────────────────────────────────────

export function getApprovalParties(
  arf: ApprovalRequiredFrom,
): Array<"customer" | "provider" | "admin"> {
  switch (arf) {
    case "Customer":              return ["customer"];
    case "Provider":              return ["provider"];
    case "Admin":                 return ["admin"];
    case "Customer and Provider": return ["customer", "provider"];
    case "Admin and Customer":    return ["admin", "customer"];
    case "All Parties":           return ["admin", "customer", "provider"];
  }
}

export function isFullyApproved(
  row: Pick<
    ChangeRequestRow,
    "approval_required_from" | "customer_approved_at" | "provider_approved_at" | "admin_approved_at"
  >,
): boolean {
  const parties = getApprovalParties(row.approval_required_from);
  if (parties.includes("customer") && !row.customer_approved_at) return false;
  if (parties.includes("provider") && !row.provider_approved_at) return false;
  if (parties.includes("admin")    && !row.admin_approved_at)    return false;
  return true;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function fmtChangeStatus(status: ChangeRequestStatus): { label: string; cls: string } {
  const map: Record<ChangeRequestStatus, { label: string; cls: string }> = {
    "Draft":            { label: "Draft",            cls: "text-slate-400 border-slate-700 bg-slate-800/50" },
    "Submitted":        { label: "Submitted",         cls: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    "Pending Approval": { label: "Pending Approval",  cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
    "Approved":         { label: "Approved",          cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
    "Rejected":         { label: "Rejected",          cls: "text-red-400 border-red-500/30 bg-red-500/10" },
    "Applied":          { label: "Applied",           cls: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
    "Cancelled":        { label: "Cancelled",         cls: "text-slate-600 border-slate-800 bg-slate-900/30" },
  };
  return map[status] ?? { label: status, cls: "text-slate-500 border-slate-700" };
}

export function fmtCRDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function fmtCRDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

export function fmtCRAmount(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

// ── Proposed-value helpers ────────────────────────────────────────────────────
// Each type may store a specific key in proposed_value for the apply logic.
// For display, we use the generic "description" key as fallback.

export function getProposedValueDisplay(row: ChangeRequestRow): string {
  const pv = row.proposed_value;
  if (!pv) return "—";
  // Try type-specific keys first
  for (const key of ["route", "eta", "incoterm", "payment_terms", "release_condition", "address", "description"]) {
    if (typeof pv[key] === "string" && pv[key]) return pv[key] as string;
  }
  return JSON.stringify(pv);
}

export function getCurrentValueDisplay(row: ChangeRequestRow): string {
  const cv = row.current_value;
  if (!cv) return "—";
  for (const key of ["route", "eta", "incoterm", "payment_terms", "release_condition", "address", "description"]) {
    if (typeof cv[key] === "string" && cv[key]) return cv[key] as string;
  }
  return JSON.stringify(cv);
}
