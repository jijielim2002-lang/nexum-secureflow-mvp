-- =============================================================================
-- NEXUM SECUREFLOW — Payment Holding & Controlled Release Layer v1
-- Generated: 2026-05-22
--
-- IMPORTANT COMPLIANCE NOTE:
--   This module records payment holding and release WORKFLOW STATUS only.
--   Actual fund holding and transfer must be performed through an approved
--   bank, licensed payment partner, or designated account arrangement.
--   This is NOT legal escrow. Nexum does not hold or disburse funds directly
--   unless configured with a licensed payment/finance partner.
--
-- TABLES:
--   1. payment_holding_accounts   — designated holding account references
--   2. held_payments              — per-job payment holding records
--   3. release_instructions       — formal release instruction workflow
--
-- RLS STRATEGY:
--   All tables use service-role for writes from API routes.
--   Authenticated reads are scoped by company or role via helper functions.
-- =============================================================================


-- =============================================================================
-- TABLE 1 — payment_holding_accounts
-- Master list of holding account references used across jobs.
-- Managed by Nexum Admin only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_holding_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name     text NOT NULL,
  account_type     text NOT NULL CHECK (account_type IN (
                     'Nexum Collection Account',
                     'Licensed Partner Account',
                     'Client Designated Account',
                     'Manual Holding Reference',
                     'Other'
                   )),
  currency         text NOT NULL DEFAULT 'RM',
  bank_name        text,
  account_reference text,
  status           text NOT NULL DEFAULT 'Pilot Only'
                     CHECK (status IN ('Active', 'Inactive', 'Pilot Only')),
  remarks          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_holding_accounts ENABLE ROW LEVEL SECURITY;

-- Admin can do everything; authenticated users can read active/pilot accounts.
CREATE POLICY "holding_accounts_select_authenticated"
  ON public.payment_holding_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "holding_accounts_all_admin"
  ON public.payment_holding_accounts FOR ALL
  TO authenticated
  USING (public.nexum_is_admin())
  WITH CHECK (public.nexum_is_admin());

-- Insert a pilot-mode default holding account so the UI has something to reference.
INSERT INTO public.payment_holding_accounts (
  account_name, account_type, currency, bank_name, account_reference, status, remarks
) VALUES (
  'Nexum Pilot Holding Reference',
  'Manual Holding Reference',
  'RM',
  'TBD — Pilot Mode',
  'NEXUM-PILOT-001',
  'Pilot Only',
  'Placeholder account for pilot MVP. Replace with actual licensed partner account before go-live.'
) ON CONFLICT DO NOTHING;


-- =============================================================================
-- TABLE 2 — held_payments
-- One row per payment obligation being tracked through the holding workflow.
-- Lifecycle: Awaiting Payment → Proof Uploaded → Payment Secured → Release Eligible
--            → Release Approved → Release Instructed → Released
-- Dispute path: → Disputed → (resolved) → Release Eligible / Refund Pending / Cancelled
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.held_payments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference             text NOT NULL,
  payment_obligation_id     uuid REFERENCES public.payment_obligations(id) ON DELETE SET NULL,
  payer_company_id          uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  payee_company_id          uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  holding_account_id        uuid REFERENCES public.payment_holding_accounts(id) ON DELETE SET NULL,
  amount                    numeric NOT NULL CHECK (amount >= 0),
  currency                  text NOT NULL DEFAULT 'RM',
  holding_status            text NOT NULL DEFAULT 'Awaiting Payment'
                              CHECK (holding_status IN (
                                'Awaiting Payment',
                                'Proof Uploaded',
                                'Funds Received',
                                'Payment Secured',
                                'Release Eligible',
                                'Release Approved',
                                'Release Instructed',
                                'Released',
                                'Disputed',
                                'Refund Pending',
                                'Refunded',
                                'Cancelled'
                              )),
  payment_type              text,              -- 'Deposit', 'Balance', 'Full Payment'
  payment_reference         text,              -- customer bank ref / TT ref
  payment_proof_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  funds_received_at         timestamptz,
  secured_at                timestamptz,
  release_eligible_at       timestamptz,
  release_approved_at       timestamptz,
  release_approved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  release_instructed_at     timestamptz,
  released_at               timestamptz,
  release_note              text,
  dispute_case_id           uuid REFERENCES public.dispute_cases(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS held_payments_job_reference_idx
  ON public.held_payments (job_reference);
CREATE INDEX IF NOT EXISTS held_payments_holding_status_idx
  ON public.held_payments (holding_status);
CREATE INDEX IF NOT EXISTS held_payments_payer_company_idx
  ON public.held_payments (payer_company_id);
CREATE INDEX IF NOT EXISTS held_payments_payee_company_idx
  ON public.held_payments (payee_company_id);

ALTER TABLE public.held_payments ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "held_payments_admin_all"
  ON public.held_payments FOR ALL
  TO authenticated
  USING (public.nexum_is_admin())
  WITH CHECK (public.nexum_is_admin());

-- Customer company: read own payer rows
CREATE POLICY "held_payments_customer_select"
  ON public.held_payments FOR SELECT
  TO authenticated
  USING (payer_company_id = public.nexum_my_company_id());

-- Provider company: read own payee rows
CREATE POLICY "held_payments_provider_select"
  ON public.held_payments FOR SELECT
  TO authenticated
  USING (payee_company_id = public.nexum_my_company_id());


-- =============================================================================
-- TABLE 3 — release_instructions
-- Formal record that admin has approved and instructed a payment release.
-- Each held_payment that reaches Release Eligible gets a release_instruction.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.release_instructions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference    text NOT NULL,
  held_payment_id  uuid REFERENCES public.held_payments(id) ON DELETE CASCADE,
  payee_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  amount           numeric NOT NULL CHECK (amount >= 0),
  currency         text NOT NULL DEFAULT 'RM',
  release_type     text NOT NULL
                     CHECK (release_type IN (
                       'Deposit Release',
                       'Balance Release',
                       'Full Payment Release',
                       'Partial Release',
                       'Refund',
                       'Other'
                     )),
  release_status   text NOT NULL DEFAULT 'Draft'
                     CHECK (release_status IN (
                       'Draft',
                       'Pending Approval',
                       'Approved',
                       'Instructed',
                       'Completed',
                       'Rejected',
                       'Cancelled'
                     )),
  approval_reason  text,
  approved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  instructed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  instructed_at    timestamptz,
  completed_at     timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS release_instructions_job_reference_idx
  ON public.release_instructions (job_reference);
CREATE INDEX IF NOT EXISTS release_instructions_held_payment_idx
  ON public.release_instructions (held_payment_id);
CREATE INDEX IF NOT EXISTS release_instructions_release_status_idx
  ON public.release_instructions (release_status);

ALTER TABLE public.release_instructions ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "release_instructions_admin_all"
  ON public.release_instructions FOR ALL
  TO authenticated
  USING (public.nexum_is_admin())
  WITH CHECK (public.nexum_is_admin());

-- Customer / Provider: read by company on held_payment
CREATE POLICY "release_instructions_company_select"
  ON public.release_instructions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.held_payments hp
      WHERE hp.id = release_instructions.held_payment_id
        AND (
          hp.payer_company_id  = public.nexum_my_company_id() OR
          hp.payee_company_id  = public.nexum_my_company_id()
        )
    )
  );


-- =============================================================================
-- VERIFICATION QUERIES
-- Run after applying to confirm tables and policies exist.
-- =============================================================================

-- List new tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('payment_holding_accounts', 'held_payments', 'release_instructions');

-- List policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('payment_holding_accounts', 'held_payments', 'release_instructions')
ORDER BY tablename, cmd;
