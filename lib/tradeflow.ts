// ─── TradeFlow types & helpers ────────────────────────────────────────────────

export const TRADEFLOW_REQUEST_TYPES = [
  "Supplier Deposit Protection",
  "Supplier Balance Release",
  "Pay Supplier with Document Control",
  "Remittance Assist via Licensed Partner",
  "LC-like Document Release Workflow",
  "Other Trade Payment Workflow",
] as const;

export type TradeflowRequestType = typeof TRADEFLOW_REQUEST_TYPES[number];

export const TRADEFLOW_DOCUMENT_REQUIREMENTS: Record<string, string[]> = {
  "Supplier Deposit Protection": [
    "Proforma Invoice",
    "Supplier Bank Details",
    "Supplier Company Document (if available)",
    "Buyer Approval",
  ],
  "Supplier Balance Release": [
    "Commercial Invoice",
    "Packing List",
    "Goods Ready Evidence",
    "BL / AWB / DO (if shipped)",
    "Customer Approval",
  ],
  "Remittance Assist via Licensed Partner": [
    "Proforma Invoice / Commercial Invoice",
    "Supplier Bank Details",
    "Purpose of Payment Declaration",
    "KYC/KYB Documents (where required)",
    "Licensed Partner Reference",
  ],
  "LC-like Document Release Workflow": [
    "Agreed Release Condition",
    "Commercial Invoice",
    "Packing List",
    "BL / AWB",
    "Insurance Certificate (if applicable)",
    "Certificate of Origin (if applicable)",
    "Customs Document (if available)",
  ],
  "Pay Supplier with Document Control": [
    "Proforma Invoice",
    "Commercial Invoice",
    "Supplier Bank Details",
  ],
  "Other Trade Payment Workflow": [
    "Relevant Trade Documents",
  ],
};

export interface TradeflowRequest {
  id:                       string;
  tradeflow_reference:      string;
  customer_company_id:      string | null;
  supplier_company_id:      string | null;
  customer_user_id:         string | null;
  request_type:             string | null;
  trade_type:               string | null;
  supplier_name:            string | null;
  supplier_country:         string | null;
  buyer_name:               string | null;
  buyer_country:            string | null;
  commodity_description:    string | null;
  hs_code:                  string | null;
  currency:                 string | null;
  trade_amount:             number | null;
  requested_payment_amount: number | null;
  payment_stage:            string | null;
  incoterm:                 string | null;
  origin_country:           string | null;
  destination_country:      string | null;
  shipment_mode:            string | null;
  expected_ship_date:       string | null;
  expected_arrival_date:    string | null;
  release_condition:        string | null;
  remittance_required:      boolean;
  remittance_partner:       string | null;
  remittance_status:        string;
  payment_status:           string;
  workflow_status:          string | null;
  risk_level:               string | null;
  compliance_note:          string | null;
  created_at:               string;
  updated_at:               string;
}

export interface TradeflowPaymentInstruction {
  id:                    string;
  tradeflow_reference:   string;
  instruction_type:      string | null;
  account_holder_name:   string | null;
  bank_name:             string | null;
  account_number_masked: string | null;
  currency:              string | null;
  amount:                number | null;
  payment_reference:     string | null;
  instruction_status:    string;
  created_at:            string;
}

export interface TradeflowMilestone {
  id:                   string;
  tradeflow_reference:  string;
  milestone_name:       string | null;
  milestone_type:       string | null;
  release_percentage:   number | null;
  release_amount:       number | null;
  required_documents:   string[];
  status:               string;
  completed_at:         string | null;
  created_at:           string;
}

export interface TradeflowReleaseReview {
  id:                       string;
  tradeflow_reference:      string;
  release_stage:            string | null;
  requested_release_amount: number | null;
  currency:                 string | null;
  release_condition_met:    boolean;
  document_check_status:    string | null;
  mismatch_flags:           string[];
  admin_decision:           string;
  decision_note:            string | null;
  decided_at:               string | null;
  created_at:               string;
}

// ─── Status colour helpers ────────────────────────────────────────────────────

export function tfPaymentStatusColor(status: string): string {
  switch (status) {
    case "Draft":                      return "bg-slate-700/40 text-slate-400 border-slate-600/40";
    case "Awaiting Customer Acceptance": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "Awaiting Payment":           return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "Payment Proof Uploaded":     return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "Payment Verified":           return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "Release Review":             return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "Released":                   return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "Closed":                     return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "Disputed":                   return "bg-red-500/15 text-red-400 border-red-500/30";
    case "Cancelled":                  return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    default:                           return "bg-slate-700/40 text-slate-400 border-slate-600/40";
  }
}

export function tfRemittanceStatusColor(status: string): string {
  switch (status) {
    case "Not Required":                   return "text-slate-500";
    case "Pending Partner Review":         return "text-amber-400";
    case "Pending Customer Instruction":   return "text-amber-400";
    case "Processing by Licensed Partner": return "text-blue-400";
    case "Completed":                      return "text-emerald-400";
    case "Failed":                         return "text-red-400";
    case "Cancelled":                      return "text-slate-500";
    default:                               return "text-slate-400";
  }
}

export function tfRiskColor(level: string | null): string {
  switch (level) {
    case "Low":    return "text-emerald-400";
    case "Medium": return "text-amber-400";
    case "High":   return "text-red-400";
    default:       return "text-slate-500";
  }
}

export function formatTradeAmount(amount: number | null, currency: string | null): string {
  if (!amount) return "—";
  return `${currency ?? "USD"} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(amount)}`;
}
