-- ─── Payment Partner / Legal Structure Readiness v1 ─────────────────────────
-- Run as superuser in Supabase SQL Editor.
-- Prerequisites: held_payments, auth.users tables.

-- ─── payment_partner_setups ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_partner_setups (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name              text        NOT NULL,
  partner_type              text        NOT NULL
    CHECK (partner_type IN (
      'Bank',
      'Licensed Payment Partner',
      'Trustee',
      'Escrow Provider',
      'Collection Account Provider',
      'Manual Pilot Account',
      'Other'
    )),
  jurisdiction              text,
  license_reference         text,
  supported_currencies      text[]      DEFAULT '{}',
  supported_payment_methods text[]      DEFAULT '{}',
  holding_model             text        NOT NULL
    CHECK (holding_model IN (
      'Nexum Collection Account',
      'Partner Controlled Account',
      'Client Designated Account',
      'Trust / Escrow Arrangement',
      'Manual Pilot Reference',
      'Other'
    )),
  status                    text        NOT NULL DEFAULT 'Research'
    CHECK (status IN ('Research', 'In Discussion', 'Pilot Ready', 'Active', 'Disabled')),
  compliance_notes          text,
  allowed_wording           text,
  prohibited_wording        text,
  settlement_process_note   text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ─── payment_compliance_checks ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_compliance_checks (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference             text,
  held_payment_id           uuid        REFERENCES public.held_payments(id) ON DELETE SET NULL,
  payment_partner_setup_id  uuid        REFERENCES public.payment_partner_setups(id) ON DELETE SET NULL,
  check_status              text        NOT NULL DEFAULT 'Not Checked'
    CHECK (check_status IN (
      'Not Checked',
      'Compliant for Pilot',
      'Requires Review',
      'Blocked',
      'Approved'
    )),
  holding_wording_ok        boolean     NOT NULL DEFAULT false,
  release_wording_ok        boolean     NOT NULL DEFAULT false,
  customer_disclaimer_shown boolean     NOT NULL DEFAULT false,
  provider_disclaimer_shown boolean     NOT NULL DEFAULT false,
  legal_review_required     boolean     NOT NULL DEFAULT true,
  compliance_note           text,
  checked_by                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pcc_job_reference
  ON public.payment_compliance_checks(job_reference)
  WHERE job_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcc_held_payment
  ON public.payment_compliance_checks(held_payment_id)
  WHERE held_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcc_check_status
  ON public.payment_compliance_checks(check_status)
  WHERE check_status NOT IN ('Approved', 'Compliant for Pilot');

CREATE INDEX IF NOT EXISTS idx_pps_status
  ON public.payment_partner_setups(status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_partner_setups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_compliance_checks   ENABLE ROW LEVEL SECURITY;

-- Admin only
CREATE POLICY "partner_setups_admin_all" ON public.payment_partner_setups
  FOR ALL USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "compliance_checks_admin_all" ON public.payment_compliance_checks
  FOR ALL USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- ─── Grants ──────────────────────────────────────────────────────────────────

GRANT ALL ON public.payment_partner_setups    TO authenticated;
GRANT ALL ON public.payment_compliance_checks TO authenticated;
GRANT ALL ON public.payment_partner_setups    TO service_role;
GRANT ALL ON public.payment_compliance_checks TO service_role;
