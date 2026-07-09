-- ─────────────────────────────────────────────────────────────────────────────
-- Credit Pack Export v1
-- Run in Supabase SQL editor (service role / postgres role required)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Create credit_packs table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_packs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id              uuid        REFERENCES public.simulated_financing_offers(id),
  assessment_id         uuid        REFERENCES public.capital_readiness_assessments(id),
  job_reference         text,
  company_id            uuid        REFERENCES public.companies(id),
  pack_status           text        NOT NULL
                                    CHECK (pack_status IN ('Draft', 'Generated', 'Shared', 'Expired'))
                                    DEFAULT 'Draft',
  pack_title            text,
  executive_summary     text,
  credit_summary        jsonb,      -- Section 1 & 2: offer + company intel
  evidence_summary      jsonb,      -- Sections 3–5: job + docs + shipment
  risk_summary          jsonb,      -- Section 6: risks
  recommended_conditions text,
  generated_by          uuid        REFERENCES auth.users(id),
  generated_at          timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "credit_packs_admin_all"
  ON public.credit_packs
  FOR ALL
  TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Capital partner: read packs where offer is shared with their company
CREATE POLICY "credit_packs_partner_read"
  ON public.credit_packs
  FOR SELECT
  TO authenticated
  USING (
    nexum_my_role() = 'capital_partner'
    AND offer_id IN (
      SELECT financing_offer_id
      FROM   public.capital_partner_access
      WHERE  capital_partner_company_id = nexum_my_company_id()
        AND  access_status IN ('Active', 'Invited')
    )
  );

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_credit_packs_offer_id      ON public.credit_packs(offer_id);
CREATE INDEX IF NOT EXISTS idx_credit_packs_assessment_id ON public.credit_packs(assessment_id);
CREATE INDEX IF NOT EXISTS idx_credit_packs_company_id    ON public.credit_packs(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_packs_status        ON public.credit_packs(pack_status);
CREATE INDEX IF NOT EXISTS idx_credit_packs_generated_at  ON public.credit_packs(generated_at DESC);

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_credit_packs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_packs_updated_at ON public.credit_packs;
CREATE TRIGGER trg_credit_packs_updated_at
  BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_credit_packs_updated_at();

-- ── 5. Summary view for Command Center / list pages ───────────────────────────

CREATE OR REPLACE VIEW public.v_credit_packs_summary AS
SELECT
  cp.id,
  cp.offer_id,
  cp.assessment_id,
  cp.job_reference,
  cp.company_id,
  cp.pack_status,
  cp.pack_title,
  cp.generated_at,
  cp.created_at,
  -- Extract key scalars from credit_summary JSONB for fast list display
  (cp.credit_summary ->> 'companyName')      AS company_name,
  (cp.credit_summary ->> 'productType')      AS product_type,
  (cp.credit_summary ->> 'offerAmount')::numeric AS offer_amount,
  (cp.credit_summary ->> 'currency')         AS currency,
  (cp.credit_summary ->> 'readinessStatus')  AS readiness_status,
  (cp.credit_summary ->> 'readinessScore')::numeric AS readiness_score,
  (cp.credit_summary ->> 'riskLevel')        AS risk_level,
  -- Extract risk counts from risk_summary JSONB
  (cp.risk_summary ->> 'openExceptions')::int    AS open_exceptions,
  (cp.risk_summary ->> 'criticalExceptions')::int AS critical_exceptions,
  (cp.risk_summary ->> 'overdueObligations')::int AS overdue_obligations
FROM public.credit_packs cp;
