// ─── Provider Payout Profile Library ─────────────────────────────────────────
// Types, helpers, and status maps for provider payout profile verification.
//
// Payout profile gates the 'instruct' action on release instructions:
//   verification_status must be 'Verified' before release can be instructed.
//
// SECURITY: Only masked account references are stored.
// Full details must go through secure banking infrastructure in production.

export type VerificationStatus =
  | "Pending"
  | "Submitted"
  | "Verified"
  | "Rejected"
  | "Suspended";

export type PayoutMethod =
  | "Bank Transfer"
  | "Payment Partner"
  | "Manual Settlement"
  | "Other";

export interface PayoutProfileRow {
  id:                       string;
  provider_company_id:      string;
  account_holder_name:      string | null;
  bank_name:                string | null;
  bank_country:             string;
  currency:                 string;
  account_reference_masked: string | null;
  payout_method:            PayoutMethod;
  verification_status:      VerificationStatus;
  verification_document_id: string | null;
  verified_by:              string | null;
  verified_at:              string | null;
  rejection_reason:         string | null;
  remarks:                  string | null;
  created_at:               string;
  updated_at:               string;
}

// ─── Status badge styles ──────────────────────────────────────────────────────

export const PAYOUT_STATUS_BADGE: Record<VerificationStatus, string> = {
  "Pending":   "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Submitted": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Verified":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Rejected":  "bg-red-500/15 text-red-400 border-red-500/30",
  "Suspended": "bg-red-800/30 text-red-500 border-red-800/50",
};

export const PAYOUT_STATUS_ICON: Record<VerificationStatus, string> = {
  "Pending":   "⏳",
  "Submitted": "📋",
  "Verified":  "✓",
  "Rejected":  "✕",
  "Suspended": "⛔",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if provider can receive payout (release instruction can be instructed) */
export function canReceivePayout(p: PayoutProfileRow | null | undefined): boolean {
  return p?.verification_status === "Verified";
}

/** True if profile is blocking releases */
export function isPayoutBlocking(p: PayoutProfileRow | null | undefined): boolean {
  if (!p) return true; // no profile = blocking
  return p.verification_status === "Suspended";
}

/** True if profile is editable by provider */
export function isProfileEditable(p: PayoutProfileRow | null | undefined): boolean {
  if (!p) return true; // can create
  return p.verification_status === "Pending" || p.verification_status === "Rejected";
}

/** Human-readable payout method label */
export function fmtPayoutMethod(method: PayoutMethod | null | undefined): string {
  return method ?? "Bank Transfer";
}

// ─── Audit action names ───────────────────────────────────────────────────────

export const PAYOUT_AUDIT_ACTIONS: Record<VerificationStatus, string> = {
  "Pending":   "payout_profile_created",
  "Submitted": "payout_profile_submitted",
  "Verified":  "payout_profile_verified",
  "Rejected":  "payout_profile_rejected",
  "Suspended": "payout_profile_suspended",
};

// ─── Nexum Brain context builder ──────────────────────────────────────────────

export function buildPayoutBrainContext(profile: PayoutProfileRow | null): string {
  const lines: string[] = ["=== Provider Payout Profile ==="];

  if (!profile) {
    lines.push("Payout Profile: NOT FOUND — no payout profile on record for this provider.");
    lines.push("Can provider receive payout? NO — payout profile must be submitted and verified first.");
    lines.push("Is payout profile verified? NO");
    lines.push("What is blocking release instruction? Provider has not submitted a payout profile.");
    return lines.join("\n");
  }

  lines.push(`Verification Status: ${profile.verification_status}`);
  lines.push(`Payout Method: ${profile.payout_method}`);
  lines.push(`Bank: ${profile.bank_name ?? "—"}`);
  lines.push(`Bank Country: ${profile.bank_country}`);
  lines.push(`Currency: ${profile.currency}`);
  lines.push(`Account Holder: ${profile.account_holder_name ?? "—"}`);
  lines.push(`Account Reference (Masked): ${profile.account_reference_masked ?? "—"}`);

  if (profile.verified_at) {
    lines.push(`Verified At: ${profile.verified_at.slice(0, 10)}`);
  }
  if (profile.rejection_reason) {
    lines.push(`Rejection Reason: ${profile.rejection_reason}`);
  }
  if (profile.remarks) {
    lines.push(`Admin Remarks: ${profile.remarks}`);
  }

  lines.push("");
  lines.push(`Can provider receive payout? ${canReceivePayout(profile) ? "YES — payout profile verified." : `NO — status is ${profile.verification_status}.`}`);
  lines.push(`Is payout profile verified? ${profile.verification_status === "Verified" ? "YES ✓" : "NO"}`);

  if (!canReceivePayout(profile)) {
    lines.push(
      `What is blocking release instruction? Payout profile status is ${profile.verification_status}. ` +
      (profile.verification_status === "Submitted"
        ? "Admin must verify the profile before release can be instructed."
        : profile.verification_status === "Pending"
        ? "Provider has not yet submitted payout details."
        : profile.verification_status === "Rejected"
        ? `Profile was rejected. Reason: ${profile.rejection_reason ?? "Contact admin"}. Provider must re-submit.`
        : profile.verification_status === "Suspended"
        ? "Profile is suspended. Contact Nexum Admin to resolve."
        : "Unknown status.")
    );
  } else {
    lines.push("What is blocking release instruction? Nothing from payout profile — profile is verified.");
  }

  return lines.join("\n");
}
