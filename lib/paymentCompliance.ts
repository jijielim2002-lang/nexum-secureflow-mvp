// ─── Payment Partner / Legal Structure Readiness Library ─────────────────────
// Types, wording guard, compliance checklist helpers, audit actions, brain context.

// ─── Types ────────────────────────────────────────────────────────────────────

export type PartnerType =
  | "Bank"
  | "Licensed Payment Partner"
  | "Trustee"
  | "Escrow Provider"
  | "Collection Account Provider"
  | "Manual Pilot Account"
  | "Other";

export type HoldingModel =
  | "Nexum Collection Account"
  | "Partner Controlled Account"
  | "Client Designated Account"
  | "Trust / Escrow Arrangement"
  | "Manual Pilot Reference"
  | "Other";

export type PartnerStatus = "Research" | "In Discussion" | "Pilot Ready" | "Active" | "Disabled";

export type ComplianceStatus =
  | "Not Checked"
  | "Compliant for Pilot"
  | "Requires Review"
  | "Blocked"
  | "Approved";

export interface PaymentPartnerSetup {
  id:                       string;
  partner_name:             string;
  partner_type:             PartnerType;
  jurisdiction:             string | null;
  license_reference:        string | null;
  supported_currencies:     string[];
  supported_payment_methods: string[];
  holding_model:            HoldingModel;
  status:                   PartnerStatus;
  compliance_notes:         string | null;
  allowed_wording:          string | null;
  prohibited_wording:       string | null;
  settlement_process_note:  string | null;
  created_at:               string;
  updated_at:               string;
}

export interface PaymentComplianceCheck {
  id:                        string;
  job_reference:             string | null;
  held_payment_id:           string | null;
  payment_partner_setup_id:  string | null;
  check_status:              ComplianceStatus;
  holding_wording_ok:        boolean;
  release_wording_ok:        boolean;
  customer_disclaimer_shown: boolean;
  provider_disclaimer_shown: boolean;
  legal_review_required:     boolean;
  compliance_note:           string | null;
  checked_by:                string | null;
  checked_at:                string | null;
  created_at:                string;
}

// ─── Status badge styles ──────────────────────────────────────────────────────

export const PARTNER_STATUS_BADGE: Record<PartnerStatus, string> = {
  Research:       "border-slate-700/40 bg-slate-800/40 text-slate-500",
  "In Discussion": "border-amber-500/30 bg-amber-500/10 text-amber-400",
  "Pilot Ready":  "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Active:         "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Disabled:       "border-slate-700/40 bg-slate-800/20 text-slate-600",
};

export const COMPLIANCE_STATUS_BADGE: Record<ComplianceStatus, string> = {
  "Not Checked":       "border-slate-700/40 bg-slate-800/40 text-slate-500",
  "Compliant for Pilot": "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "Requires Review":   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Blocked:             "border-red-500/30 bg-red-500/10 text-red-400",
  Approved:            "border-emerald-600/30 bg-emerald-600/10 text-emerald-300",
};

export const COMPLIANCE_STATUS_ICON: Record<ComplianceStatus, string> = {
  "Not Checked":       "○",
  "Compliant for Pilot": "✓",
  "Requires Review":   "⚠",
  Blocked:             "✕",
  Approved:            "✓✓",
};

// ─── Wording guard ────────────────────────────────────────────────────────────

export interface WordingWarning {
  found:       string;
  suggestion:  string;
  context:     string;
}

const UNSAFE_PATTERNS: { pattern: RegExp; suggestion: string }[] = [
  {
    pattern:    /\bescrow\b/i,
    suggestion: 'Use "Controlled Holding Workflow" or "Designated Holding" instead of "Escrow".',
  },
  {
    pattern:    /nexum\s+releases?\s+(?:money|funds?|payment)\s+automatically/i,
    suggestion: 'Say "Release instruction recorded" — Nexum does not release funds automatically.',
  },
  {
    pattern:    /automatically\s+(?:release|pay|transfer|disburse)/i,
    suggestion: 'Avoid implying automatic disbursement. Say "release instruction recorded" or "transfer initiated through approved partner".',
  },
  {
    pattern:    /guaranteed\s+payment/i,
    suggestion: 'Use "Payment secured subject to verification and agreed workflow".',
  },
  {
    pattern:    /loan\s+approved/i,
    suggestion: 'Use "Simulated financing offer / internal assessment only".',
  },
  {
    pattern:    /nexum\s+holds?\s+(?:your\s+)?funds?/i,
    suggestion: 'Nexum records holding workflow status. Actual fund holding must be through approved bank or licensed partner.',
  },
  {
    pattern:    /legal\s+escrow/i,
    suggestion: 'Do not claim "legal escrow". Use "designated holding arrangement" subject to applicable legal review.',
  },
];

export function checkWording(text: string): WordingWarning[] {
  if (!text) return [];
  const warnings: WordingWarning[] = [];
  for (const { pattern, suggestion } of UNSAFE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      warnings.push({
        found:      match[0],
        suggestion,
        context:    text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20).trim(),
      });
    }
  }
  return warnings;
}

// ─── Pre-secured checklist ────────────────────────────────────────────────────

export interface ChecklistItem {
  key:         string;
  label:       string;
  description: string;
  critical:    boolean;
}

export const PRE_SECURED_CHECKLIST: ChecklistItem[] = [
  {
    key:         "partner_identified",
    label:       "Payment partner / account identified",
    description: "A payment partner setup or account model has been selected for this holding.",
    critical:    true,
  },
  {
    key:         "holding_wording_ok",
    label:       "Holding wording is compliant",
    description: 'No claims of "escrow" or "guaranteed payment" in communications. Pilot status is clear.',
    critical:    true,
  },
  {
    key:         "customer_disclaimer_shown",
    label:       "Customer disclaimer shown",
    description: "Customer has been informed that this is a pilot workflow, not a regulated escrow service.",
    critical:    true,
  },
  {
    key:         "provider_disclaimer_shown",
    label:       "Provider disclaimer shown",
    description: "Service provider has been informed of the pilot holding arrangement and release process.",
    critical:    true,
  },
  {
    key:         "pilot_status_clear",
    label:       "Pilot vs commercial status is clear",
    description: "The record clearly identifies whether this is a pilot transaction or a commercially contracted arrangement.",
    critical:    false,
  },
  {
    key:         "no_auto_release_claim",
    label:       "No automatic release claims",
    description: 'System does not claim funds will be released automatically. Release requires admin instruction.',
    critical:    true,
  },
];

export const PRE_RELEASE_CHECKLIST: ChecklistItem[] = [
  {
    key:         "delivery_confirmed",
    label:       "Delivery confirmed or auto-confirmed",
    description: "Delivery confirmation has been received from customer or auto-confirmed after dispute window.",
    critical:    true,
  },
  {
    key:         "no_open_dispute",
    label:       "No open dispute",
    description: "No active dispute case is blocking this job's payment release.",
    critical:    true,
  },
  {
    key:         "payout_profile_verified",
    label:       "Payout profile verified",
    description: "Service provider's payout profile (bank account / payment details) is Verified status.",
    critical:    true,
  },
  {
    key:         "release_wording_ok",
    label:       "Release wording is compliant",
    description: 'No claims of automatic disbursement. Release is recorded as "finance instruction" only.',
    critical:    true,
  },
  {
    key:         "finance_process_identified",
    label:       "Payment partner / finance process identified",
    description: "The finance team or payment partner responsible for processing the actual transfer is identified.",
    critical:    false,
  },
  {
    key:         "reconciliation_considered",
    label:       "Reconciliation considered",
    description: "Bank statement or proof of transfer has been checked or noted as pending if bank import is in use.",
    critical:    false,
  },
];

// ─── Compliance check completeness ───────────────────────────────────────────

export function complianceScore(check: PaymentComplianceCheck): { score: number; total: number; critical: number; criticalMet: number } {
  const fields: (keyof PaymentComplianceCheck)[] = [
    "holding_wording_ok",
    "release_wording_ok",
    "customer_disclaimer_shown",
    "provider_disclaimer_shown",
  ];
  const critical = fields.filter((f) => {
    const item = PRE_SECURED_CHECKLIST.find((c) => c.key === f) ?? PRE_RELEASE_CHECKLIST.find((c) => c.key === f);
    return item?.critical;
  });
  const met    = fields.filter((f) => check[f] === true).length;
  const critMet = critical.filter((f) => check[f] === true).length;
  return { score: met, total: fields.length, critical: critical.length, criticalMet: critMet };
}

export function isCompliantForPilot(check: PaymentComplianceCheck): boolean {
  return check.check_status === "Compliant for Pilot" || check.check_status === "Approved";
}

export function isBlocked(check: PaymentComplianceCheck): boolean {
  return check.check_status === "Blocked";
}

// ─── Audit action names ───────────────────────────────────────────────────────

export const COMPLIANCE_AUDIT_ACTIONS = {
  partner_setup_created:   "payment_partner_setup_created",
  check_created:           "payment_compliance_check_created",
  check_approved:          "payment_compliance_approved",
  check_blocked:           "payment_compliance_blocked",
  wording_flagged:         "unsafe_wording_flagged",
} as const;

// ─── Nexum Brain context ──────────────────────────────────────────────────────

export interface BrainComplianceContext {
  check:          PaymentComplianceCheck | null;
  partner:        PaymentPartnerSetup | null;
  wordingWarnings: WordingWarning[];
}

export function buildComplianceBrainContext(ctx: BrainComplianceContext): string {
  const lines: string[] = ["=== Payment Partner & Legal Structure Readiness ==="];

  if (!ctx.check) {
    lines.push("Compliance Check: No compliance check on record for this job.");
    lines.push("Q: Can this payment be treated as secured? A: No compliance check has been recorded. Admin should create a compliance check before treating funds as secured.");
    lines.push("Q: Which holding model applies? A: No payment partner setup assigned. Assign a partner setup at /admin/payment-partners.");
    lines.push("Q: Is legal/compliance review required? A: Yes — no check exists. Default is legal_review_required = true.");
    lines.push("Q: What is blocking release approval? A: No compliance check. Compliance review must be completed before release.");
    return lines.join("\n");
  }

  const c = ctx.check;
  const p = ctx.partner;

  lines.push(`Compliance Status: ${c.check_status}`);
  lines.push(`Holding Wording OK: ${c.holding_wording_ok ? "Yes" : "No"}`);
  lines.push(`Release Wording OK: ${c.release_wording_ok ? "Yes" : "No"}`);
  lines.push(`Customer Disclaimer Shown: ${c.customer_disclaimer_shown ? "Yes" : "No"}`);
  lines.push(`Provider Disclaimer Shown: ${c.provider_disclaimer_shown ? "Yes" : "No"}`);
  lines.push(`Legal Review Required: ${c.legal_review_required ? "Yes" : "No"}`);
  if (c.compliance_note) lines.push(`Compliance Note: ${c.compliance_note}`);

  if (p) {
    lines.push(`\nPayment Partner: ${p.partner_name} (${p.partner_type})`);
    lines.push(`Holding Model: ${p.holding_model}`);
    lines.push(`Partner Status: ${p.status}`);
    if (p.allowed_wording) lines.push(`Allowed Wording: ${p.allowed_wording}`);
    if (p.prohibited_wording) lines.push(`Prohibited Wording: ${p.prohibited_wording}`);
    if (p.settlement_process_note) lines.push(`Settlement Process: ${p.settlement_process_note}`);
  }

  lines.push("\n--- Brain Answers ---");

  lines.push(`Q: Can this payment be treated as secured?`);
  lines.push(`A: ${isCompliantForPilot(c) ? "Yes — compliance check status is " + c.check_status + ". Payment can be treated as secured subject to all checklist items being met." : "No — compliance status is " + c.check_status + ". " + (isBlocked(c) ? "Payment is BLOCKED by compliance review." : "Compliance review required before treating as secured.")}`);

  lines.push(`Q: Which holding model applies?`);
  lines.push(`A: ${p ? p.holding_model + " via " + p.partner_name : "No payment partner setup assigned. Assign one at /admin/payment-partners."}`);

  lines.push(`Q: Is legal/compliance review required?`);
  lines.push(`A: ${c.legal_review_required ? "Yes — legal review is required for this job. Consult compliance team before proceeding." : "Not flagged as requiring legal review, but standard pilot disclaimer still applies."}`);

  lines.push(`Q: What wording should be used?`);
  if (p?.allowed_wording) {
    lines.push(`A: Approved wording per partner setup: "${p.allowed_wording}"`);
  } else {
    lines.push('A: Use "Payment secured subject to verification and agreed workflow". Do not use "escrow", "guaranteed payment", or "automatic release" language.');
  }

  lines.push(`Q: What is blocking release approval?`);
  const blockers: string[] = [];
  if (!c.holding_wording_ok)        blockers.push("Holding wording not confirmed OK");
  if (!c.release_wording_ok)        blockers.push("Release wording not confirmed OK");
  if (!c.customer_disclaimer_shown) blockers.push("Customer disclaimer not shown");
  if (!c.provider_disclaimer_shown) blockers.push("Provider disclaimer not shown");
  if (c.legal_review_required && c.check_status !== "Approved") blockers.push("Legal review required but not yet Approved");
  if (isBlocked(c))                 blockers.push("Compliance check is BLOCKED");
  lines.push(`A: ${blockers.length === 0 ? "No compliance blockers on record. Proceed through standard release governance workflow." : blockers.join("; ") + "."}`);

  if (ctx.wordingWarnings.length > 0) {
    lines.push("\nWording Warnings Detected:");
    ctx.wordingWarnings.forEach((w) => {
      lines.push(`  - Found: "${w.found}" — ${w.suggestion}`);
    });
  }

  lines.push("\nCompliance Note: This is a pilot workflow. Actual fund holding, transfer, or escrow service must be performed through approved bank, licensed partner, or designated legal arrangement.");

  return lines.join("\n");
}
