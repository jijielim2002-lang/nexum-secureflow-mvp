-- ═══════════════════════════════════════════════════════════════════════════════
-- Capital Readiness Engine v1 — Nexum SecureFlow
-- Run in Supabase SQL Editor (service role).
-- Depends on: nexum_is_admin(), nexum_my_role(), nexum_my_company_id()
--             (defined in rls_hardening_v1.sql Section 0)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.capital_readiness_assessments (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference          text,
  company_id             uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name           text,
  assessment_type        text        NOT NULL CHECK (assessment_type IN (
    'Customer Trade Credit',
    'Provider Receivable Financing',
    'Supplier Deposit Support',
    'Working Capital',
    'Membership Upgrade',
    'Other'
  )),
  readiness_status       text        NOT NULL DEFAULT 'Monitor' CHECK (readiness_status IN (
    'Not Ready', 'Monitor', 'Eligible', 'Priority'
  )),
  readiness_score        numeric     NOT NULL DEFAULT 0,
  max_recommended_amount numeric,
  currency               text        NOT NULL DEFAULT 'RM',
  suggested_tenure_days  integer,
  suggested_pricing_note text,
  key_strengths          text,
  key_risks              text,
  required_conditions    text,
  source_summary         jsonb,
  assessed_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.capital_readiness_assessments IS
  'Capital financing readiness scores per company or job. No money disbursed — scoring and opportunity identification only.';

-- ── Section 2: Indexes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS cap_ready_company_idx
  ON public.capital_readiness_assessments (company_id);

CREATE INDEX IF NOT EXISTS cap_ready_job_ref_idx
  ON public.capital_readiness_assessments (job_reference);

CREATE INDEX IF NOT EXISTS cap_ready_status_idx
  ON public.capital_readiness_assessments (readiness_status);

CREATE INDEX IF NOT EXISTS cap_ready_assessed_at_idx
  ON public.capital_readiness_assessments (assessed_at DESC);

-- ── Section 3: Updated-at trigger ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_cap_ready_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cap_ready_updated_at ON public.capital_readiness_assessments;

CREATE TRIGGER trg_cap_ready_updated_at
  BEFORE UPDATE ON public.capital_readiness_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_cap_ready_updated_at();

-- ── Section 4: Row Level Security ───────────────────────────────────────────

ALTER TABLE public.capital_readiness_assessments ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "cap_ready_admin_all"
  ON public.capital_readiness_assessments
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Service provider: read own company's assessments
CREATE POLICY "cap_ready_provider_select"
  ON public.capital_readiness_assessments
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND company_id = nexum_my_company_id()
  );

-- Customer: read own company's assessments
CREATE POLICY "cap_ready_customer_select"
  ON public.capital_readiness_assessments
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
  );

-- ── Section 5: Convenience view ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_capital_readiness_summary AS
SELECT
  cra.id,
  cra.job_reference,
  cra.company_id,
  cra.company_name,
  cra.assessment_type,
  cra.readiness_status,
  cra.readiness_score,
  cra.max_recommended_amount,
  cra.currency,
  cra.suggested_tenure_days,
  cra.key_strengths,
  cra.key_risks,
  cra.required_conditions,
  cra.assessed_at,
  -- Latest flag (per company + type)
  ROW_NUMBER() OVER (
    PARTITION BY cra.company_id, cra.assessment_type
    ORDER BY cra.assessed_at DESC
  ) AS recency_rank
FROM public.capital_readiness_assessments cra;

COMMENT ON VIEW public.v_capital_readiness_summary IS
  'Capital readiness with recency_rank=1 = most recent assessment per company+type.';

-- ── Section 6: Verification ─────────────────────────────────────────────────

-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'capital_readiness_assessments';

-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'capital_readiness_assessments';

-- ── Section 7: Emergency rollback (commented out) ────────────────────────────

-- DROP VIEW  IF EXISTS public.v_capital_readiness_summary;
-- DROP TABLE IF EXISTS public.capital_readiness_assessments CASCADE;
