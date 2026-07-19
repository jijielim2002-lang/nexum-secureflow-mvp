/**
 * lib/masking.ts
 * Counterparty masking helpers — Part B of Platform Architecture Upgrade v1.
 *
 * SECURITY: All calls go through the server-side API route so the service role
 * key is never exposed to the client.
 *
 * Wording rules (compliance):
 *   - Never say "AI verified", "guaranteed accurate", or "bank verified".
 *   - Masked names are display labels only, not verified identities.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisibilityLevel = "Full" | "Masked" | "Hidden";

export interface CounterpartyMapping {
  id:                string;
  real_company_id:   string;
  owner_company_id:  string;
  masked_code:       string;
  masked_name:       string | null;
  relationship_type: string | null;
  visibility_level:  VisibilityLevel;
  created_at:        string;
}

export interface MaskedCompanyResult {
  display_name:     string;
  is_masked:        boolean;
  visibility_level: VisibilityLevel;
}

// ─── Client-side helper (calls server API) ────────────────────────────────────
// Use this in React components. Never call Supabase directly from the browser
// for masked data — the RPC function uses SECURITY DEFINER.

export async function getMaskedCompanyName(
  realCompanyId:   string,
  viewerCompanyId: string,
  viewerRole:      string,
  token:           string,
): Promise<MaskedCompanyResult> {
  if (!realCompanyId) {
    return { display_name: "Unknown", is_masked: false, visibility_level: "Masked" };
  }

  // Same company — always full
  if (realCompanyId === viewerCompanyId) {
    return { display_name: "[Own company]", is_masked: false, visibility_level: "Full" };
  }

  try {
    const res = await fetch(
      `/api/masking/company-name?` +
        new URLSearchParams({
          real_company_id:   realCompanyId,
          viewer_company_id: viewerCompanyId,
          viewer_role:       viewerRole,
        }),
      { headers: { Authorization: "Bearer " + token } },
    );

    if (!res.ok) throw new Error("Masking API returned " + res.status);

    const json = await res.json() as {
      display_name?:     string;
      is_masked?:        boolean;
      visibility_level?: VisibilityLevel;
    };

    return {
      display_name:     json.display_name     ?? "Company-" + realCompanyId.slice(0, 6).toUpperCase(),
      is_masked:        json.is_masked        ?? true,
      visibility_level: json.visibility_level ?? "Masked",
    };
  } catch {
    // Safe fallback — never expose real name on error
    return {
      display_name:     "Company-" + realCompanyId.slice(0, 6).toUpperCase(),
      is_masked:        true,
      visibility_level: "Masked",
    };
  }
}

// ─── Server-side helper (call from API routes with service role client) ────────
// Pass the Supabase admin client — no network hop needed.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMaskedCompanyNameServer(
  adminClient:     SupabaseClient,
  realCompanyId:   string,
  viewerCompanyId: string,
  viewerRole:      string,
): Promise<MaskedCompanyResult> {
  if (!realCompanyId) {
    return { display_name: "Unknown", is_masked: false, visibility_level: "Masked" };
  }

  const { data, error } = await adminClient.rpc("get_masked_company_name", {
    p_real_company_id:   realCompanyId,
    p_viewer_company_id: viewerCompanyId,
    p_viewer_role:       viewerRole,
  });

  if (error || !data) {
    return {
      display_name:     "Company-" + realCompanyId.slice(0, 6).toUpperCase(),
      is_masked:        true,
      visibility_level: "Masked",
    };
  }

  const displayName = data as string;
  const isMasked = displayName.startsWith("Company-") || displayName === "[Hidden]";

  return {
    display_name:     displayName,
    is_masked:        isMasked,
    visibility_level: displayName === "[Hidden]" ? "Hidden" : isMasked ? "Masked" : "Full",
  };
}

// ─── Batch helper ──────────────────────────────────────────────────────────────
// Resolve multiple company IDs in one pass (server-side only).

export async function batchGetMaskedNames(
  adminClient:     SupabaseClient,
  realCompanyIds:  string[],
  viewerCompanyId: string,
  viewerRole:      string,
): Promise<Record<string, MaskedCompanyResult>> {
  const unique = [...new Set(realCompanyIds.filter(Boolean))];
  const results: Record<string, MaskedCompanyResult> = {};

  await Promise.all(
    unique.map(async (id) => {
      results[id] = await getMaskedCompanyNameServer(adminClient, id, viewerCompanyId, viewerRole);
    }),
  );

  return results;
}


// ─── Sensitive data access logging (server-side only) ─────────────────────────

export async function logSensitiveAccess(
  adminClient:      SupabaseClient,
  userId:           string,
  companyId:        string | null,
  targetRecordType: string,
  targetRecordId:   string,
  sensitiveField:   string,
  accessLevel:      "Full" | "Masked" | "Hidden",
  accessReason?:    string,
): Promise<void> {
  try {
    await adminClient.from("sensitive_data_access_logs").insert({
      user_id:            userId,
      company_id:         companyId,
      target_record_type: targetRecordType,
      target_record_id:   targetRecordId,
      sensitive_field:    sensitiveField,
      access_level:       accessLevel,
      access_reason:      accessReason ?? null,
    });
  } catch {
    // Never let logging failure break the main flow
  }
}
