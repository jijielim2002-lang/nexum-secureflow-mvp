/**
 * companyGate.ts
 *
 * Server-side utility for enforcing company approval status on API routes.
 * Use in any route that creates jobs, accepts jobs, or uploads payment proof.
 *
 * Usage:
 *   const gate = await checkCompanyApproved(supabase, companyId);
 *   if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Statuses that are permitted to perform operational actions
const APPROVED_STATUSES = new Set(["Approved", "Active"]);

// Human-readable reason for each blocked status
const BLOCKED_REASON: Record<string, string> = {
  "Pending Review": "Your company registration is pending admin approval. You cannot perform this action until approved.",
  "Info Required":  "Admin has requested additional information for your company registration. Please contact support.",
  "Rejected":       "Your company registration has been rejected. Please contact support.",
  "Suspended":      "Your company account has been suspended. Please contact support.",
  "Blacklisted":    "Your company account has been permanently barred from the platform.",
};

export interface GateResult {
  ok: boolean;
  status: string | null;
  reason: string | null;
}

/**
 * Check whether a company is approved to perform operational actions.
 * Pass the service-role Supabase client (bypasses RLS for server-side checks).
 */
export async function checkCompanyApproved(
  db: SupabaseClient,
  companyId: string,
): Promise<GateResult> {
  if (!companyId) {
    return { ok: false, status: null, reason: "Company ID is required." };
  }

  const { data, error } = await db
    .from("companies")
    .select("status")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: null, reason: "Company not found or could not be verified." };
  }

  const status = (data as { status: string | null }).status ?? "Pending Review";

  if (APPROVED_STATUSES.has(status)) {
    return { ok: true, status, reason: null };
  }

  return {
    ok: false,
    status,
    reason: BLOCKED_REASON[status] ?? `Company status "${status}" is not permitted for this action.`,
  };
}

/**
 * Resolve a user's company ID from their profile.
 */
export async function getCompanyIdForUser(
  db: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  return (data as { company_id?: string | null } | null)?.company_id ?? null;
}
