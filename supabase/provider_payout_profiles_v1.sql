-- =============================================================================
-- NEXUM SECUREFLOW — Provider Payout Profile v1
-- Generated: 2026-05-24
--
-- PURPOSE:
--   Allow service providers to maintain payout/bank details for settlement.
--   Nexum Admin verifies payout details before any release instruction is
--   processed to ensure funds can be directed to the correct payee.
--
-- SECURITY NOTICE:
--   Full bank account numbers are NOT stored here.
--   Only a masked account reference is stored.
--   Full payout details must be stored through secure payment/banking partner
--   infrastructure in production.
--
-- WORKFLOW:
--   1. Provider submits payout details (status = 'Submitted')
--      → Nexum Admin notified to verify
--
--   2. Admin verifies or rejects:
--      → Verified: release instructions may proceed
--      → Rejected: provider notified with reason, must re-submit
--      → Suspended: all releases blocked until investigated
--
--   3. Release instruction 'instruct' action checks:
--      → provider_payout_profiles.verification_status = 'Verified'
--      → If not verified, action is blocked with error message
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.provider_payout_profiles (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Payout details (no sensitive full account numbers)
  account_holder_name      text,
  bank_name                text,
  bank_country             text        NOT NULL DEFAULT 'Malaysia',
  currency                 text        NOT NULL DEFAULT 'RM',
  account_reference_masked text,       -- e.g. "****1234" — NEVER full account number
  payout_method            text        NOT NULL DEFAULT 'Bank Transfer'
                             CHECK (payout_method IN (
                               'Bank Transfer',
                               'Payment Partner',
                               'Manual Settlement',
                               'Other'
                             )),

  -- Verification
  verification_status      text        NOT NULL DEFAULT 'Pending'
                             CHECK (verification_status IN (
                               'Pending',
                               'Submitted',
                               'Verified',
                               'Rejected',
                               'Suspended'
                             )),
  verification_document_id uuid        REFERENCES public.documents(id) ON DELETE SET NULL,
  verified_by              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at              timestamptz,
  rejection_reason         text,
  remarks                  text,       -- admin internal remarks

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Unique: one active profile per company (enforce in application logic;
-- allow multiple historical rows for audit trail if needed)
CREATE UNIQUE INDEX IF NOT EXISTS payout_profile_company_unique
  ON public.provider_payout_profiles (provider_company_id)
  WHERE verification_status NOT IN ('Rejected', 'Suspended');

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS payout_profile_company_idx
  ON public.provider_payout_profiles (provider_company_id);
CREATE INDEX IF NOT EXISTS payout_profile_status_idx
  ON public.provider_payout_profiles (verification_status);
CREATE INDEX IF NOT EXISTS payout_profile_created_at_idx
  ON public.provider_payout_profiles (created_at);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.provider_payout_profiles ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "payout_profile_admin_all"
  ON public.provider_payout_profiles FOR ALL
  TO authenticated
  USING  (public.nexum_is_admin())
  WITH CHECK (public.nexum_is_admin());

-- Provider: read/insert/update own profile only
CREATE POLICY "payout_profile_provider_select"
  ON public.provider_payout_profiles FOR SELECT
  TO authenticated
  USING (provider_company_id = public.nexum_my_company_id());

CREATE POLICY "payout_profile_provider_insert"
  ON public.provider_payout_profiles FOR INSERT
  TO authenticated
  WITH CHECK (provider_company_id = public.nexum_my_company_id());

CREATE POLICY "payout_profile_provider_update"
  ON public.provider_payout_profiles FOR UPDATE
  TO authenticated
  USING (
    provider_company_id = public.nexum_my_company_id()
    AND verification_status IN ('Pending', 'Rejected')  -- can only update if not yet verified/suspended
  )
  WITH CHECK (provider_company_id = public.nexum_my_company_id());

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'provider_payout_profiles';

SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'provider_payout_profiles'
ORDER BY cmd;
