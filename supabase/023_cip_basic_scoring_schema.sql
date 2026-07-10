-- =============================================================================
-- 023_cip_basic_scoring_schema.sql
-- Ensures only the 14 confirmed basic scoring columns exist.
-- Safe to re-run (IF NOT EXISTS).  Run this if Recalculate All fails with
-- "column does not exist" errors — it only adds what the basic payload writes.
-- =============================================================================

ALTER TABLE public.company_intelligence_profiles
  -- Identifiers
  ADD COLUMN IF NOT EXISTS company_name             text,
  ADD COLUMN IF NOT EXISTS company_type             text,
  -- Job counters (basic)
  ADD COLUMN IF NOT EXISTS total_jobs               int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_jobs             int         NOT NULL DEFAULT 0,
  -- Financial totals (basic)
  ADD COLUMN IF NOT EXISTS total_logistics_fee      numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cargo_value        numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_secured_amount     numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_secured_amount   numeric     NOT NULL DEFAULT 0,
  -- Risk & scoring
  ADD COLUMN IF NOT EXISTS risk_level               text        NOT NULL DEFAULT 'Not Available',
  ADD COLUMN IF NOT EXISTS financeability_score     numeric,
  -- Status & timestamps
  ADD COLUMN IF NOT EXISTS scoring_status           text        NOT NULL DEFAULT 'Not Scored',
  ADD COLUMN IF NOT EXISTS last_calculated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at               timestamptz NOT NULL DEFAULT now();

-- UNIQUE constraint required for ON CONFLICT upsert on company_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_intelligence_profiles'::regclass
      AND contype  = 'u'
      AND conname  IN (
        'uq_company_intel_company_id',
        'company_intelligence_profiles_company_id_key'
      )
  ) THEN
    ALTER TABLE public.company_intelligence_profiles
      ADD CONSTRAINT uq_company_intel_company_id UNIQUE (company_id);
  END IF;
END $$;

-- risk_level CHECK — allow all valid values including "Not Available"
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_risk_level_check,
  DROP CONSTRAINT IF EXISTS cip_risk_level_check;
ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_risk_level_check
  CHECK (risk_level IN ('Not Available', 'Low', 'Medium', 'High', 'Critical'));

-- scoring_status CHECK
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_scoring_status_check,
  DROP CONSTRAINT IF EXISTS cip_scoring_status_check;
ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_scoring_status_check
  CHECK (scoring_status IN ('Not Scored', 'Scored', 'Error'));

-- =============================================================================
-- END 023_cip_basic_scoring_schema.sql
-- =============================================================================
