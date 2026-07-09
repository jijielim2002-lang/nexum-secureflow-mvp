-- ─── Payment Terms Recommendations v1 ────────────────────────────────────────
-- Decision-support table for Nexum payment terms recommendation engine.
-- NOT automatic enforcement. Provider/admin can accept or override.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_terms_recommendations (
  id                                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context references (any/all can be set)
  job_reference                              text,
  quotation_reference                        text,
  rfq_reference                              text,

  -- Parties
  customer_company_id                        uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  provider_company_id                        uuid        REFERENCES public.companies(id) ON DELETE SET NULL,

  -- Recommendation output
  recommendation_type                        text        NOT NULL
    CHECK (recommendation_type IN (
      'Full Payment Before Execution',
      'Deposit + Balance',
      'Milestone Release',
      'Higher Deposit Required',
      'Standard Terms',
      'Low-Risk Flexible Terms',
      'Manual Review Required'
    )),
  recommended_deposit_percentage             numeric,
  recommended_deposit_amount                 numeric,
  recommended_balance_amount                 numeric,
  recommended_release_condition              text,
  recommended_delivery_confirmation_window_hours integer  DEFAULT 48,

  -- Risk metadata
  risk_level                                 text        NOT NULL DEFAULT 'Medium'
    CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  rationale                                  text,
  key_risk_factors                           jsonb       DEFAULT '[]'::jsonb,

  -- Scores used at time of generation
  customer_score                             numeric,
  provider_score                             numeric,

  -- Trade context used
  incoterm                                   text,
  job_value                                  numeric,
  currency                                   text        DEFAULT 'RM',

  -- Override tracking
  was_accepted                               boolean,
  was_overridden                             boolean     DEFAULT false,
  override_reason                            text,
  override_by_role                           text,
  override_by_name                           text,
  overridden_at                              timestamptz,

  -- Metadata
  created_by_system                          boolean     DEFAULT true,
  created_at                                 timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS ptr_job_ref_idx        ON public.payment_terms_recommendations (job_reference);
CREATE INDEX IF NOT EXISTS ptr_quotation_ref_idx  ON public.payment_terms_recommendations (quotation_reference);
CREATE INDEX IF NOT EXISTS ptr_customer_idx       ON public.payment_terms_recommendations (customer_company_id);
CREATE INDEX IF NOT EXISTS ptr_provider_idx       ON public.payment_terms_recommendations (provider_company_id);
CREATE INDEX IF NOT EXISTS ptr_risk_level_idx     ON public.payment_terms_recommendations (risk_level);
CREATE INDEX IF NOT EXISTS ptr_type_idx           ON public.payment_terms_recommendations (recommendation_type);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_terms_recommendations ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY ptr_admin_all ON public.payment_terms_recommendations
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Provider: read recommendations for jobs/quotations they are party to
CREATE POLICY ptr_provider_read ON public.payment_terms_recommendations
  FOR SELECT TO authenticated
  USING (
    provider_company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'service_provider'
    )
  );

-- Customer: read recommendations for jobs/quotations they are party to
CREATE POLICY ptr_customer_read ON public.payment_terms_recommendations
  FOR SELECT TO authenticated
  USING (
    customer_company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'customer'
    )
  );
