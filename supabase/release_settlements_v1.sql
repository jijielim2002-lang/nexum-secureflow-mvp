-- =============================================================================
-- NEXUM SECUREFLOW — Release / Settlement Reconciliation v1
-- Generated: 2026-05-23
--
-- PURPOSE:
--   After a held payment is approved for release and the release instruction
--   is issued, Nexum Admin must track whether the actual payout/settlement to
--   the service provider was completed and reconciled.
--
--   This is manual settlement reconciliation only.
--   No bank API is connected. Admin records actual transfer details and
--   reconciles against the release instruction amount.
--
-- WORKFLOW:
--   1. Release instruction approved
--      → release_settlements row created (status = 'Pending')
--
--   2. Release instructed
--      → release_settlements.settlement_status = 'Processing'
--      → held_payment.holding_status = 'Release Instructed'
--
--   3. Admin enters actual release details
--      → actual_released_amount, payee_bank_name, bank_transaction_reference, etc.
--
--   4. Admin marks:
--      → 'Released'        — transfer processed through bank/partner (not yet reconciled)
--      → 'Amount Mismatch' — actual amount ≠ expected
--      → 'Failed'          — transfer failed
--      → 'Reconciled'      — amount confirmed, books closed
--
--   5. Only when settlement_status = 'Reconciled':
--      → held_payment.holding_status = 'Released'
--      → release_instruction.release_status = 'Completed'
--      → if all held payments for job are Released/Cancelled:
--            secured_jobs.job_status = 'Completed'
--            secured_jobs.current_milestone = 'Job Closed'
--            secured_jobs.payment_status = 'Fully Paid'
--
-- COMPLIANCE:
--   Do NOT say "Nexum transferred funds automatically."
--   Use: "Release instruction recorded", "Settlement marked as processed",
--        "Settlement reconciled", "Actual transfer must be processed through
--         approved bank or payment partner."
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.release_settlements (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  release_instruction_id    uuid        REFERENCES public.release_instructions(id) ON DELETE SET NULL,
  held_payment_id           uuid        REFERENCES public.held_payments(id) ON DELETE SET NULL,
  job_reference             text        NOT NULL,
  payee_company_id          uuid        REFERENCES public.companies(id) ON DELETE SET NULL,

  -- Amounts
  expected_release_amount   numeric     NOT NULL,
  actual_released_amount    numeric,
  currency                  text        NOT NULL DEFAULT 'RM',

  -- Payee details (filled in by admin)
  payee_name                text,
  payee_bank_name           text,
  payee_account_reference   text,

  -- References
  release_reference         text,
  bank_transaction_reference text,

  -- Status
  settlement_status         text        NOT NULL DEFAULT 'Pending'
                              CHECK (settlement_status IN (
                                'Pending',
                                'Processing',
                                'Released',
                                'Amount Mismatch',
                                'Reference Mismatch',
                                'Failed',
                                'Cancelled',
                                'Reconciled'
                              )),

  -- Timestamps
  released_at               timestamptz,
  reconciled_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reconciled_at             timestamptz,

  -- Notes
  reconciliation_note       text,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS rs_job_reference_idx
  ON public.release_settlements (job_reference);
CREATE INDEX IF NOT EXISTS rs_held_payment_idx
  ON public.release_settlements (held_payment_id);
CREATE INDEX IF NOT EXISTS rs_release_instruction_idx
  ON public.release_settlements (release_instruction_id);
CREATE INDEX IF NOT EXISTS rs_status_idx
  ON public.release_settlements (settlement_status);
CREATE INDEX IF NOT EXISTS rs_payee_company_idx
  ON public.release_settlements (payee_company_id);
CREATE INDEX IF NOT EXISTS rs_created_at_idx
  ON public.release_settlements (created_at);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.release_settlements ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "rs_admin_all"
  ON public.release_settlements FOR ALL
  TO authenticated
  USING  (public.nexum_is_admin())
  WITH CHECK (public.nexum_is_admin());

-- Service provider (payee): read own settlement rows
CREATE POLICY "rs_provider_select"
  ON public.release_settlements FOR SELECT
  TO authenticated
  USING (payee_company_id = public.nexum_my_company_id());

-- Customer: read settlements linked to their held payments
-- (via held_payments.payer_company_id)
CREATE POLICY "rs_customer_select"
  ON public.release_settlements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.held_payments hp
      WHERE hp.id = release_settlements.held_payment_id
        AND hp.payer_company_id = public.nexum_my_company_id()
    )
  );

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'release_settlements';

SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'release_settlements'
ORDER BY cmd;
