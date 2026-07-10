-- =============================================================================
-- NEXUM SECUREFLOW — Payment Obligation Ledger v1
-- =============================================================================

-- ── 1. payment_obligations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_obligations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference       text        NOT NULL,
  payer_company_id    uuid        REFERENCES public.companies(id),
  payee_company_id    uuid        REFERENCES public.companies(id),
  obligation_type     text        NOT NULL CHECK (obligation_type IN (
                                    'Deposit', 'Balance', 'Full Payment',
                                    'Additional Charges', 'Refund', 'Other'
                                  )),
  amount              numeric     NOT NULL,
  currency            text        NOT NULL DEFAULT 'RM',
  due_date            date,
  status              text        NOT NULL DEFAULT 'Pending' CHECK (status IN (
                                    'Pending', 'Proof Uploaded', 'Verified',
                                    'Overdue', 'Disputed', 'Waived'
                                  )),
  proof_document_id   uuid        REFERENCES public.documents(id),
  verified_by         uuid        REFERENCES auth.users(id),
  verified_at         timestamptz,
  remarks             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS payment_obligations_job_ref_idx
  ON public.payment_obligations (job_reference);
CREATE INDEX IF NOT EXISTS payment_obligations_payer_idx
  ON public.payment_obligations (payer_company_id);
CREATE INDEX IF NOT EXISTS payment_obligations_payee_idx
  ON public.payment_obligations (payee_company_id);
CREATE INDEX IF NOT EXISTS payment_obligations_status_idx
  ON public.payment_obligations (status);
CREATE INDEX IF NOT EXISTS payment_obligations_due_date_idx
  ON public.payment_obligations (due_date);

-- updated_at trigger (re-use pattern from other tables)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS payment_obligations_updated_at ON public.payment_obligations;
CREATE TRIGGER payment_obligations_updated_at
  BEFORE UPDATE ON public.payment_obligations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. payment_ledger_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_ledger_events (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_obligation_id   uuid        NOT NULL REFERENCES public.payment_obligations(id) ON DELETE CASCADE,
  job_reference           text        NOT NULL,
  event_type              text,
  event_description       text,
  amount                  numeric,
  currency                text,
  actor_role              text,
  actor_user_id           uuid        REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_ledger_events_obligation_idx
  ON public.payment_ledger_events (payment_obligation_id);
CREATE INDEX IF NOT EXISTS payment_ledger_events_job_ref_idx
  ON public.payment_ledger_events (job_reference);


-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_obligations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_ledger_events ENABLE ROW LEVEL SECURITY;

-- payment_obligations: admin full, provider sees obligations for their jobs (payee),
-- customer sees obligations for their jobs (payer).

CREATE POLICY "pay_ob_select_admin"
  ON public.payment_obligations FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "pay_ob_select_provider"
  ON public.payment_obligations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = payment_obligations.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "pay_ob_select_customer"
  ON public.payment_obligations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = payment_obligations.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );

-- INSERT: service role only (API route). Allow authenticated as fallback:
CREATE POLICY "pay_ob_insert_authenticated"
  ON public.payment_obligations FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: service role only (API route). Allow authenticated as fallback:
CREATE POLICY "pay_ob_update_authenticated"
  ON public.payment_obligations FOR UPDATE TO authenticated
  USING (true);

-- payment_ledger_events: same access as obligations.
CREATE POLICY "pay_ev_select_admin"
  ON public.payment_ledger_events FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "pay_ev_select_provider"
  ON public.payment_ledger_events FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = payment_ledger_events.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "pay_ev_select_customer"
  ON public.payment_ledger_events FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = payment_ledger_events.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "pay_ev_insert_authenticated"
  ON public.payment_ledger_events FOR INSERT TO authenticated
  WITH CHECK (true);


-- ── 4. Helper view: outstanding per job ───────────────────────────────────────

CREATE OR REPLACE VIEW public.v_job_payment_summary AS
SELECT
  job_reference,
  currency,
  SUM(amount)                                                    AS total_obligation,
  SUM(CASE WHEN status = 'Verified'  THEN amount ELSE 0 END)    AS total_verified,
  SUM(CASE WHEN status = 'Waived'    THEN amount ELSE 0 END)    AS total_waived,
  SUM(CASE WHEN status NOT IN ('Verified','Waived') THEN amount ELSE 0 END)
                                                                 AS total_outstanding,
  COUNT(*) FILTER (WHERE status = 'Overdue')                    AS overdue_count,
  COUNT(*) FILTER (WHERE status = 'Proof Uploaded')             AS proof_uploaded_count,
  COUNT(*) FILTER (WHERE status = 'Disputed')                   AS disputed_count,
  BOOL_AND(status IN ('Verified','Waived'))                     AS fully_paid,
  MAX(due_date)                                                  AS latest_due_date
FROM public.payment_obligations
GROUP BY job_reference, currency;
