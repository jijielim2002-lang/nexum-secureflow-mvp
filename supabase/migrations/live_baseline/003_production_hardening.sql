-- =============================================================================
-- 003 PRODUCTION HARDENING
-- Run this against your Supabase PRODUCTION project SQL editor.
-- Safe to re-run (all changes are IF NOT EXISTS / ALTER COLUMN idempotent).
-- =============================================================================

-- =============================================================================
-- 1. COMPANIES — expand status values + add approval columns
-- =============================================================================

-- Drop the old check constraint so we can add new statuses
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_status_check;

-- Add the new constraint with all required statuses
ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check
    CHECK (status IN (
      'Pending Review',   -- registered, awaiting admin action
      'Info Required',    -- admin asked for more documents/info
      'Approved',         -- approved but not yet used platform
      'Active',           -- approved + has activity
      'Rejected',         -- registration rejected
      'Suspended',        -- temporarily suspended
      'Blacklisted'       -- permanently barred
    ));

-- Set new registrations to Pending Review by default
ALTER TABLE public.companies
  ALTER COLUMN status SET DEFAULT 'Pending Review';

-- Approval tracking columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS approval_status       text,
  ADD COLUMN IF NOT EXISTS approved_at           timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason      text,
  ADD COLUMN IF NOT EXISTS review_notes          text,
  ADD COLUMN IF NOT EXISTS registration_submitted_at timestamptz DEFAULT now();

-- Back-fill: existing Active companies are already approved
UPDATE public.companies
  SET approval_status = 'Approved'
  WHERE status = 'Active' AND approval_status IS NULL;

UPDATE public.companies
  SET approval_status = 'Pending Review'
  WHERE status NOT IN ('Active') AND approval_status IS NULL;

-- Index for approval queue lookups
CREATE INDEX IF NOT EXISTS idx_companies_approval_status
  ON public.companies (approval_status);

-- =============================================================================
-- 2. COMPANY APPROVAL AUDIT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_approval_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action          text        NOT NULL
                              CHECK (action IN (
                                'Submitted',
                                'Approved',
                                'Rejected',
                                'Info Required',
                                'Suspended',
                                'Blacklisted',
                                'Reinstated',
                                'Note Added'
                              )),
  previous_status text,
  new_status      text,
  actor_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name      text,
  actor_role      text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_approval_logs_company_id
  ON public.company_approval_logs (company_id);

CREATE INDEX IF NOT EXISTS idx_company_approval_logs_created_at
  ON public.company_approval_logs (created_at DESC);

ALTER TABLE public.company_approval_logs ENABLE ROW LEVEL SECURITY;

-- Admin can do everything; non-admins cannot read approval logs
CREATE POLICY "company_approval_logs_admin"
  ON public.company_approval_logs FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- =============================================================================
-- 3. PLATFORM BANK ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_bank_accounts (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_holder_name       text        NOT NULL,
  bank_name                 text        NOT NULL,
  account_number            text        NOT NULL,
  swift_code                text,
  currency                  text        NOT NULL DEFAULT 'MYR',
  account_type              text        NOT NULL DEFAULT 'Current'
                            CHECK (account_type IN ('Current', 'Savings', 'FD', 'Other')),
  status                    text        NOT NULL DEFAULT 'Active'
                            CHECK (status IN ('Active', 'Inactive')),
  is_default                boolean     NOT NULL DEFAULT false,
  payment_instruction_note  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Only one default account per currency
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_bank_accounts_default_currency
  ON public.platform_bank_accounts (currency)
  WHERE is_default = true AND status = 'Active';

ALTER TABLE public.platform_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "platform_bank_accounts_admin"
  ON public.platform_bank_accounts FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Authenticated users: can only SELECT active accounts (needed for payment instructions)
CREATE POLICY "platform_bank_accounts_select_active"
  ON public.platform_bank_accounts FOR SELECT TO authenticated
  USING (status = 'Active');

-- Updated_at trigger
DROP TRIGGER IF EXISTS platform_bank_accounts_updated_at ON public.platform_bank_accounts;
CREATE TRIGGER platform_bank_accounts_updated_at
  BEFORE UPDATE ON public.platform_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 4. PROFILES — expand status to match companies
-- =============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
    CHECK (status IN (
      'Pending Review',
      'Active',
      'Inactive',
      'Suspended',
      'Rejected'
    ));

-- =============================================================================
-- 5. RLS GATES — block Pending/Rejected/Suspended from operational actions
-- =============================================================================

-- Helper: is the current user's company approved (Active or Approved status)?
CREATE OR REPLACE FUNCTION public.nexum_company_is_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.profiles p ON p.company_id = c.id
    WHERE p.id = auth.uid()
      AND c.status IN ('Approved', 'Active')
  );
$$;

-- secured_jobs INSERT: only approved companies (or admin) can create jobs
DROP POLICY IF EXISTS "secured_jobs_insert_provider" ON public.secured_jobs;
CREATE POLICY "secured_jobs_insert_provider"
  ON public.secured_jobs FOR INSERT TO authenticated
  WITH CHECK (
    nexum_is_admin()
    OR (
      nexum_my_role() = 'service_provider'
      AND service_provider_company_id = nexum_my_company_id()
      AND nexum_company_is_approved()
    )
  );

-- secured_jobs UPDATE for customer acceptance: only approved companies
DROP POLICY IF EXISTS "secured_jobs_update_customer" ON public.secured_jobs;
CREATE POLICY "secured_jobs_update_customer"
  ON public.secured_jobs FOR UPDATE TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND customer_company_id = nexum_my_company_id()
    AND nexum_company_is_approved()
  )
  WITH CHECK (
    nexum_my_role() = 'customer'
    AND customer_company_id = nexum_my_company_id()
    AND nexum_company_is_approved()
  );

-- payment_proof_uploads INSERT: only approved companies
DROP POLICY IF EXISTS "payment_proof_uploads_insert" ON public.payment_proof_uploads;
CREATE POLICY "payment_proof_uploads_insert"
  ON public.payment_proof_uploads FOR INSERT TO authenticated
  WITH CHECK (
    nexum_is_admin()
    OR (
      company_id = nexum_my_company_id()
      AND nexum_company_is_approved()
    )
  );

-- documents INSERT: only approved companies (blocks document upload for pending)
DROP POLICY IF EXISTS "documents_insert_approved" ON public.documents;
CREATE POLICY "documents_insert_approved"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    nexum_is_admin()
    OR nexum_company_is_approved()
  );

-- =============================================================================
-- 6. STORAGE — ensure job-documents bucket is private
-- (Run these in Supabase Dashboard → Storage → Buckets if not already done)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('job-documents', 'job-documents', false)
-- ON CONFLICT (id) DO UPDATE SET public = false;
-- =============================================================================

-- =============================================================================
-- DONE
-- =============================================================================
