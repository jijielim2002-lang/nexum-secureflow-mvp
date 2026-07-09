// ─── Accounting / E-Invoice Export — shared types and helpers ─────────────────

// ── Core enums ────────────────────────────────────────────────────────────────

export type ExportType =
  | "Job Settlement"
  | "Provider Release"
  | "Customer Payment"
  | "Nexum Service Fee"
  | "Claim Reserve"
  | "Refund"
  | "Full Job Export"
  | "Other";

export type ExportStatus = "Draft" | "Generated" | "Exported" | "Cancelled";

// ── Row as returned from DB ───────────────────────────────────────────────────

export interface AccountingExportRow {
  id:                      string;
  export_reference:        string;
  export_type:             ExportType;
  job_reference:           string | null;
  company_id:              string | null;
  counterparty_company_id: string | null;
  currency:                string;
  gross_amount:            number;
  tax_amount:              number;
  net_amount:              number;
  export_status:           ExportStatus;
  export_payload:          ExportPayload | null;
  generated_by:            string | null;
  generated_at:            string | null;
  created_at:              string;
  updated_at:              string;
}

// ── Export payload (stored in jsonb column) ───────────────────────────────────

export interface ExportPayload {
  // Core job info
  job_reference:        string;
  quotation_reference:  string | null;
  rfq_reference:        string | null;
  customer_company:     string;
  customer_company_id:  string | null;
  provider_company:     string;
  provider_company_id:  string | null;
  service_type:         string | null;
  route:                string | null;
  incoterm:             string | null;
  job_value:            number;
  currency:             string;
  job_status:           string;
  payment_status:       string;

  // Payment obligations summary
  payment_obligations: Array<{
    id:          string;
    type:        string;
    amount:      number;
    status:      string;
    due_date:    string | null;
  }>;
  total_obligations:   number;
  total_verified:      number;

  // Held payment
  held_payment_amount:  number;
  held_payment_status:  string | null;
  payment_secured_at:   string | null;
  bank_reference:       string | null;

  // Claim reserves
  claim_reserve_total:        number;
  claim_reserve_active_total: number;
  claim_reserve_details: Array<{
    id:     string;
    type:   string | null;
    amount: number;
    status: string;
    reason: string | null;
  }>;

  // Net settlement
  net_settlement_id:           string | null;
  net_settlement_status:       string | null;
  net_release_eligible:        number | null;
  total_released:              number | null;
  outstanding_amount:          number | null;
  net_settlement_approved_at:  string | null;
  net_settlement_finalized_at: string | null;

  // Release settlement
  latest_release_amount:    number | null;
  latest_release_reference: string | null;
  latest_release_status:    string | null;
  payee_name:               string | null;

  // Nexum service fee placeholder
  nexum_service_fee_amount: number | null;
  nexum_service_fee_note:   string;

  // E-invoice placeholders (not connected to LHDN)
  einvoice: {
    supplier_tin:          string | null;
    buyer_tin:             string | null;
    sst_registration:      string | null;
    invoice_type:          string | null;
    classification_code:   string | null;
    tax_rate_percent:      number | null;
    tax_amount:            number | null;
    total_excluding_tax:   number | null;
    total_including_tax:   number | null;
    lhdn_submission_status: "Not Connected";
    lhdn_note:             string;
  };

  // SQL Accounting mapping placeholder (not connected)
  accounting_mapping: {
    debtor_customer_code:    string | null;
    creditor_supplier_code:  string | null;
    gl_account:              string | null;
    tax_code:                string | null;
    invoice_reference:       string | null;
    payment_reference:       string | null;
    settlement_reference:    string | null;
    mapping_note:            string;
  };

  generated_at: string;
  export_note:  string;
}

// ── Audit action keys ─────────────────────────────────────────────────────────

export const AE_AUDIT_ACTIONS = {
  generated:  "accounting_export_generated",
  downloaded: "accounting_export_downloaded",
  cancelled:  "accounting_export_cancelled",
  regenerated: "accounting_export_regenerated",
  exported:   "accounting_export_marked_exported",
} as const;

// ── Compliance note ───────────────────────────────────────────────────────────

export const AE_COMPLIANCE_NOTE =
  "Accounting export for operational reference and e-invoice preparation data only. " +
  "Not submitted to LHDN MyInvois. Not connected to SQL Accounting or any ERP system. " +
  "Final accounting treatment subject to finance review. No official invoice has been created.";

// ── Reference generator ───────────────────────────────────────────────────────

export function generateExportReference(): string {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `AE-${yymm}-${rand}`;
}

// ── Badge / colour helpers ─────────────────────────────────────────────────────

export function exportStatusBadgeClass(status: ExportStatus): string {
  const map: Record<ExportStatus, string> = {
    Draft:     "bg-slate-700/80 text-slate-300",
    Generated: "bg-blue-900/60 text-blue-300 border border-blue-700/40",
    Exported:  "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40",
    Cancelled: "bg-red-900/40 text-red-400 border border-red-700/30",
  };
  return map[status] ?? "bg-slate-700 text-slate-300";
}

export function exportTypeColor(type: ExportType): string {
  const map: Record<ExportType, string> = {
    "Job Settlement":    "text-cyan-400",
    "Provider Release":  "text-emerald-400",
    "Customer Payment":  "text-blue-400",
    "Nexum Service Fee": "text-purple-400",
    "Claim Reserve":     "text-orange-400",
    "Refund":            "text-red-400",
    "Full Job Export":   "text-slate-200",
    "Other":             "text-slate-400",
  };
  return map[type] ?? "text-slate-400";
}

// ── CSV builder ───────────────────────────────────────────────────────────────

function csvRow(...cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => {
      const s = c == null ? "" : String(c);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

export function buildCSV(payload: ExportPayload, exportRef: string): string {
  const lines: string[] = [];
  const fmt = (n: number | null | undefined) =>
    n == null ? "" : Number(n).toFixed(2);

  lines.push(csvRow("NEXUM ACCOUNTING EXPORT", exportRef));
  lines.push(csvRow("Generated At", payload.generated_at));
  lines.push("");

  lines.push(csvRow("=== JOB DETAILS ==="));
  lines.push(csvRow("Job Reference",        payload.job_reference));
  lines.push(csvRow("Quotation Reference",  payload.quotation_reference ?? ""));
  lines.push(csvRow("Customer",             payload.customer_company));
  lines.push(csvRow("Service Provider",     payload.provider_company));
  lines.push(csvRow("Service Type",         payload.service_type ?? ""));
  lines.push(csvRow("Route",               payload.route ?? ""));
  lines.push(csvRow("Incoterm",            payload.incoterm ?? ""));
  lines.push(csvRow("Job Value",           payload.currency, fmt(payload.job_value)));
  lines.push(csvRow("Job Status",          payload.job_status));
  lines.push(csvRow("Payment Status",      payload.payment_status));
  lines.push("");

  lines.push(csvRow("=== PAYMENT OBLIGATIONS ==="));
  lines.push(csvRow("Type", "Amount", "Status", "Due Date"));
  for (const ob of payload.payment_obligations) {
    lines.push(csvRow(ob.type, fmt(ob.amount), ob.status, ob.due_date ?? ""));
  }
  lines.push(csvRow("TOTAL OBLIGATIONS",  "", fmt(payload.total_obligations)));
  lines.push(csvRow("TOTAL VERIFIED",     "", fmt(payload.total_verified)));
  lines.push("");

  lines.push(csvRow("=== HELD PAYMENT ==="));
  lines.push(csvRow("Held Amount",        payload.currency, fmt(payload.held_payment_amount)));
  lines.push(csvRow("Holding Status",     payload.held_payment_status ?? ""));
  lines.push(csvRow("Payment Secured At", payload.payment_secured_at ?? ""));
  lines.push(csvRow("Bank Reference",     payload.bank_reference ?? ""));
  lines.push("");

  lines.push(csvRow("=== CLAIM RESERVES ==="));
  lines.push(csvRow("Type", "Amount", "Status", "Reason"));
  for (const cr of payload.claim_reserve_details) {
    lines.push(csvRow(cr.type ?? "", fmt(cr.amount), cr.status, cr.reason ?? ""));
  }
  lines.push(csvRow("TOTAL RESERVES",       "", fmt(payload.claim_reserve_total)));
  lines.push(csvRow("ACTIVE RESERVES",      "", fmt(payload.claim_reserve_active_total)));
  lines.push("");

  lines.push(csvRow("=== NET SETTLEMENT ==="));
  lines.push(csvRow("Settlement Status",   payload.net_settlement_status ?? ""));
  lines.push(csvRow("Net Release Eligible",payload.currency, fmt(payload.net_release_eligible)));
  lines.push(csvRow("Total Released",      payload.currency, fmt(payload.total_released)));
  lines.push(csvRow("Outstanding Amount",  payload.currency, fmt(payload.outstanding_amount)));
  lines.push(csvRow("Approved At",         payload.net_settlement_approved_at ?? ""));
  lines.push(csvRow("Finalized At",        payload.net_settlement_finalized_at ?? ""));
  lines.push("");

  lines.push(csvRow("=== RELEASE SETTLEMENT ==="));
  lines.push(csvRow("Release Amount",     payload.currency, fmt(payload.latest_release_amount)));
  lines.push(csvRow("Release Reference",  payload.latest_release_reference ?? ""));
  lines.push(csvRow("Release Status",     payload.latest_release_status ?? ""));
  lines.push(csvRow("Payee Name",         payload.payee_name ?? ""));
  lines.push("");

  lines.push(csvRow("=== NEXUM SERVICE FEE (PLACEHOLDER) ==="));
  lines.push(csvRow("Service Fee Amount", payload.currency, fmt(payload.nexum_service_fee_amount)));
  lines.push(csvRow("Note",               payload.nexum_service_fee_note));
  lines.push("");

  lines.push(csvRow("=== E-INVOICE FIELDS (PLACEHOLDER — NOT SUBMITTED TO LHDN) ==="));
  const ei = payload.einvoice;
  lines.push(csvRow("Supplier TIN",          ei.supplier_tin ?? "[Not Configured]"));
  lines.push(csvRow("Buyer TIN",             ei.buyer_tin ?? "[Not Configured]"));
  lines.push(csvRow("SST Registration",      ei.sst_registration ?? "[Not Configured]"));
  lines.push(csvRow("Invoice Type",          ei.invoice_type ?? "[Not Configured]"));
  lines.push(csvRow("Classification Code",   ei.classification_code ?? "[Not Configured]"));
  lines.push(csvRow("Tax Rate (%)",          ei.tax_rate_percent ?? "0"));
  lines.push(csvRow("Tax Amount",            payload.currency, fmt(ei.tax_amount)));
  lines.push(csvRow("Total Excluding Tax",   payload.currency, fmt(ei.total_excluding_tax)));
  lines.push(csvRow("Total Including Tax",   payload.currency, fmt(ei.total_including_tax)));
  lines.push(csvRow("LHDN Submission",       ei.lhdn_submission_status));
  lines.push("");

  lines.push(csvRow("=== SQL ACCOUNTING MAPPING (PLACEHOLDER — NOT CONNECTED) ==="));
  const am = payload.accounting_mapping;
  lines.push(csvRow("Debtor / Customer Code",    am.debtor_customer_code    ?? "[Not Configured]"));
  lines.push(csvRow("Creditor / Supplier Code",  am.creditor_supplier_code  ?? "[Not Configured]"));
  lines.push(csvRow("GL Account",                am.gl_account              ?? "[Not Configured]"));
  lines.push(csvRow("Tax Code",                  am.tax_code                ?? "[Not Configured]"));
  lines.push(csvRow("Invoice Reference",         am.invoice_reference       ?? ""));
  lines.push(csvRow("Payment Reference",         am.payment_reference       ?? ""));
  lines.push(csvRow("Settlement Reference",      am.settlement_reference    ?? ""));
  lines.push("");

  lines.push(csvRow("=== COMPLIANCE NOTE ==="));
  lines.push(csvRow(AE_COMPLIANCE_NOTE));

  return lines.join("\n");
}

// ── Status options for filter UI ───────────────────────────────────────────────

export const EXPORT_STATUS_OPTIONS: ExportStatus[] = [
  "Draft", "Generated", "Exported", "Cancelled",
];

export const EXPORT_TYPE_OPTIONS: ExportType[] = [
  "Full Job Export",
  "Job Settlement",
  "Provider Release",
  "Customer Payment",
  "Nexum Service Fee",
  "Claim Reserve",
  "Refund",
  "Other",
];

// ── Valid actions by status ────────────────────────────────────────────────────

export type ExportAction = "mark_exported" | "cancel" | "regenerate";

export const VALID_ACTIONS_BY_STATUS: Record<ExportStatus, ExportAction[]> = {
  Draft:     ["mark_exported", "cancel"],
  Generated: ["mark_exported", "cancel", "regenerate"],
  Exported:  [],
  Cancelled: [],
};
