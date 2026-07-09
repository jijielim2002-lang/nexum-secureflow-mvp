-- 026_document_extraction.sql
-- LLM Document Extraction v1: extraction run tracking, relational mismatch flags,
-- and extraction metadata columns on job_documents / job_document_extracted_fields.
-- Run after 025_job_documents.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. document_extraction_runs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_extraction_runs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_document_id   uuid        NOT NULL REFERENCES job_documents(id) ON DELETE CASCADE,
  job_reference     text        NOT NULL,
  document_type     text        NOT NULL,
  provider          text        NOT NULL DEFAULT 'OpenAI'
                                CHECK (provider IN ('OpenAI','Claude','Manual','Other')),
  model_name        text,
  extraction_status text        NOT NULL DEFAULT 'Queued'
                                CHECK (extraction_status IN ('Queued','Processing','Extracted','Reviewed','Failed','Skipped')),
  raw_response      jsonb,
  structured_output jsonb,
  confidence_score  numeric,
  error_message     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  reviewed_by       uuid        REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. document_mismatch_flags (relational — replaces jsonb mismatch_flags col for AI results)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_mismatch_flags (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference    text        NOT NULL,
  job_document_id  uuid        NOT NULL REFERENCES job_documents(id) ON DELETE CASCADE,
  mismatch_type    text        NOT NULL,
  severity         text        NOT NULL DEFAULT 'Medium'
                               CHECK (severity IN ('Low','Medium','High','Critical')),
  expected_value   text,
  extracted_value  text,
  field_name       text,
  status           text        NOT NULL DEFAULT 'Open'
                               CHECK (status IN ('Open','Resolved','Accepted','Waived')),
  reviewed_by      uuid        REFERENCES auth.users(id),
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add extraction metadata columns to job_documents
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE job_documents
  ADD COLUMN IF NOT EXISTS llm_extraction_enabled     boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS extraction_provider        text,
  ADD COLUMN IF NOT EXISTS extraction_model           text,
  ADD COLUMN IF NOT EXISTS extraction_confidence_score numeric,
  ADD COLUMN IF NOT EXISTS extraction_review_required boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS extracted_at               timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at                timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by                uuid        REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS extraction_warning         text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add confidence + run link to job_document_extracted_fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE job_document_extracted_fields
  ADD COLUMN IF NOT EXISTS confidence_score   numeric,
  ADD COLUMN IF NOT EXISTS extraction_run_id  uuid REFERENCES document_extraction_runs(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS: document_extraction_runs
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE document_extraction_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_extraction_runs"       ON document_extraction_runs;
DROP POLICY IF EXISTS "provider_select_extraction_runs" ON document_extraction_runs;
DROP POLICY IF EXISTS "customer_select_extraction_runs" ON document_extraction_runs;

CREATE POLICY "admin_all_extraction_runs"
  ON document_extraction_runs FOR ALL
  TO authenticated
  USING  (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

CREATE POLICY "provider_select_extraction_runs"
  ON document_extraction_runs FOR SELECT
  TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "customer_select_extraction_runs"
  ON document_extraction_runs FOR SELECT
  TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE customer_company_id = nexum_my_company_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS: document_mismatch_flags
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE document_mismatch_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_mismatch_flags"        ON document_mismatch_flags;
DROP POLICY IF EXISTS "provider_select_mismatch_flags"  ON document_mismatch_flags;
DROP POLICY IF EXISTS "customer_select_mismatch_flags"  ON document_mismatch_flags;

CREATE POLICY "admin_all_mismatch_flags"
  ON document_mismatch_flags FOR ALL
  TO authenticated
  USING  (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

CREATE POLICY "provider_select_mismatch_flags"
  ON document_mismatch_flags FOR SELECT
  TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "customer_select_mismatch_flags"
  ON document_mismatch_flags FOR SELECT
  TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE customer_company_id = nexum_my_company_id()
    )
  );
