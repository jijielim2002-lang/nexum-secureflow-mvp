import { supabase } from "./supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  job_reference:  string;
  actor_id?:      string | null;   // auth.uid() of the acting user — required for RLS
  actor_role:     string;
  actor_name:     string;
  action:         string;
  description:    string;
  metadata?:      Record<string, unknown>;
}

export type AuditLogResult =
  | { ok: true }
  | { ok: false; code?: string; message?: string; details?: string; hint?: string; raw?: string };

// ─── Error detail extractor ───────────────────────────────────────────────────
// Supabase PostgrestError properties are sometimes non-enumerable, so
// JSON.stringify returns "{}". Extract each property explicitly and fall back
// to a raw JSON attempt for any unknown shape.

function extractErrorDetails(error: unknown): Omit<AuditLogResult & { ok: false }, "ok"> {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  const e = error as Record<string, unknown>;

  const code    = typeof e.code    === "string" ? e.code    : typeof e.code    === "number" ? String(e.code) : undefined;
  const message = typeof e.message === "string" ? e.message : undefined;
  const details = typeof e.details === "string" ? e.details : undefined;
  const hint    = typeof e.hint    === "string" ? e.hint    : undefined;

  // Attempt full serialisation as a fallback in case of unusual error shapes
  let raw: string | undefined;
  try {
    const serialised = JSON.stringify(error);
    if (serialised !== "{}" && serialised !== "null") raw = serialised;
  } catch {
    // ignore
  }

  return { code, message, details, hint, raw };
}

// ─── Core insert — accepts any Supabase client ────────────────────────────────

async function _insert(
  client: SupabaseClient,
  entry: AuditLogEntry,
): Promise<AuditLogResult> {
  const payload = {
    job_reference: entry.job_reference,
    actor_id:      entry.actor_id ?? null,
    actor_role:    entry.actor_role,
    actor_name:    entry.actor_name,
    action:        entry.action,
    description:   entry.description,
    metadata:      entry.metadata ?? {},
  };

  try {
    const { error } = await client.from("audit_logs").insert(payload);

    if (error) {
      const details = extractErrorDetails(error);
      console.warn(
        `[audit] Insert failed (action: ${entry.action}, job: ${entry.job_reference})`,
        {
          code:    details.code    ?? "(none)",
          message: details.message ?? "(none)",
          details: details.details ?? "(none)",
          hint:    details.hint    ?? "(none)",
          ...(details.raw ? { raw: details.raw } : {}),
        },
      );
      return { ok: false, ...details };
    }

    return { ok: true };
  } catch (thrown) {
    // Defensive: catch any unexpected synchronous/network throw so the caller
    // workflow is never interrupted by an audit write failure.
    const details = extractErrorDetails(thrown);
    console.warn(
      `[audit] Unexpected error during insert (action: ${entry.action}, job: ${entry.job_reference})`,
      {
        code:    details.code    ?? "(none)",
        message: details.message ?? "(none)",
        details: details.details ?? "(none)",
        hint:    details.hint    ?? "(none)",
        ...(details.raw ? { raw: details.raw } : {}),
      },
    );
    return { ok: false, ...details };
  }
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * insertAuditLog — client-side use (browser pages).
 * Uses the shared anon Supabase client; requires the user to be authenticated
 * so that RLS can identify the actor.
 *
 * Best-effort: always resolves, never throws, never crashes the caller workflow.
 */
export async function insertAuditLog(entry: AuditLogEntry): Promise<AuditLogResult> {
  return _insert(supabase, entry);
}

/**
 * insertAuditLogWithClient — server-side use (API route handlers).
 * Accepts the route's own service-role Supabase client so that the insert
 * bypasses RLS and always succeeds regardless of session state.
 *
 * Best-effort: always resolves, never throws, never crashes the caller workflow.
 */
export async function insertAuditLogWithClient(
  client: SupabaseClient,
  entry: AuditLogEntry,
): Promise<AuditLogResult> {
  return _insert(client, entry);
}
