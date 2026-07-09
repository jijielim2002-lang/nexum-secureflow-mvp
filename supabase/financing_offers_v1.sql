-- ═══════════════════════════════════════════════════════════════════════════════
-- Financing Product Simulation v1 — Nexum SecureFlow
-- Run in Supabase SQL Editor (service role).
-- Depends on: capital_readiness_v1.sql, nexum_is_admin(), nexum_my_role(),
--             nexum_my_company_id() (rls_hardening_v1.sql Section 0)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠ SIMULATION ONLY — No money disbursed. Not a regulated financial offer.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.simulated_financing_offers (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id        uuid        REFERENCES public.capital_readiness_assessments(id) ON DELETE SET NULL,
  job_reference        text,
  company_id           uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name         text,
  product_type         text        NOT NULL CHECK (product_type IN (
    'Provider Receivable Financing',
    'Customer Trade Credit',
    'Supplier Deposit Support',
    'Working Capital',
    'Membership Upgrade Financing',
    'Other'
  )),
  offer_status         text        NOT NULL DEFAULT 'Draft' CHECK (offer_status IN (
    'Draft', 'Simulated', 'Interested', 'Rejected', 'Expired'
  )),
  offer_amount         numeric     NOT NULL,
  currency             text        NOT NULL DEFAULT 'RM',
  tenure_days          integer,
  estimated_fee        numeric,
  estimated_rate_note  text,
  repayment_source     text,
  required_conditions  text,
  risk_notes           text,
  generated_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at         timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.simulated_financing_offers IS
  'Simulated financing offers generated from capital readiness assessments. SIMULATION ONLY — not a loan approval, disbursement, or regulated financial offer.';

-- ── Section 2: Indexes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS fin_offer_company_idx      ON public.simulated_financing_offers (company_id);
CREATE INDEX IF NOT EXISTS fin_offer_job_ref_idx      ON public.simulated_financing_offers (job_reference);
CREATE INDEX IF NOT EXISTS fin_offer_status_idx       ON public.simulated_financing_offers (offer_status);
CREATE INDEX IF NOT EXISTS fin_offer_assessment_idx   ON public.simulated_financing_offers (assessment_id);
CREATE INDEX IF NOT EXISTS fin_offer_generated_at_idx ON public.simulated_financing_offers (generated_at DESC);

-- ── Section 3: Updated-at trigger ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_fin_offer_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_offer_updated_at ON public.simulated_financing_offers;

CREATE TRIGGER trg_fin_offer_updated_at
  BEFORE UPDATE ON public.simulated_financing_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_fin_offer_updated_at();

-- ── Section 4: Row Level Security ───────────────────────────────────────────

ALTER TABLE public.simulated_financing_offers ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "fin_offer_admin_all"
  ON public.simulated_financing_offers
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Service provider: read own company's offers
CREATE POLICY "fin_offer_provider_select"
  ON public.simulated_financing_offers
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND company_id = nexum_my_company_id()
  );

-- Customer: read own company's offers
CREATE POLICY "fin_offer_customer_select"
  ON public.simulated_financing_offers
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
  );

-- ── Section 5: Convenience view ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_financing_pipeline AS
SELECT
  sfo.id,
  sfo.job_reference,
  sfo.company_id,
  sfo.company_name,
  sfo.product_type,
  sfo.offer_status,
  sfo.offer_amount,
  sfo.currency,
  sfo.tenure_days,
  sfo.estimated_fee,
  sfo.expires_at,
  sfo.generated_at,
  cra.readiness_status,
  cra.readiness_score
FROM public.simulated_financing_offers sfo
LEFT JOIN public.capital_readiness_assessments cra ON cra.id = sfo.assessment_id;

COMMENT ON VIEW public.v_financing_pipeline IS
  'Simulated financing pipeline with readiness scores. SIMULATION ONLY.';

-- ── Section 6: Verification ─────────────────────────────────────────────────

-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'simulated_financing_offers';

-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'simulated_financing_offers';

-- ── Section 7: Emergency rollback ───────────────────────────────────────────

-- DROP VIEW  IF EXISTS public.v_financing_pipeline;
-- DROP TABLE IF EXISTS public.simulated_financing_offers CASCADE;
