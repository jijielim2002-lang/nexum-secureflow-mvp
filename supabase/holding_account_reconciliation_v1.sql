-- =============================================================================
-- NEXUM SECUREFLOW — Holding Account Reconciliation v1
-- Generated: 2026-05-23
--
-- PURPOSE:
--   Allow Nexum Admin to reconcile customer payment proof against actual
--   holding account / bank / payment partner records before marking payment
--   as secured.
--
--   This is manual reconciliation only. No real bank API is connected.
--   Admin compares customer-submitted proof against actual received records
--   and records the outcome before allowing payment to be marked secured.
--
-- WORKFLOW:
--   1. Customer uploads payment proof
--      → held_payment.holding_status = 'Proof Uploaded'
--      → holding_account_reconciliations row created (status = 'Pending')
--
--   2. Admin reviews proof vs. actual received record
--      → Fills in received_amount, bank_reference, received_at
--      → Marks: Matched / Amount Mismatch / Reference Mismatch /
--               Duplicate Suspected / Unclear / Rejected
--
--   3. Only when reconciliation_status = 'Matched':
--      → Admin may proceed to "Mark Payment Secured"
--      → held_payment.holding_status = 'Payment Secured'
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.holding_account_reconciliations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  held_payment_id         uuid        REFERENCES public.held_payments(id) ON DELETE SET NULL,
  payment_obligation_id   uuid        REFERENCES public.payment_obligations(id) ON DELETE SET NULL,
  job_reference           text        NOT NULL,
  holding_account_id      uuid        REFERENCES public.payment_holding_accounts(id) ON DELETE SET NULL,
  expected_amount         numeric,
  received_amount         numeric,
  currency                text        NOT NULL DEFAULT 'RM',
  payer_name              text,
  payer_company_id        uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  bank_reference          text,
  payment_reference       text,
  received_at             timestamptz,
  reconciliation_status   text        NOT NULL DEFAULT 'Pending'
                            CHECK (reconciliation_status IN (
                              'Pending',
                              'Matched',
                              'Amount Mismatch',
                              'Reference Mismatch',
                              'Duplicate Suspected',
                              'Unclear',
                              'Rejected'
                            )),
  reconciliation_note     text,
  reconciled_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reconciled_at           timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recon_job_reference_idx
  ON public.holding_account_reconciliations (job_reference);
CREATE INDEX IF NOT EXISTS recon_held_payment_idx
  ON public.holding_account_reconciliations (held_payment_id);
CREATE INDEX IF NOT EXISTS recon_status_idx
  ON public.holding_account_reconciliations (reconciliation_status);
CREATE INDEX IF NOT EXISTS recon_created_at_idx
  ON public.holding_account_reconciliations (created_at);

ALTER TABLE public.holding_account_reconciliations ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "recon_admin_all"
  ON public.holding_account_reconciliations FOR ALL
  TO authenticated
  USING  (public.nexum_is_admin())
  WITH CHECK (public.nexum_is_admin());

-- Customer company: read own payer rows (to see mismatch notices)
CREATE POLICY "recon_customer_select"
  ON public.holding_account_reconciliations FOR SELECT
  TO authenticated
  USING (payer_company_id = public.nexum_my_company_id());

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'holding_account_reconciliations';

SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'holding_account_reconciliations'
ORDER BY cmd;
