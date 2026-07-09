// Query timeout helper — rejects after `ms` ms with a structured QUERY_TIMEOUT error.
// Logs name, duration, and success/fail in development (console.warn, not console.error).

export interface QueryTiming {
  name:     string;
  durationMs: number;
  status:   "success" | "timeout" | "error";
  errorCode?: string;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  name: string,
  ms = 8000,
): Promise<{ data: T; timing: QueryTiming }> {
  const start = Date.now();

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`QUERY_TIMEOUT:${name}`)), ms),
  );

  try {
    const data = await Promise.race([promise, timeout]);
    const durationMs = Date.now() - start;
    if (process.env.NODE_ENV === "development") {
      console.warn(`[query] ${name} success ${durationMs}ms`);
    }
    return { data, timing: { name, durationMs, status: "success" } };
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = (err as Error).message ?? "";
    const isTimeout = msg.startsWith("QUERY_TIMEOUT:");
    if (process.env.NODE_ENV === "development") {
      console.warn(`[query] ${name} ${isTimeout ? "TIMED OUT" : "FAILED"} ${durationMs}ms`, err);
    }
    throw { _queryError: true, name, durationMs, isTimeout, raw: err };
  }
}

// Helper to extract a human-readable label from a thrown query error
export function queryErrorLabel(err: unknown): string {
  if (err && typeof err === "object" && "_queryError" in err) {
    const e = err as unknown as { name: string; isTimeout: boolean };
    return e.isTimeout ? `${e.name} timed out` : `${e.name} failed`;
  }
  return "Unknown query error";
}
