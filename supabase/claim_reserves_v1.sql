-- ─── Claims / Recovery Reserve Ledger v1 ──────────────────────────────────────
--
-- COMPLIANCE NOTE:
--   This table records internal reserve workflow status only.
--   No funds are auto-deducted. All reserve actions require admin approval.
--   This is not a legal determination of liability or a binding financial obligation.
--   All positions are preliminary and require admin, legal, and insurance review.

-- ── claim_reserves table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.claim_reserves (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference          text        NOT NULL,
  dispute_case_id        uuid        REFERENCES public.dispute_cases(id),
  liability_review_id    uuid        REFERENCES public.liability_reviews(id),
  held_payment_id        uuid        REFERENCES public.held_payments(id),
  release_instruction_id uuid        REFERENCES public.release_instructions(id),
  reserve_type           text        CHECK (reserve_type IN (
                           'Cargo Damage',
                           'Short Delivery',
                           'Late Delivery',
                           'POD Dispute',
                           'Payment Dispute',
                           'Insurance Deductible',
                           'Potential Refund',
                           'Other'
                         )),
  reserve_status         text        NOT NULL DEFAULT 'Draft'
                         CHECK (reserve_status IN (
                           'Draft',
                           'Active',
                           'Adjusted',
                           'Released',
                           'Applied',
                           'Cancelled'
                         )),
  reserve_amount         numeric     NOT NULL,
  currency               text        NOT NULL DEFAULT 'RM',
  reason                 text,
  created_by             uuid        REFERENCES auth.users(id),
  approved_by            uuid        REFERENCES auth.users(id),
  approved_at            timestamptz,
  applied_amount         numeric,
  released_amount        numeric,
  resolution_note        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS claim_reserves_job_reference_idx
  ON public.claim_reserves (job_reference);

CREATE INDEX IF NOT EXISTS claim_reserves_dispute_case_id_idx
  ON public.claim_reserves (dispute_case_id)
  WHERE dispute_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS claim_reserves_liability_review_id_idx
  ON public.claim_reserves (liability_review_id)
  WHERE liability_review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS claim_reserves_reserve_status_idx
  ON public.claim_reserves (reserve_status);

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_claim_reserves_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_reserves_updated_at ON public.claim_reserves;
CREATE TRIGGER trg_claim_reserves_updated_at
  BEFORE UPDATE ON public.claim_reserves
  FOR EACH ROW EXECUTE FUNCTION public.set_claim_reserves_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.claim_reserves ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "cr_admin_all"
  ON public.claim_reserves
  FOR ALL
  USING (nexum_is_admin());

-- Service provider: read own job's reserves
CREATE POLICY "cr_provider_read"
  ON public.claim_reserves
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'service_provider'
    AND job_reference IN (
      SELECT job_reference FROM public.secured_jobs
      WHERE service_provider_company_id = (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Customer: read own job's reserves
CREATE POLICY "cr_customer_read"
  ON public.claim_reserves
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'customer'
    AND job_reference IN (
      SELECT job_reference FROM public.secured_jobs
      WHERE customer_company_id = (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE  public.claim_reserves IS
  'Internal claim reserve records for payment control workflow. Records only — no auto-deduction. Requires admin approval.';
COMMENT ON COLUMN public.claim_reserves.reserve_amount   IS 'Proposed reserve amount — does not auto-deduct held funds.';
COMMENT ON COLUMN public.claim_reserves.applied_amount   IS 'Amount actually applied after resolution — admin action only.';
COMMENT ON COLUMN public.claim_reserves.released_amount  IS 'Amount released back to held payment pool after resolution.';
