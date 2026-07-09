// ─── Terms Acceptance — types, role maps, helpers ────────────────────────────

export type TermsType =
  | "Pilot Terms"
  | "Payment Workflow Terms"
  | "Controlled Release Terms"
  | "Financing Simulation Terms"
  | "Capital Partner Terms"
  | "Document AI Disclaimer"
  | "Other";

export type UserRole = "admin" | "service_provider" | "customer" | "capital_partner";

export const ALL_TERMS_TYPES: TermsType[] = [
  "Pilot Terms",
  "Payment Workflow Terms",
  "Controlled Release Terms",
  "Financing Simulation Terms",
  "Capital Partner Terms",
  "Document AI Disclaimer",
];

export const CURRENT_VERSION = "v1.0";

/** Which terms each role must accept before accessing sensitive workflows */
export const REQUIRED_TERMS_BY_ROLE: Record<UserRole, TermsType[]> = {
  admin:            ["Pilot Terms"],
  service_provider: ["Pilot Terms", "Payment Workflow Terms", "Controlled Release Terms"],
  customer:         ["Pilot Terms", "Payment Workflow Terms", "Document AI Disclaimer"],
  capital_partner:  ["Capital Partner Terms", "Financing Simulation Terms"],
};

export interface TermsVersion {
  id:             string;
  terms_type:     TermsType;
  version:        string;
  title:          string;
  content:        string;
  is_active:      boolean;
  effective_date: string | null;
  created_at:     string;
}

export interface UserTermsAcceptance {
  id:                string;
  user_id:           string;
  company_id:        string | null;
  role:              string | null;
  terms_type:        TermsType;
  terms_version:     string;
  accepted_at:       string;
  ip_address:        string | null;
  user_agent:        string | null;
  acceptance_method: string;
  created_at:        string;
}

export const TERMS_TYPE_ICON: Record<TermsType, string> = {
  "Pilot Terms":               "🧪",
  "Payment Workflow Terms":    "💳",
  "Controlled Release Terms":  "🔓",
  "Financing Simulation Terms": "🏦",
  "Capital Partner Terms":     "🤝",
  "Document AI Disclaimer":    "🤖",
  "Other":                     "📋",
};

export const TERMS_TYPE_DESCRIPTION: Record<TermsType, string> = {
  "Pilot Terms":               "General pilot programme acknowledgement. Required for all users.",
  "Payment Workflow Terms":    "Payment holding and controlled release workflow disclaimer.",
  "Controlled Release Terms":  "Maker-checker release approval workflow terms.",
  "Financing Simulation Terms": "Simulated financing assessment disclaimer (not a loan approval).",
  "Capital Partner Terms":     "Capital partner data access and confidentiality terms.",
  "Document AI Disclaimer":    "AI document extraction is decision-support only; human verification required.",
  "Other":                     "Additional terms.",
};

/** Audit action names */
export const TERMS_AUDIT_ACTIONS = {
  version_created: "terms_version_created",
  user_accepted:   "user_terms_accepted",
  gate_triggered:  "terms_gate_triggered",
} as const;

/**
 * Given a user's accepted terms list, return which required terms are missing.
 */
export function getMissingTerms(
  role: UserRole,
  acceptances: UserTermsAcceptance[],
  version = CURRENT_VERSION,
): TermsType[] {
  const required = REQUIRED_TERMS_BY_ROLE[role] ?? [];
  const accepted = new Set(
    acceptances
      .filter((a) => a.terms_version === version)
      .map((a) => a.terms_type)
  );
  return required.filter((t) => !accepted.has(t));
}

/**
 * True when user has accepted all required terms for their role.
 */
export function hasAcceptedRequired(
  role: UserRole,
  acceptances: UserTermsAcceptance[],
  version = CURRENT_VERSION,
): boolean {
  return getMissingTerms(role, acceptances, version).length === 0;
}
