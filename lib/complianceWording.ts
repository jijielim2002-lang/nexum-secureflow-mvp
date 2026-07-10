// ─── Compliance Wording Guard — types, badges, brain context ─────────────────

export type WordingCategory =
  | "Payment Holding" | "Release" | "Financing" | "Escrow"
  | "Pilot Mode" | "Compliance" | "Other";

export type WordingSeverity = "Low" | "Medium" | "High" | "Critical";
export type ScanStatus      = "Open" | "Reviewed" | "Ignored" | "Fixed";

export const WORDING_CATEGORIES: WordingCategory[] = [
  "Payment Holding", "Release", "Financing", "Escrow",
  "Pilot Mode", "Compliance", "Other",
];
export const WORDING_SEVERITIES: WordingSeverity[] = ["Low", "Medium", "High", "Critical"];

export interface ComplianceWordingRule {
  id:                string;
  unsafe_wording:    string;
  preferred_wording: string;
  category:          WordingCategory;
  severity:          WordingSeverity;
  is_active:         boolean;
  created_at:        string;
}

export interface ComplianceWordingScanResult {
  id:                string;
  source_type:       string;
  source_id:         string;
  detected_wording:  string;
  suggested_wording: string;
  severity:          string;
  status:            ScanStatus;
  reviewed_by:       string | null;
  reviewed_at:       string | null;
  created_at:        string;
}

export const SEVERITY_BADGE: Record<WordingSeverity, string> = {
  Low:      "border-slate-600 bg-slate-800/40 text-slate-400",
  Medium:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  High:     "border-orange-500/30 bg-orange-500/10 text-orange-400",
  Critical: "border-red-500/30 bg-red-500/10 text-red-400 font-bold",
};

export const STATUS_BADGE: Record<ScanStatus, string> = {
  Open:     "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Reviewed: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Ignored:  "border-slate-700 bg-slate-800/40 text-slate-500",
  Fixed:    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

export const CATEGORY_ICON: Record<WordingCategory, string> = {
  "Payment Holding": "💳",
  "Release":         "🔓",
  "Financing":       "🏦",
  "Escrow":          "⚖",
  "Pilot Mode":      "🧪",
  "Compliance":      "✅",
  "Other":           "📋",
};

export const SEVERITY_ORDER: Record<WordingSeverity, number> = {
  Critical: 4, High: 3, Medium: 2, Low: 1,
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  communication_log:      "Communication Log",
  credit_pack:            "Credit Pack",
  financing_offer:        "Financing Offer",
  payment_partner_setup:  "Payment Partner Setup",
  compliance_check:       "Compliance Check Note",
};

export const WORDING_AUDIT_ACTIONS = {
  rule_created:    "compliance_wording_rule_created",
  scan_run:        "compliance_wording_scan_run",
  unsafe_detected: "unsafe_wording_detected",
  issue_reviewed:  "wording_issue_reviewed",
  issue_fixed:     "wording_issue_fixed",
} as const;

export function buildWordingBrainContext(ctx: {
  openIssues:     number;
  criticalIssues: number;
  scansToday:     number;
  topCategories:  string[];
}): string {
  const lines: string[] = [
    "=== COMPLIANCE WORDING GUARD ===",
    `Open wording issues: ${ctx.openIssues}`,
    `Critical issues: ${ctx.criticalIssues}`,
    `Scans run today: ${ctx.scansToday}`,
  ];
  if (ctx.topCategories.length > 0) {
    lines.push(`Active issue categories: ${ctx.topCategories.join(", ")}`);
  }
  lines.push(
    "",
    "SAFE WORDING RULES — always use these in generated answers:",
    "• 'Escrow' → 'Controlled Holding Workflow' or 'designated holding arrangement'",
    "• 'Nexum holds your money' → 'Payment is recorded under a designated holding workflow'",
    "• 'guaranteed payment' → 'payment secured subject to verification and agreed workflow'",
    "• 'automatic release' → 'release instruction recorded subject to approval'",
    "• 'loan approved' → 'simulated financing assessment / subject to lender approval'",
    "• 'funds released automatically' → 'release eligible under agreed workflow'",
    "• 'Nexum releases funds' → 'release instruction recorded through approved finance/payment process'",
    "",
    "PILOT DISCLAIMER: This is a pilot system. Do not claim legal escrow, automated fund holding,",
    "guaranteed payments, or regulated disbursements in any generated answer.",
  );
  return lines.join("\n");
}
