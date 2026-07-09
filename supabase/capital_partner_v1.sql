-- ─────────────────────────────────────────────────────────────────────────────
-- Capital Partner Portal v1
-- Run in Supabase SQL editor (service role / postgres role required)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add capital_partner to profiles role constraint ────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'service_provider', 'customer', 'capital_partner'));

-- ── 2. Add partner interest fields to simulated_financing_offers ──────────────

ALTER TABLE public.simulated_financing_offers
  ADD COLUMN IF NOT EXISTS partner_interest_status text
    CHECK (partner_interest_status IN ('Interested', 'Need More Info', 'Declined')),
  ADD COLUMN IF NOT EXISTS partner_interest_note  text,
  ADD COLUMN IF NOT EXISTS partner_viewed_at      timestamptz;

-- ── 3. Create capital_partner_access table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.capital_partner_access (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_partner_company_id uuid        REFERENCES public.companies(id),
  financing_offer_id         uuid        REFERENCES public.simulated_financing_offers(id),
  job_reference              text,
  company_id                 uuid        REFERENCES public.companies(id),
  access_status              text        NOT NULL
                                         CHECK (access_status IN ('Invited', 'Active', 'Revoked', 'Expired'))
                                         DEFAULT 'Invited',
  access_expires_at          timestamptz,
  created_by                 uuid        REFERENCES auth.users(id),
  created_at                 timestamptz DEFAULT now()
);

-- ── 4. RLS on capital_partner_access ─────────────────────────────────────────

ALTER TABLE public.capital_partner_access ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "capital_partner_access_admin_all"
  ON public.capital_partner_access
  FOR ALL
  TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Capital partner: read own active/invited records
CREATE POLICY "capital_partner_access_partner_read_own"
  ON public.capital_partner_access
  FOR SELECT
  TO authenticated
  USING (
    nexum_my_role() = 'capital_partner'
    AND capital_partner_company_id = nexum_my_company_id()
    AND access_status IN ('Active', 'Invited')
  );

-- ── 5. RLS additions on simulated_financing_offers ────────────────────────────
-- Capital partners may read offers that have been shared with their company.
-- (Add this policy alongside existing admin/provider/customer policies.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'simulated_financing_offers'
      AND policyname = 'simulated_financing_offers_capital_partner_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "simulated_financing_offers_capital_partner_read"
        ON public.simulated_financing_offers
        FOR SELECT
        TO authenticated
        USING (
          nexum_my_role() = 'capital_partner'
          AND id IN (
            SELECT financing_offer_id
            FROM   public.capital_partner_access
            WHERE  capital_partner_company_id = nexum_my_company_id()
              AND  access_status IN ('Active', 'Invited')
          )
        )
    $pol$;
  END IF;
END $$;

-- ── 6. Helper view: v_capital_partner_opportunities ──────────────────────────
-- Joins access record with offer + company intel for the partner dashboard.

CREATE OR REPLACE VIEW public.v_capital_partner_opportunities AS
SELECT
  cpa.id                         AS access_id,
  cpa.capital_partner_company_id,
  cpa.financing_offer_id,
  cpa.job_reference,
  cpa.company_id,
  cpa.access_status,
  cpa.access_expires_at,
  cpa.created_at                 AS shared_at,

  sfo.product_type,
  sfo.offer_status,
  sfo.offer_amount,
  sfo.currency,
  sfo.tenure_days,
  sfo.estimated_fee,
  sfo.repayment_source,
  sfo.conditions,
  sfo.risk_notes,
  sfo.expires_at,
  sfo.generated_at,
  sfo.partner_interest_status,
  sfo.partner_interest_note,
  sfo.partner_viewed_at,
  sfo.company_name,

  cip.overall_trust_score,
  cip.risk_level,
  cip.trend,
  cip.payment_behavior_score,
  cip.operational_reliability_score,
  cip.financing_readiness

FROM public.capital_partner_access   cpa
JOIN public.simulated_financing_offers sfo ON sfo.id = cpa.financing_offer_id
LEFT JOIN public.company_intelligence_profiles cip ON cip.company_id = cpa.company_id;

-- ── 7. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cpa_partner_company ON public.capital_partner_access(capital_partner_company_id);
CREATE INDEX IF NOT EXISTS idx_cpa_offer           ON public.capital_partner_access(financing_offer_id);
CREATE INDEX IF NOT EXISTS idx_cpa_status          ON public.capital_partner_access(access_status);
