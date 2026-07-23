// ─── Nexum Extraction Engine v1 — Cost Tracker ───────────────────────────────
// Logs per-document extraction costs to extraction_usage_logs table.
// Admin can view monthly spend per provider.
// Uses service-role client (server-side only).

import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface CostLogEntry {
  document_id:       string;
  job_reference?:    string | null;
  provider:          string;   // 'pdf_text' | 'template' | 'openai' | 'anthropic'
  model?:            string | null;
  input_tokens?:     number | null;
  output_tokens?:    number | null;
  pages_processed?:  number | null;
  estimated_cost_usd: number;
  extraction_mode:   string;
}

export async function logExtractionCost(entry: CostLogEntry): Promise<void> {
  try {
    const admin = adminClient();
    await admin.from("extraction_usage_logs").insert({
      document_id:        entry.document_id,
      job_reference:      entry.job_reference ?? null,
      provider:           entry.provider,
      model:              entry.model ?? null,
      input_tokens:       entry.input_tokens ?? null,
      output_tokens:      entry.output_tokens ?? null,
      pages_processed:    entry.pages_processed ?? null,
      estimated_cost_usd: entry.estimated_cost_usd,
      extraction_mode:    entry.extraction_mode,
    });
  } catch {
    // Non-fatal — don't break extraction flow if logging fails
    console.warn("[cost-tracker] Failed to log extraction cost");
  }
}

/** Fetch platform cost guard settings */
export async function getCostGuards(): Promise<{
  max_per_doc: number;
  max_per_job: number;
  dual_llm_min_job_value: number;
}> {
  try {
    const admin = adminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "max_ai_cost_per_document_usd",
        "max_ai_cost_per_job_usd",
        "dual_llm_min_job_value",
      ]);

    const map: Record<string, number> = {};
    for (const row of data ?? []) {
      map[row.key] = parseFloat(row.value) || 0;
    }

    return {
      max_per_doc:            map["max_ai_cost_per_document_usd"]  ?? 0.05,
      max_per_job:            map["max_ai_cost_per_job_usd"]       ?? 0.50,
      dual_llm_min_job_value: map["dual_llm_min_job_value"]        ?? 50000,
    };
  } catch {
    return { max_per_doc: 0.05, max_per_job: 0.50, dual_llm_min_job_value: 50000 };
  }
}
