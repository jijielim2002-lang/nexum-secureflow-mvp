// ─── safeParseJson ────────────────────────────────────────────────────────────
//
// Guard for fields that arrive from Supabase as either:
//   • A parsed JS object/array  (Supabase already deserialised the JSONB column)
//   • A JSON string             (the value was stored/returned as a raw string)
//   • null / undefined / ""     (no value — return fallback)
//
// Usage:
//   const docs = safeParseJson(row.required_documents, []) as string[];
//   const snap  = safeParseJson(row.snapshot_data,      {}) as Record<string, unknown>;
//
// Rules:
//   1. null / undefined / ""  → return fallback (never parse)
//   2. already an object/array → return value as-is (already parsed by Supabase)
//   3. string                  → try JSON.parse; on failure log a warning and return fallback
//   4. any other primitive     → return fallback

export function safeParseJson<T = unknown>(value: unknown, fallback: T): T {
  // ── Rule 1: empty / missing ───────────────────────────────────────────────
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  // ── Rule 2: already a JS object or array ─────────────────────────────────
  if (typeof value === "object") {
    return value as T;
  }

  // ── Rule 3: JSON string ───────────────────────────────────────────────────
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      console.warn("[safeParseJson] Could not parse JSON string value:", value.slice(0, 120));
      return fallback;
    }
  }

  // ── Rule 4: unexpected primitive ─────────────────────────────────────────
  return fallback;
}
