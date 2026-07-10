-- =============================================================================
-- 015_company_intelligence_profiles.sql
-- Intelligence scoring profiles per company.
-- Run AFTER 001_core_production_schema.sql
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_intelligence_profiles (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Snapshot fields (copied at calc time)
  company_name                  text,
  company_type                  text,

  -- Job volume
  total_jobs                    int         NOT NULL DEFAULT 0,
  completed_jobs                int         NOT NULL DEFAULT 0,
  active_jobs                   int         NOT NULL DEFAULT 0,
  disputed_jobs                 int         NOT NULL DEFAULT 0,
  monthly_jobs                  int         NOT NULL DEFAULT 0,

  -- Exception counters
  open_exceptions               int         NOT NULL DEFAULT 0,
  critical_exceptions           int         NOT NULL DEFAULT 0,

  -- Financial metrics (MYR)
  total_logistics_fee           numeric     NOT NULL DEFAULT 0,
  total_cargo_value             numeric     NOT NULL DEFAULT 0,
  total_secured_amount          numeric     NOT NULL DEFAULT 0,
  monthly_secured_amount        numeric     NOT NULL DEFAULT 0,

  -- Performance
  avg_payment_confirmation_days numeric,
  avg_execution_completion_days numeric,
  on_time_completion_rate       numeric,
  document_completeness_score   numeric,

  -- Scores 0–100
  payment_behavior_score        numeric,
  operational_reliability_score numeric,
  overall_trust_score           numeric,

  -- Classifications
  risk_level        text NOT NULL DEFAULT 'Low'
    CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  financing_readiness text NOT NULL DEFAULT 'Not Ready'
    CHECK (financing_readiness IN ('Not Ready', 'Monitor', 'Eligible', 'Priority')),
  trend             text NOT NULL DEFAULT 'Stable'
    CHECK (trend IN ('Improving', 'Stable', 'Deteriorating')),

  -- Meta
  recommended_terms   text,
  scoring_status      text NOT NULL DEFAULT 'Not Scored'
    CHECK (scoring_status IN ('Not Scored', 'Scored', 'Error')),
  last_calculated_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_company_intel_company_id UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_cip_company_id ON public.company_intelligence_profiles (company_id);
CREATE INDEX IF NOT EXISTS idx_cip_risk_level  ON public.company_intelligence_profiles (risk_level);
CREATE INDEX IF NOT EXISTS idx_cip_scoring     ON public.company_intelligence_profiles (scoring_status);

ALTER TABLE public.company_intelligence_profiles ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "Admins manage company_intelligence_profiles"
  ON public.company_intelligence_profiles;
CREATE POLICY "Admins manage company_intelligence_profiles"
  ON public.company_intelligence_profiles FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS cip_updated_at ON public.company_intelligence_profiles;
CREATE TRIGGER cip_updated_at
  BEFORE UPDATE ON public.company_intelligence_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- END 015_company_intelligence_profiles.sql
-- =============================================================================
