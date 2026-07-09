-- =============================================================================
-- NEXUM SECUREFLOW — 001_live_baseline_schema.sql
-- Live Pilot Baseline Schema — Consolidated Idempotent Migration
--
-- PURPOSE:
--   Single file to run against a fresh Supabase project to stand up the
--   complete live-pilot schema. Safe to re-run (all statements use
--   IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- PILOT SCOPE:
--   Malaysia local · MYR only · Logistics fee only
--   Manual DuitNow / bank transfer · No bank API · No FX · No financing
--   No legal escrow — designated payment holding workflow only
--
-- RUN ORDER:
--   1. This file (001_live_baseline_schema.sql)
--   2. 002_live_rls_policies.sql
--
-- COMPLIANCE:
--   This schema records WORKFLOW STATUS only.
--   Nexum does not hold or disburse funds directly.
--   All payment operations are manual.
--   Do NOT say "legal escrow" — say "designated payment holding workflow".
-- =============================================================================

-- =============================================================================
-- 0. HELPER FUNCTIONS (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.nexum_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.nexum_my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.nexum_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 1. COMPANIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.companies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  company_type text        CHECK (company_type IN ('Service Provider', 'Customer', 'Admin', 'Other')),
  email        text,
  phone        text,
  address      text,
  country      text        DEFAULT 'Malaysia',
  currency     text        DEFAULT 'RM',
  status       text        DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Live pilot: mark test companies so they can be hidden in production
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_status    ON public.companies (status);
CREATE INDEX IF NOT EXISTS idx_companies_test_data ON public.companies (is_test_data) WHERE is_test_data;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS companies_updated_at ON public.companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 2. PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text,
  email        text,
  role         text        NOT NULL DEFAULT 'customer'
                           CHECK (role IN ('admin', 'service_provider', 'customer', 'capital_partner')),
  company_id   uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name text,
  status       text        DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles (company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role        ON public.profiles (role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 3. SECURED_JOBS
-- Core job record for one logistics/trade job under Nexum workflow.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.secured_jobs (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference               text        NOT NULL UNIQUE,
  service_provider            text,
  service_provider_company_id uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  customer                    text,
  customer_company_id         uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_email              text,

  service_type                text,
  service_description         text,
  route                       text,
  cargo_description           text,
  incoterm                    text,
  hs_code                     text,

  -- Financial (MYR only for live pilot)
  job_value                   numeric     DEFAULT 0,
  currency                    text        NOT NULL DEFAULT 'RM',
  required_deposit            numeric     DEFAULT 0,
  payment_terms               text,

  -- Cargo value (NOT auto-secured)
  cargo_value_amount          numeric,
  cargo_value_currency        text,

  -- Fee components
  logistics_fee_amount        numeric,
  logistics_fee_currency      text,
  duty_tax_amount             numeric,
  duty_tax_currency           text,
  insurance_cost_amount       numeric,
  insurance_cost_currency     text,
  additional_charges_amount   numeric,
  additional_charges_currency text,

  -- Total secured
  total_secured_amount        numeric     DEFAULT 0,
  total_secured_currency      text        DEFAULT 'RM',
  payment_scope_note          text,
  secured_amount_note         text,

  -- Scope flags
  secure_logistics_fee          boolean   DEFAULT true,
  secure_cargo_supplier_payment boolean   DEFAULT false,
  secure_duty_tax               boolean   DEFAULT false,
  secure_insurance              boolean   DEFAULT false,
  secure_additional_charges     boolean   DEFAULT false,

  -- Status
  job_status                  text        NOT NULL DEFAULT 'Awaiting Customer Acceptance'
                              CHECK (job_status IN (
                                'Awaiting Customer Acceptance', 'Awaiting Deposit',
                                'Awaiting Deposit Confirmation', 'Ready for Execution',
                                'In Progress', 'Delivered', 'Awaiting Customer Confirmation',
                                'Completed', 'Disputed', 'Cancelled'
                              )),
  payment_status              text        NOT NULL DEFAULT 'Payment Pending'
                              CHECK (payment_status IN (
                                'Payment Pending', 'Deposit Proof Uploaded', 'Deposit Confirmed',
                                'Balance Pending', 'Balance Proof Uploaded',
                                'Payment Proof Uploaded', 'Payment Secured', 'Fully Paid',
                                'Disputed', 'Refund Pending'
                              )),
  current_milestone           text        DEFAULT 'Job Created',
  risk_level                  text        DEFAULT 'Low'
                              CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),

  -- Invite / acceptance
  invite_token                text,
  invite_token_expires_at     timestamptz,
  customer_accepted_at        timestamptz,
  customer_accepted_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- POD / confirmation
  pod_uploaded_at             timestamptz,
  pod_uploaded_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_confirmed_at       timestamptz,
  customer_confirmed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_confirm_at             timestamptz,

  -- Customer confirmation fields (from 010_customer_delivery_columns.sql)
  customer_confirmation_note  text,
  confirmation_ip             text,
  confirmation_user_agent     text,

  -- Pilot status (from 006_pilot_onboarding.sql)
  pilot_status                text        DEFAULT 'Pending'
                              CHECK (pilot_status IN (
                                'Pending', 'Onboarding', 'Active', 'Completed', 'Suspended'
                              )),

  -- Test data flag
  is_test_data                boolean     NOT NULL DEFAULT false,

  created_by                  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secured_jobs_job_reference            ON public.secured_jobs (job_reference);
CREATE INDEX IF NOT EXISTS idx_secured_jobs_provider_company         ON public.secured_jobs (service_provider_company_id);
CREATE INDEX IF NOT EXISTS idx_secured_jobs_customer_company         ON public.secured_jobs (customer_company_id);
CREATE INDEX IF NOT EXISTS idx_secured_jobs_job_status               ON public.secured_jobs (job_status);
CREATE INDEX IF NOT EXISTS idx_secured_jobs_payment_status           ON public.secured_jobs (payment_status);
CREATE INDEX IF NOT EXISTS idx_secured_jobs_created_at               ON public.secured_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_secured_jobs_test_data                ON public.secured_jobs (is_test_data) WHERE is_test_data;

ALTER TABLE public.secured_jobs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS secured_jobs_updated_at ON public.secured_jobs;
CREATE TRIGGER secured_jobs_updated_at
  BEFORE UPDATE ON public.secured_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 4. DOCUMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference   text        NOT NULL,
  company_id      uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  document_type   text        NOT NULL
                  CHECK (document_type IN (
                    'Payment Proof', 'Proof of Delivery', 'Bill of Lading',
                    'Commercial Invoice', 'Packing List', 'Certificate of Origin',
                    'Customs Declaration', 'Insurance Certificate', 'Delivery Order', 'Other'
                  )),
  file_name       text,
  file_url        text,
  file_size_bytes bigint,
  mime_type       text,
  storage_bucket  text,
  storage_path    text,
  is_verified     boolean     DEFAULT false,
  verified_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at     timestamptz,
  uploaded_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  upload_note     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_job_reference ON public.documents (job_reference);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON public.documents (document_type);
CREATE INDEX IF NOT EXISTS idx_documents_company_id    ON public.documents (company_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 5. PAYMENT_OBLIGATIONS
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_payment_obligations_job_reference ON public.payment_obligations (job_reference);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_payer         ON public.payment_obligations (payer_company_id);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_payee         ON public.payment_obligations (payee_company_id);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_status        ON public.payment_obligations (status);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_due_date      ON public.payment_obligations (due_date);

ALTER TABLE public.payment_obligations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS payment_obligations_updated_at ON public.payment_obligations;
CREATE TRIGGER payment_obligations_updated_at
  BEFORE UPDATE ON public.payment_obligations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 6. PAYMENT_PROOF_UPLOADS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_proof_uploads (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference         text        NOT NULL,
  company_id            uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  document_id           uuid        REFERENCES public.documents(id) ON DELETE SET NULL,
  payment_obligation_id uuid        REFERENCES public.payment_obligations(id) ON DELETE SET NULL,
  upload_status         text        NOT NULL DEFAULT 'Pending Review'
                        CHECK (upload_status IN (
                          'Pending Review', 'Under Review', 'Verified',
                          'Rejected', 'Requires Reupload'
                        )),
  payment_amount_claimed    numeric,
  payment_currency_claimed  text,
  payment_date_claimed      date,
  uploaded_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  rejection_reason      text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_proof_uploads_job_reference ON public.payment_proof_uploads (job_reference);
CREATE INDEX IF NOT EXISTS idx_payment_proof_uploads_status        ON public.payment_proof_uploads (upload_status);

ALTER TABLE public.payment_proof_uploads ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS payment_proof_uploads_updated_at ON public.payment_proof_uploads;
CREATE TRIGGER payment_proof_uploads_updated_at
  BEFORE UPDATE ON public.payment_proof_uploads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 7. PAYMENT_LEDGER_EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_ledger_events (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_obligation_id   uuid        REFERENCES public.payment_obligations(id) ON DELETE CASCADE,
  job_reference           text        NOT NULL,
  event_type              text,
  event_description       text,
  amount                  numeric,
  currency                text,
  actor_role              text,
  actor_user_id           uuid        REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_events_obligation ON public.payment_ledger_events (payment_obligation_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_events_job_ref    ON public.payment_ledger_events (job_reference);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_events_created_at ON public.payment_ledger_events (created_at DESC);

ALTER TABLE public.payment_ledger_events ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 8. HELD_PAYMENTS (designated payment holding workflow — not legal escrow)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_holding_accounts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name      text        NOT NULL,
  account_type      text        NOT NULL CHECK (account_type IN (
                                  'Nexum Collection Account', 'Licensed Partner Account',
                                  'Client Designated Account', 'Manual Holding Reference', 'Other'
                                )),
  currency          text        NOT NULL DEFAULT 'RM',
  bank_name         text,
  account_reference text,
  status            text        NOT NULL DEFAULT 'Pilot Only'
                                CHECK (status IN ('Active', 'Inactive', 'Pilot Only')),
  remarks           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_holding_accounts ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS payment_holding_accounts_updated_at ON public.payment_holding_accounts;
CREATE TRIGGER payment_holding_accounts_updated_at
  BEFORE UPDATE ON public.payment_holding_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.held_payments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference         text        NOT NULL,
  payment_obligation_id uuid        REFERENCES public.payment_obligations(id) ON DELETE SET NULL,
  payer_company_id      uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  payee_company_id      uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  holding_account_id    uuid        REFERENCES public.payment_holding_accounts(id) ON DELETE SET NULL,
  amount                numeric     NOT NULL CHECK (amount >= 0),
  currency              text        NOT NULL DEFAULT 'RM',
  holding_status        text        NOT NULL DEFAULT 'Awaiting Payment'
                        CHECK (holding_status IN (
                          'Awaiting Payment', 'Proof Uploaded', 'Funds Received',
                          'Payment Secured', 'Release Eligible', 'Release Approved',
                          'Release Instructed', 'Released', 'Disputed', 'Refund Pending',
                          'Refunded', 'Cancelled'
                        )),
  payment_proof_url     text,
  proof_verified_at     timestamptz,
  proof_verified_by     uuid        REFERENCES auth.users(id),
  release_approved_at   timestamptz,
  release_approved_by   uuid        REFERENCES auth.users(id),
  release_note          text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_held_payments_job_reference  ON public.held_payments (job_reference);
CREATE INDEX IF NOT EXISTS idx_held_payments_status         ON public.held_payments (holding_status);
CREATE INDEX IF NOT EXISTS idx_held_payments_payer          ON public.held_payments (payer_company_id);

ALTER TABLE public.held_payments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS held_payments_updated_at ON public.held_payments;
CREATE TRIGGER held_payments_updated_at
  BEFORE UPDATE ON public.held_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 9. MANUAL_PAYMENT_OPERATIONS
-- Records every manual payment lifecycle event — no bank API connected.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.manual_payment_operations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_reference   text        UNIQUE NOT NULL,
  job_reference         text        NOT NULL,
  company_id            uuid        REFERENCES public.companies(id),
  payer_company_id      uuid        REFERENCES public.companies(id),
  payee_company_id      uuid        REFERENCES public.companies(id),
  payment_obligation_id uuid        REFERENCES public.payment_obligations(id),
  held_payment_id       uuid        REFERENCES public.held_payments(id),
  operation_type        text        NOT NULL CHECK (operation_type IN (
                          'Customer Collection', 'Payment Verification', 'Payment Secured',
                          'Release Approval', 'Manual Payout', 'Settlement Reconciliation',
                          'Refund', 'Dispute Hold', 'Claim Reserve', 'Other'
                        )),
  operation_status      text        DEFAULT 'Pending' CHECK (operation_status IN (
                          'Pending', 'In Review', 'Verified', 'Rejected', 'Secured',
                          'Approved for Release', 'Paid Out', 'Reconciled',
                          'On Hold', 'Disputed', 'Cancelled'
                        )),
  amount                numeric     NOT NULL,
  currency              text        NOT NULL DEFAULT 'RM',
  bank_reference        text,
  duitnow_reference     text,
  payment_date          date,
  verified_by           uuid        REFERENCES auth.users(id),
  verified_at           timestamptz,
  payout_recorded_by    uuid        REFERENCES auth.users(id),
  payout_recorded_at    timestamptz,
  payout_reference      text,
  sop_confirmed         boolean     NOT NULL DEFAULT false,
  sop_confirmed_at      timestamptz,
  operation_note        text,
  rejection_reason      text,
  created_by            uuid        REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_payment_ops_job_reference ON public.manual_payment_operations (job_reference);
CREATE INDEX IF NOT EXISTS idx_manual_payment_ops_status        ON public.manual_payment_operations (operation_status);
CREATE INDEX IF NOT EXISTS idx_manual_payment_ops_type          ON public.manual_payment_operations (operation_type);
CREATE INDEX IF NOT EXISTS idx_manual_payment_ops_created_at    ON public.manual_payment_operations (created_at DESC);

ALTER TABLE public.manual_payment_operations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS manual_payment_operations_updated_at ON public.manual_payment_operations;
CREATE TRIGGER manual_payment_operations_updated_at
  BEFORE UPDATE ON public.manual_payment_operations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 10. DELIVERY_CONFIRMATION_EVENTS
-- Customer confirmation of delivery receipt.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_confirmations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference        text        NOT NULL UNIQUE,
  company_id           uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  confirmation_status  text        NOT NULL DEFAULT 'Pending'
                       CHECK (confirmation_status IN (
                         'Pending', 'Confirmed', 'Auto-Confirmed',
                         'Disputed', 'Overridden by Admin'
                       )),
  confirmed_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at         timestamptz,
  auto_confirm_at      timestamptz,
  confirmation_note    text,
  dispute_raised_at    timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_job_reference ON public.delivery_confirmations (job_reference);
CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_status        ON public.delivery_confirmations (confirmation_status);

ALTER TABLE public.delivery_confirmations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS delivery_confirmations_updated_at ON public.delivery_confirmations;
CREATE TRIGGER delivery_confirmations_updated_at
  BEFORE UPDATE ON public.delivery_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 11. JOB_TERMS_SNAPSHOTS
-- Immutable snapshot of job terms at acceptance time.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.job_terms_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference   text        NOT NULL,
  company_id      uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  snapshot_data   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  snapshot_type   text        DEFAULT 'Customer Acceptance',
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_terms_snapshots_job_reference ON public.job_terms_snapshots (job_reference);

ALTER TABLE public.job_terms_snapshots ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 12. AUDIT_LOGS
-- Append-only audit trail. No updates or deletes from application layer.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference text,
  actor_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role    text,
  actor_name    text,
  action        text        NOT NULL,
  description   text,
  metadata      jsonb       DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_job_reference ON public.audit_logs (job_reference);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id      ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action        ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at    ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 13. LEGAL_TERMS_TEMPLATES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.legal_terms_templates (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_reference  text        UNIQUE NOT NULL,
  template_type       text        NOT NULL CHECK (template_type IN (
                        'Customer Pilot Terms', 'Provider Pilot Terms',
                        'Payment Holding Terms', 'Release Terms', 'Dispute Terms',
                        'Privacy Notice', 'General Platform Terms', 'Other'
                      )),
  template_title      text        NOT NULL,
  version_number      text        DEFAULT '1.0',
  language            text        DEFAULT 'English',
  content             text        NOT NULL,
  status              text        CHECK (status IN ('Draft', 'Active', 'Archived')) DEFAULT 'Draft',
  effective_date      date,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.legal_terms_templates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS legal_terms_templates_updated_at ON public.legal_terms_templates;
CREATE TRIGGER legal_terms_templates_updated_at
  BEFORE UPDATE ON public.legal_terms_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 14. LEGAL_TERMS_ACCEPTANCES
-- Immutable acceptance records.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.legal_terms_acceptances (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid        REFERENCES public.legal_terms_templates(id) ON DELETE SET NULL,
  template_reference  text,
  template_version    text,
  accepted_by_user_id uuid        REFERENCES auth.users(id),
  accepted_by_company uuid        REFERENCES public.companies(id),
  job_reference       text,
  acceptance_type     text        CHECK (acceptance_type IN (
                        'Explicit Checkbox', 'Implicit by Action',
                        'Signed Document', 'Other'
                      )) DEFAULT 'Explicit Checkbox',
  accepted_at         timestamptz NOT NULL DEFAULT now(),
  ip_address          text,
  user_agent          text
);

CREATE INDEX IF NOT EXISTS idx_legal_terms_acceptances_user_id  ON public.legal_terms_acceptances (accepted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_legal_terms_acceptances_company  ON public.legal_terms_acceptances (accepted_by_company);
CREATE INDEX IF NOT EXISTS idx_legal_terms_acceptances_template ON public.legal_terms_acceptances (template_reference);

ALTER TABLE public.legal_terms_acceptances ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 15. PILOT_ONBOARDING_CHECKLISTS & ITEMS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pilot_onboarding_checklists (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_reference text        UNIQUE NOT NULL,
  checklist_type      text        NOT NULL CHECK (checklist_type IN (
                        'Provider Onboarding', 'Customer Onboarding', 'Live Job Approval',
                        'Payment Readiness', 'Release Readiness', 'Exception Review'
                      )),
  company_id          uuid        REFERENCES public.companies(id),
  company_name        text,
  job_reference       text,
  status              text        DEFAULT 'Pending' CHECK (status IN (
                        'Pending', 'In Review', 'Approved', 'Rejected', 'On Hold', 'Waived'
                      )),
  risk_level          text        DEFAULT 'Medium'
                      CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  reviewed_by         uuid        REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  review_note         text,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.pilot_onboarding_checklists ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS pilot_onboarding_checklists_updated_at ON public.pilot_onboarding_checklists;
CREATE TRIGGER pilot_onboarding_checklists_updated_at
  BEFORE UPDATE ON public.pilot_onboarding_checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pilot_onboarding_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id    uuid        NOT NULL REFERENCES public.pilot_onboarding_checklists(id) ON DELETE CASCADE,
  item_key        text        NOT NULL,
  item_label      text        NOT NULL,
  item_category   text,
  status          text        DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Passed', 'Failed', 'Waived', 'N/A')),
  is_required     boolean     NOT NULL DEFAULT true,
  verified_by     uuid        REFERENCES auth.users(id),
  verified_at     timestamptz,
  note            text,
  sort_order      integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_onboarding_items_checklist ON public.pilot_onboarding_items (checklist_id);

ALTER TABLE public.pilot_onboarding_items ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 16. GO_LIVE_READINESS_ITEMS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.go_live_readiness_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key      text        UNIQUE NOT NULL,
  phase         text,
  category      text,
  title         text        NOT NULL,
  description   text,
  status        text        NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Blocked', 'Waived')),
  is_blocker    boolean     NOT NULL DEFAULT false,
  verified_by   uuid        REFERENCES auth.users(id),
  verified_at   timestamptz,
  note          text,
  sort_order    integer     DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.go_live_readiness_items ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS go_live_readiness_items_updated_at ON public.go_live_readiness_items;
CREATE TRIGGER go_live_readiness_items_updated_at
  BEFORE UPDATE ON public.go_live_readiness_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 17. DEPLOYMENT_CUTOVER_CHECKLISTS & ITEMS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.deployment_cutover_checklists (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_reference text        UNIQUE NOT NULL,
  environment         text        DEFAULT 'Staging'
                      CHECK (environment IN ('Local', 'Staging', 'Production')),
  checklist_type      text        NOT NULL CHECK (checklist_type IN (
                        'Environment Setup', 'Database Cutover', 'Security Review',
                        'Storage Review', 'Admin Access', 'Test Data Cleanup',
                        'Backup / Recovery', 'Monitoring', 'Go-Live Approval', 'Post-Go-Live Review'
                      )),
  status              text        DEFAULT 'Pending'
                      CHECK (status IN ('Pending', 'In Progress', 'Passed', 'Failed', 'Waived', 'Blocked')),
  risk_level          text        DEFAULT 'Medium'
                      CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  owner_role          text,
  reviewed_by         uuid        REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.deployment_cutover_checklists ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS deployment_cutover_checklists_updated_at ON public.deployment_cutover_checklists;
CREATE TRIGGER deployment_cutover_checklists_updated_at
  BEFORE UPDATE ON public.deployment_cutover_checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.deployment_cutover_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id    uuid        NOT NULL REFERENCES public.deployment_cutover_checklists(id) ON DELETE CASCADE,
  item_key        text        NOT NULL,
  item_label      text        NOT NULL,
  item_category   text,
  status          text        DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Passed', 'Failed', 'Waived', 'Blocked')),
  is_blocker      boolean     NOT NULL DEFAULT false,
  verified_by     uuid        REFERENCES auth.users(id),
  verified_at     timestamptz,
  note            text,
  sort_order      integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployment_cutover_items_checklist ON public.deployment_cutover_items (checklist_id);

ALTER TABLE public.deployment_cutover_items ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 18. LIVE_PILOT_DRY_RUNS & STEPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_pilot_dry_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_reference   text        UNIQUE NOT NULL,
  run_type        text        DEFAULT 'Full Workflow'
                  CHECK (run_type IN (
                    'Full Workflow', 'Payment Only', 'Release Only',
                    'Customer Flow', 'Provider Flow', 'Exception Handling'
                  )),
  environment     text        DEFAULT 'Staging'
                  CHECK (environment IN ('Local', 'Staging', 'Production')),
  status          text        DEFAULT 'Draft'
                  CHECK (status IN ('Draft', 'In Progress', 'Passed', 'Failed', 'Abandoned')),
  started_at      timestamptz,
  completed_at    timestamptz,
  run_by          uuid        REFERENCES auth.users(id),
  run_note        text,
  summary_notes   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_pilot_dry_runs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS live_pilot_dry_runs_updated_at ON public.live_pilot_dry_runs;
CREATE TRIGGER live_pilot_dry_runs_updated_at
  BEFORE UPDATE ON public.live_pilot_dry_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.live_pilot_dry_run_steps (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dry_run_id    uuid        NOT NULL REFERENCES public.live_pilot_dry_runs(id) ON DELETE CASCADE,
  step_key      text        NOT NULL,
  step_label    text        NOT NULL,
  step_category text,
  status        text        DEFAULT 'Pending'
                CHECK (status IN ('Pending', 'Passed', 'Failed', 'Skipped', 'N/A')),
  is_required   boolean     NOT NULL DEFAULT true,
  step_note     text,
  completed_at  timestamptz,
  sort_order    integer     DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dry_run_steps_run_id ON public.live_pilot_dry_run_steps (dry_run_id);

ALTER TABLE public.live_pilot_dry_run_steps ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 19. SYSTEM_SETTINGS
-- Key-value store for live-mode gates and deployment environment.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key         text        PRIMARY KEY,
  value       text        NOT NULL DEFAULT '',
  description text,
  updated_by  uuid        REFERENCES auth.users(id),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Seed default live-mode gates (safe ON CONFLICT DO NOTHING — won't overwrite)
INSERT INTO public.system_settings (key, value, description) VALUES
  ('deployment_environment', 'Staging',  'Current deployment environment: Local | Staging | Production'),
  ('live_customer_enabled',  'false',    'Enable live customer onboarding (set true after dry run)'),
  ('live_payment_enabled',   'false',    'Enable live payment verification (set true after customer gate)'),
  ('live_release_enabled',   'false',    'Enable live release approval (set true after payment gate)'),
  ('live_pilot_start_date',  '',         'Date first live pilot customer was onboarded'),
  ('pilot_scope_note',       'Malaysia local · MYR only · Logistics fee · Manual DuitNow/bank transfer · No bank API · No FX · No financing', 'Live pilot scope summary')
ON CONFLICT (key) DO NOTHING;


-- =============================================================================
-- 20. NOTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role        text,
  recipient_company_id  uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  job_reference         text,
  notification_type     text,
  title                 text        NOT NULL,
  body                  text,
  is_read               boolean     NOT NULL DEFAULT false,
  action_url            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user    ON public.notifications (recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_company ON public.notifications (recipient_company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read           ON public.notifications (is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at        ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 21. WORKFLOW_TASKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workflow_tasks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference text,
  company_id    uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  task_type     text        NOT NULL,
  task_status   text        NOT NULL DEFAULT 'Pending'
                CHECK (task_status IN ('Pending', 'In Progress', 'Completed', 'Dismissed', 'Overdue')),
  assigned_role text        NOT NULL,
  title         text        NOT NULL,
  description   text,
  due_at        timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_job_reference ON public.workflow_tasks (job_reference);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_assigned_role ON public.workflow_tasks (assigned_role);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_company_id    ON public.workflow_tasks (company_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_task_status   ON public.workflow_tasks (task_status);

ALTER TABLE public.workflow_tasks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS workflow_tasks_updated_at ON public.workflow_tasks;
CREATE TRIGGER workflow_tasks_updated_at
  BEFORE UPDATE ON public.workflow_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 22. TERMS_ACCEPTANCES (platform-level acceptance records)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference text,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id    uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  terms_type    text        NOT NULL DEFAULT 'Job Acceptance'
                CHECK (terms_type IN (
                  'Job Acceptance', 'Provider Platform Terms',
                  'Pilot Terms', 'Financing Simulation Disclaimer', 'Other'
                )),
  terms_version text,
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  ip_address    text,
  user_agent    text
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_job_reference ON public.terms_acceptances (job_reference);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user_id       ON public.terms_acceptances (user_id);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 23. DISPUTES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.disputes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference    text        NOT NULL,
  company_id       uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  dispute_status   text        NOT NULL DEFAULT 'Open'
                   CHECK (dispute_status IN (
                     'Open', 'Under Review', 'Resolved — Release Approved',
                     'Resolved — Refund', 'Resolved — Cancelled', 'Withdrawn'
                   )),
  dispute_reason   text,
  dispute_category text
                   CHECK (dispute_category IN (
                     'Delivery Dispute', 'Quality Issue', 'Short Delivery',
                     'Wrong Goods', 'Damaged Goods', 'Payment Dispute', 'Other'
                   )),
  raised_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_job_reference  ON public.disputes (job_reference);
CREATE INDEX IF NOT EXISTS idx_disputes_dispute_status ON public.disputes (dispute_status);
CREATE INDEX IF NOT EXISTS idx_disputes_company_id     ON public.disputes (company_id);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS disputes_updated_at ON public.disputes;
CREATE TRIGGER disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 24. EVIDENCE_PACKS & ITEMS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.evidence_packs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference text        NOT NULL,
  company_id    uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  pack_status   text        NOT NULL DEFAULT 'Draft'
                CHECK (pack_status IN ('Draft', 'Generating', 'Ready', 'Failed', 'Archived')),
  pack_url      text,
  pack_hash     text,
  generated_at  timestamptz,
  generated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_packs_job_reference ON public.evidence_packs (job_reference);
ALTER TABLE public.evidence_packs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS evidence_packs_updated_at ON public.evidence_packs;
CREATE TRIGGER evidence_packs_updated_at
  BEFORE UPDATE ON public.evidence_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.evidence_pack_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_pack_id uuid        NOT NULL REFERENCES public.evidence_packs(id) ON DELETE CASCADE,
  item_type        text,
  document_id      uuid        REFERENCES public.documents(id) ON DELETE SET NULL,
  item_label       text,
  item_url         text,
  item_hash        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_pack_items_pack ON public.evidence_pack_items (evidence_pack_id);
ALTER TABLE public.evidence_pack_items ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 25. MEMBERSHIPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.memberships (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_type   text        DEFAULT 'Pilot',
  status      text        NOT NULL DEFAULT 'Active'
              CHECK (status IN ('Active', 'Inactive', 'Suspended', 'Expired')),
  annual_fee  numeric,
  used_jobs   integer     NOT NULL DEFAULT 0,
  max_jobs    integer,
  currency    text        DEFAULT 'RM',
  started_at  timestamptz DEFAULT now(),
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memberships_company_id ON public.memberships (company_id);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS memberships_updated_at ON public.memberships;
CREATE TRIGGER memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 26. COMPANY_INTELLIGENCE_PROFILES (basic scoring only for live pilot)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_intelligence_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name          text,
  company_type          text,
  total_jobs            integer     NOT NULL DEFAULT 0,
  monthly_jobs          integer     NOT NULL DEFAULT 0,
  total_logistics_fee   numeric     NOT NULL DEFAULT 0,
  total_cargo_value     numeric     NOT NULL DEFAULT 0,
  total_secured_amount  numeric     NOT NULL DEFAULT 0,
  monthly_secured_amount numeric    NOT NULL DEFAULT 0,
  risk_level            text        NOT NULL DEFAULT 'Not Available'
                        CHECK (risk_level IN ('Not Available', 'Low', 'Medium', 'High', 'Critical')),
  financeability_score  numeric,
  overall_trust_score   numeric,
  scoring_status        text        NOT NULL DEFAULT 'Not Scored'
                        CHECK (scoring_status IN ('Not Scored', 'Scored', 'Error')),
  last_calculated_at    timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cip_company_id ON public.company_intelligence_profiles (company_id);
ALTER TABLE public.company_intelligence_profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS company_intelligence_profiles_updated_at ON public.company_intelligence_profiles;
CREATE TRIGGER company_intelligence_profiles_updated_at
  BEFORE UPDATE ON public.company_intelligence_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 27. COMPANY_FINANCIAL_INPUTS (manual data entry for credit health report)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_financial_inputs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start         date,
  period_end           date,
  revenue              numeric,
  cost_of_goods_sold   numeric,
  gross_profit         numeric,
  gross_margin_percent numeric,
  operating_expenses   numeric,
  net_profit           numeric,
  cash_balance         numeric,
  receivables          numeric,
  payables             numeric,
  inventory_value      numeric,
  bank_facility_limit  numeric,
  bank_facility_used   numeric,
  source_type          text        NOT NULL DEFAULT 'Self-Reported'
    CHECK (source_type IN ('Self-Reported', 'Verified', 'Uploaded Document')),
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfi_company_period
  ON public.company_financial_inputs (company_id, period_start DESC NULLS LAST);

ALTER TABLE public.company_financial_inputs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS company_financial_inputs_updated_at ON public.company_financial_inputs;
CREATE TRIGGER company_financial_inputs_updated_at
  BEFORE UPDATE ON public.company_financial_inputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 28. COMPANY_MARKET_INPUTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_market_inputs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commodity_category    text,
  product_description   text,
  selling_price         numeric,
  purchase_cost         numeric,
  landed_cost           numeric,
  logistics_cost        numeric,
  duty_tax              numeric,
  margin_percent        numeric,
  competitor_price_low  numeric,
  competitor_price_high numeric,
  market_note           text,
  source_type           text        NOT NULL DEFAULT 'Self-Reported'
    CHECK (source_type IN ('Self-Reported', 'Verified', 'Uploaded Document')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmi_company_created
  ON public.company_market_inputs (company_id, created_at DESC);

ALTER TABLE public.company_market_inputs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS company_market_inputs_updated_at ON public.company_market_inputs;
CREATE TRIGGER company_market_inputs_updated_at
  BEFORE UPDATE ON public.company_market_inputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- END 001_live_baseline_schema.sql
-- =============================================================================
