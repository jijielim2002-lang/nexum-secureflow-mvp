-- =============================================================================
-- 019_cip_add_missing_columns.sql
-- Bring live company_intelligence_profiles table up to the full spec used by
-- recalculate/route.ts buildPayload().  Safe to re-run — every operation is
-- conditional (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, etc.).
-- =============================================================================

-- ── 1. Add any columns that may be missing from an older table version ────────
ALTER TABLE public.company_intelligence_profiles
  ADD COLUMN IF NOT EXISTS company_name                      text,
  ADD COLUMN IF NOT EXISTS company_type                      text,
  ADD COLUMN IF NOT EXISTS total_jobs                        int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_jobs                    int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_jobs                       int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_jobs                     int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_jobs                      int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_exceptions                   int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_exceptions               int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_logistics_fee               numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cargo_value                 numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_secured_amount              numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_secured_amount            numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_payment_confirmation_days     numeric,
  ADD COLUMN IF NOT EXISTS avg_execution_completion_days     numeric,
  ADD COLUMN IF NOT EXISTS on_time_completion_rate           numeric,
  ADD COLUMN IF NOT EXISTS document_completeness_score       numeric,
  ADD COLUMN IF NOT EXISTS payment_behavior_score            numeric,
  ADD COLUMN IF NOT EXISTS operational_reliability_score     numeric,
  ADD COLUMN IF NOT EXISTS overall_trust_score               numeric,
  ADD COLUMN IF NOT EXISTS risk_level                        text        NOT NULL DEFAULT 'Low',
  ADD COLUMN IF NOT EXISTS financing_readiness               text        NOT NULL DEFAULT 'Not Ready',
  ADD COLUMN IF NOT EXISTS trend                             text        NOT NULL DEFAULT 'Stable',
  ADD COLUMN IF NOT EXISTS recommended_terms                 text,
  ADD COLUMN IF NOT EXISTS scoring_status                    text        NOT NULL DEFAULT 'Not Scored',
  ADD COLUMN IF NOT EXISTS last_calculated_at                timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at                        timestamptz NOT NULL DEFAULT now();

-- ── 2. Ensure UNIQUE constraint on company_id (required for ON CONFLICT) ──────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_intelligence_profiles'::regclass
      AND contype   = 'u'
      AND conname   IN ('uq_company_intel_company_id', 'company_intelligence_profiles_company_id_key')
  ) THEN
    ALTER TABLE public.company_intelligence_profiles
      ADD CONSTRAINT uq_company_intel_company_id UNIQUE (company_id);
  END IF;
END $$;

-- ── 3. Fix risk_level CHECK — must allow 'Not Available' ─────────────────────
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_risk_level_check,
  DROP CONSTRAINT IF EXISTS cip_risk_level_check;

ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_risk_level_check
  CHECK (risk_level IN ('Not Available', 'Low', 'Medium', 'High', 'Critical'));

-- ── 4. Fix financing_readiness CHECK ─────────────────────────────────────────
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_financing_readiness_check,
  DROP CONSTRAINT IF EXISTS cip_financing_readiness_check;

ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_financing_readiness_check
  CHECK (financing_readiness IN ('Not Ready', 'Monitor', 'Eligible', 'Priority'));

-- ── 5. Fix trend CHECK ───────────────────────────────────────────────────────
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_trend_check,
  DROP CONSTRAINT IF EXISTS cip_trend_check;

ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_trend_check
  CHECK (trend IN ('Improving', 'Stable', 'Deteriorating'));

-- ── 6. Fix scoring_status CHECK ──────────────────────────────────────────────
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_scoring_status_check,
  DROP CONSTRAINT IF EXISTS cip_scoring_status_check;

ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_scoring_status_check
  CHECK (scoring_status IN ('Not Scored', 'Scored', 'Error'));

-- ── 7. cip_columns() — helper for runtime payload filtering in the API ────────
--   Returns the actual column list so the API can filter upsert payloads
--   defensively without hard-coding the schema in two places.
CREATE OR REPLACE FUNCTION public.cip_columns()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    array_agg(column_name::text ORDER BY ordinal_position),
    ARRAY[]::text[]
  )
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'company_intelligence_profiles';
$$;

-- =============================================================================
-- END 019_cip_add_missing_columns.sql
-- =============================================================================
