-- =============================================================================
-- 022_company_intelligence_profiles_full_schema.sql
-- Ensures every column used by the Recalculate All upsert payload exists.
-- Safe to run even when 020 is already applied — all operations are idempotent
-- (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION).
-- Run this in Supabase SQL Editor if Recalculate All reports missing columns.
-- =============================================================================

ALTER TABLE public.company_intelligence_profiles
  -- Identifiers
  ADD COLUMN IF NOT EXISTS company_name                    text,
  ADD COLUMN IF NOT EXISTS company_type                    text,
  -- Job counters
  ADD COLUMN IF NOT EXISTS total_jobs                      int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_jobs                  int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_jobs                     int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_jobs                   int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_jobs                    int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_verified_jobs           int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_confirmed_jobs             int         NOT NULL DEFAULT 0,
  -- Exception counters
  ADD COLUMN IF NOT EXISTS open_exceptions                 int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_exceptions             int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_exceptions                 int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exception_count                 int         NOT NULL DEFAULT 0,
  -- Payment / dispute counters
  ADD COLUMN IF NOT EXISTS payment_mismatch_count          int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_payment_count              int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispute_count                   int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_count                     int         NOT NULL DEFAULT 0,
  -- Financial totals
  ADD COLUMN IF NOT EXISTS total_logistics_fee             numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cargo_value               numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_secured_amount            numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_secured_amount          numeric     NOT NULL DEFAULT 0,
  -- Timing averages (nullable — not tracked yet)
  ADD COLUMN IF NOT EXISTS avg_payment_confirmation_days   numeric,
  ADD COLUMN IF NOT EXISTS avg_execution_completion_days   numeric,
  ADD COLUMN IF NOT EXISTS average_payment_days            numeric,
  ADD COLUMN IF NOT EXISTS average_delivery_days           numeric,
  -- Performance scores (US + UK spelling kept for compatibility)
  ADD COLUMN IF NOT EXISTS on_time_completion_rate         numeric,
  ADD COLUMN IF NOT EXISTS document_completeness_score     numeric,
  ADD COLUMN IF NOT EXISTS payment_behavior_score          numeric,
  ADD COLUMN IF NOT EXISTS payment_behaviour_score         numeric,
  ADD COLUMN IF NOT EXISTS operational_reliability_score   numeric,
  ADD COLUMN IF NOT EXISTS delivery_performance_score      numeric,
  ADD COLUMN IF NOT EXISTS overall_trust_score             numeric,
  -- Risk & financing readiness
  ADD COLUMN IF NOT EXISTS risk_level                      text        NOT NULL DEFAULT 'Low',
  ADD COLUMN IF NOT EXISTS financing_readiness             text        NOT NULL DEFAULT 'Not Ready',
  ADD COLUMN IF NOT EXISTS financing_readiness_score       numeric,
  ADD COLUMN IF NOT EXISTS finance_priority_level          text,
  ADD COLUMN IF NOT EXISTS priority_finance_reason         text,
  ADD COLUMN IF NOT EXISTS trend                           text        NOT NULL DEFAULT 'Stable',
  -- Recommendations
  ADD COLUMN IF NOT EXISTS recommended_terms               text,
  ADD COLUMN IF NOT EXISTS recommended_exposure_limit      numeric,
  ADD COLUMN IF NOT EXISTS recommended_financing_amount    numeric,
  -- Status & timestamps
  ADD COLUMN IF NOT EXISTS scoring_status                  text        NOT NULL DEFAULT 'Not Scored',
  ADD COLUMN IF NOT EXISTS last_calculated_at              timestamptz,
  ADD COLUMN IF NOT EXISTS last_job_at                     timestamptz,
  ADD COLUMN IF NOT EXISTS last_scored_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at                      timestamptz NOT NULL DEFAULT now(),
  -- Rich data
  ADD COLUMN IF NOT EXISTS score_note                      text,
  ADD COLUMN IF NOT EXISTS risk_flags                      jsonb,
  ADD COLUMN IF NOT EXISTS score_breakdown                 jsonb;

-- UNIQUE constraint required for ON CONFLICT upsert
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

-- CHECK constraints — drop-and-recreate so values are always current
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_risk_level_check,
  DROP CONSTRAINT IF EXISTS cip_risk_level_check;
ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_risk_level_check
  CHECK (risk_level IN ('Not Available', 'Low', 'Medium', 'High', 'Critical'));

ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_financing_readiness_check,
  DROP CONSTRAINT IF EXISTS cip_financing_readiness_check;
ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_financing_readiness_check
  CHECK (financing_readiness IN ('Not Ready', 'Monitor', 'Eligible', 'Priority'));

ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_trend_check,
  DROP CONSTRAINT IF EXISTS cip_trend_check;
ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_trend_check
  CHECK (trend IN ('Improving', 'Stable', 'Deteriorating'));

ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_scoring_status_check,
  DROP CONSTRAINT IF EXISTS cip_scoring_status_check;
ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_scoring_status_check
  CHECK (scoring_status IN ('Not Scored', 'Scored', 'Error'));

-- cip_columns() — returns the actual column list so the API can filter
-- the upsert payload to only columns that exist (single pass, no retry loop).
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
-- END 022_company_intelligence_profiles_full_schema.sql
-- =============================================================================
