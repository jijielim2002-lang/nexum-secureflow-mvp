-- ─── Net Settlement Statement v1 ─────────────────────────────────────────────
-- Settlement calculation and statement display only.
-- No real accounting, no auto-disbursement.

-- ── Main statement table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.net_settlement_statements (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference             text        NOT NULL,
  customer_company_id       uuid        REFERENCES public.companies(id),
  provider_company_id       uuid        REFERENCES public.companies(id),
  statement_status          text        NOT NULL DEFAULT 'Draft'
    CHECK (statement_status IN (
      'Draft','Generated','Under Review','Approved','Finalized','Disputed','Cancelled'
    )),
  currency                  text        NOT NULL DEFAULT 'RM',
  gross_job_value           numeric     NOT NULL DEFAULT 0,
  total_payment_obligations numeric     NOT NULL DEFAULT 0,
  total_held_amount         numeric     NOT NULL DEFAULT 0,
  total_verified_payments   numeric     NOT NULL DEFAULT 0,
  total_additional_charges  numeric     NOT NULL DEFAULT 0,
  total_claim_reserves      numeric     NOT NULL DEFAULT 0,
  total_claim_applied       numeric     NOT NULL DEFAULT 0,
  total_refunds             numeric     NOT NULL DEFAULT 0,
  net_release_eligible      numeric     NOT NULL DEFAULT 0,
  total_released            numeric     NOT NULL DEFAULT 0,
  outstanding_amount        numeric     NOT NULL DEFAULT 0,
  calculation_snapshot      jsonb,
  generated_by              uuid        REFERENCES auth.users(id),
  generated_at              timestamptz,
  approved_by               uuid        REFERENCES auth.users(id),
  approved_at               timestamptz,
  finalized_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ── Line items table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.net_settlement_line_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id  uuid        NOT NULL REFERENCES public.net_settlement_statements(id) ON DELETE CASCADE,
  job_reference text        NOT NULL,
  line_type     text        CHECK (line_type IN (
    'Job Value','Deposit','Balance','Full Payment',
    'Additional Charge','Claim Reserve','Claim Applied',
    'Refund','Release','Adjustment','Other'
  )),
  description   text,
  amount        numeric     NOT NULL,
  currency      text        NOT NULL DEFAULT 'RM',
  source_table  text,
  source_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_nss_job_reference
  ON public.net_settlement_statements (job_reference);

CREATE INDEX IF NOT EXISTS idx_nss_statement_status
  ON public.net_settlement_statements (statement_status);

CREATE INDEX IF NOT EXISTS idx_nss_customer_company
  ON public.net_settlement_statements (customer_company_id);

CREATE INDEX IF NOT EXISTS idx_nss_provider_company
  ON public.net_settlement_statements (provider_company_id);

CREATE INDEX IF NOT EXISTS idx_nsli_statement_id
  ON public.net_settlement_line_items (statement_id);

CREATE INDEX IF NOT EXISTS idx_nsli_job_reference
  ON public.net_settlement_line_items (job_reference);

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_net_settlement_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nss_updated_at ON public.net_settlement_statements;
CREATE TRIGGER trg_nss_updated_at
  BEFORE UPDATE ON public.net_settlement_statements
  FOR EACH ROW EXECUTE FUNCTION public.touch_net_settlement_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.net_settlement_statements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.net_settlement_line_items  ENABLE ROW LEVEL SECURITY;

-- Statements: Admin full access
CREATE POLICY nss_admin_all ON public.net_settlement_statements
  FOR ALL TO authenticated
  USING  (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Statements: Provider read (their jobs)
CREATE POLICY nss_provider_read ON public.net_settlement_statements
  FOR SELECT TO authenticated
  USING (
    provider_company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Statements: Customer read (their jobs)
CREATE POLICY nss_customer_read ON public.net_settlement_statements
  FOR SELECT TO authenticated
  USING (
    customer_company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Line items: Admin full access
CREATE POLICY nsli_admin_all ON public.net_settlement_line_items
  FOR ALL TO authenticated
  USING  (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Line items: Provider read (via statement)
CREATE POLICY nsli_provider_read ON public.net_settlement_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.net_settlement_statements nss
      WHERE nss.id = net_settlement_line_items.statement_id
        AND nss.provider_company_id = (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    )
  );

-- Line items: Customer read (via statement)
CREATE POLICY nsli_customer_read ON public.net_settlement_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.net_settlement_statements nss
      WHERE nss.id = net_settlement_line_items.statement_id
        AND nss.customer_company_id = (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    )
  );
