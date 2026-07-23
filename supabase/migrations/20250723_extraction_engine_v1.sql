-- =============================================================================
-- Nexum Extraction Engine v1 — SQL Migration
-- Run in Supabase SQL Editor
-- =============================================================================

-- ── 1. extraction_usage_logs ──────────────────────────────────────────────────
-- Tracks cost per document extraction. Admins can see monthly spend.

CREATE TABLE IF NOT EXISTS public.extraction_usage_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid        REFERENCES public.document_ingestion_files(id) ON DELETE SET NULL,
  job_reference       text,
  provider            text        NOT NULL,  -- 'pdf_text' | 'template' | 'openai' | 'anthropic' | 'manual'
  model               text,
  input_tokens        integer,
  output_tokens       integer,
  pages_processed     integer,
  estimated_cost_usd  numeric(10,6) NOT NULL DEFAULT 0,
  extraction_mode     text        NOT NULL DEFAULT 'cost_controlled',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Index for admin cost queries
CREATE INDEX IF NOT EXISTS idx_extraction_logs_doc     ON public.extraction_usage_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_created ON public.extraction_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_provider ON public.extraction_usage_logs(provider);

-- RLS: only service_provider + admin can read own logs; admin reads all
ALTER TABLE public.extraction_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extraction_logs_admin_all"
  ON public.extraction_usage_logs FOR ALL
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

CREATE POLICY "extraction_logs_service_read"
  ON public.extraction_usage_logs FOR SELECT
  USING (nexum_my_role() IN ('service_provider', 'admin'));

-- ── 2. Platform settings — cost guard keys ────────────────────────────────────
-- Insert defaults; skip if keys already exist.

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('max_ai_cost_per_document_usd', '0.05',
   'Maximum AI extraction cost per document in USD. Extraction stops if exceeded.'),
  ('max_ai_cost_per_job_usd', '0.50',
   'Maximum total AI cost per job in USD.'),
  ('dual_llm_min_job_value', '50000',
   'Minimum job value (MYR) to enable dual-LLM cross-check.'),
  ('require_admin_approval_for_ai_above_limit', 'false',
   'If true, admin must approve extraction when cost exceeds limit.'),
  ('disable_anthropic_when_credit_low', 'true',
   'If true, skip Anthropic and use manual fallback when credit balance is low.')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Update document_ingestion_files — add extraction_label if missing ──────
ALTER TABLE public.document_ingestion_files
  ADD COLUMN IF NOT EXISTS extraction_label text;

-- ── 4. Helpful view: monthly extraction cost summary ─────────────────────────
CREATE OR REPLACE VIEW public.v_extraction_cost_monthly AS
SELECT
  date_trunc('month', created_at)  AS month,
  provider,
  model,
  COUNT(*)                         AS documents_processed,
  SUM(input_tokens)                AS total_input_tokens,
  SUM(output_tokens)               AS total_output_tokens,
  SUM(estimated_cost_usd)          AS total_cost_usd
FROM public.extraction_usage_logs
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 5 DESC;

-- ── 5. Helpful view: cost per job ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_extraction_cost_per_job AS
SELECT
  l.job_reference,
  COUNT(DISTINCT l.document_id)   AS documents,
  SUM(l.estimated_cost_usd)       AS total_cost_usd,
  MIN(l.created_at)               AS first_extraction,
  MAX(l.created_at)               AS last_extraction,
  STRING_AGG(DISTINCT l.provider, ', ') AS providers_used
FROM public.extraction_usage_logs l
WHERE l.job_reference IS NOT NULL
GROUP BY l.job_reference
ORDER BY total_cost_usd DESC;

-- =============================================================================
-- Done. Verify with:
--   SELECT * FROM public.platform_settings WHERE key LIKE '%ai_cost%' OR key LIKE '%dual_llm%' OR key LIKE '%anthropic%';
--   SELECT * FROM public.extraction_usage_logs LIMIT 5;
-- =============================================================================
