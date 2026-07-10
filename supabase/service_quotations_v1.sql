-- ─── Service Quotations v1 ────────────────────────────────────────────────────
-- Provider-initiated commercial proposals sent to customers before job creation.
-- Accepted quotation → secured_job + terms snapshot + payment obligations.
-- Run in Supabase SQL editor.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_quotations (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_reference              text NOT NULL UNIQUE,           -- SQ-20260525-XXXX
  provider_company_id              uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_company_id              uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_email                   text,
  created_by                       uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Service details
  service_type                     text,
  route                            text,
  incoterm                         text,
  cargo_description                text,

  -- Financials
  currency                         text NOT NULL DEFAULT 'RM',
  quoted_amount                    numeric NOT NULL,
  required_deposit                 numeric NOT NULL DEFAULT 0,
  balance_amount                   numeric,
  payment_terms                    text,

  -- Validity
  validity_until                   date,

  -- Scope
  scope_of_service                 text,
  exclusions                       text,
  assumptions                      text,
  required_documents               jsonb,                          -- string[]
  release_condition                text,
  delivery_confirmation_window_hours integer NOT NULL DEFAULT 48,
  remarks                          text,

  -- Status lifecycle
  quotation_status                 text NOT NULL DEFAULT 'Draft'
    CHECK (quotation_status IN (
      'Draft',
      'Sent',
      'Viewed',
      'Accepted',
      'Rejected',
      'Expired',
      'Converted to Secured Job'
    )),

  -- Timestamps per status transition
  sent_at                          timestamptz,
  viewed_at                        timestamptz,
  accepted_at                      timestamptz,
  accepted_by                      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason                 text,
  rejected_at                      timestamptz,
  converted_job_reference          text,
  converted_at                     timestamptz,

  -- Invite link (for sharing with customers outside platform)
  invite_token                     text UNIQUE,
  invite_token_expires_at          timestamptz,

  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sq_provider_company  ON public.service_quotations (provider_company_id);
CREATE INDEX IF NOT EXISTS idx_sq_customer_company  ON public.service_quotations (customer_company_id);
CREATE INDEX IF NOT EXISTS idx_sq_status            ON public.service_quotations (quotation_status);
CREATE INDEX IF NOT EXISTS idx_sq_ref               ON public.service_quotations (quotation_reference);
CREATE INDEX IF NOT EXISTS idx_sq_invite_token      ON public.service_quotations (invite_token);
CREATE INDEX IF NOT EXISTS idx_sq_converted_job     ON public.service_quotations (converted_job_reference);

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_sq_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sq_updated_at ON public.service_quotations;
CREATE TRIGGER trg_sq_updated_at
  BEFORE UPDATE ON public.service_quotations
  FOR EACH ROW EXECUTE FUNCTION public.fn_sq_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.service_quotations ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "sq_admin_all" ON public.service_quotations
  FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Provider: read/insert/update their own quotations
CREATE POLICY "sq_provider_select" ON public.service_quotations
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND provider_company_id = nexum_my_company_id()
  );

CREATE POLICY "sq_provider_insert" ON public.service_quotations
  FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'service_provider'
    AND provider_company_id = nexum_my_company_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "sq_provider_update" ON public.service_quotations
  FOR UPDATE TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND provider_company_id = nexum_my_company_id()
  );

-- Customer: read quotations addressed to their company
CREATE POLICY "sq_customer_select" ON public.service_quotations
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND customer_company_id = nexum_my_company_id()
  );

-- Anon: read-only via valid invite_token (for public quotation invite link)
CREATE POLICY "sq_anon_invite" ON public.service_quotations
  FOR SELECT TO anon
  USING (
    invite_token IS NOT NULL
    AND invite_token_expires_at > now()
  );

-- NOTE: Accept/reject/convert go through service-role API — no anon UPDATE policy needed.
-- The API route validates the token before proceeding.

-- ── Helpful view for audit: quotations linked to secured jobs ─────────────────
-- (Optional — run separately if desired)
-- CREATE VIEW public.v_quotation_job_trace AS
-- SELECT
--   sq.quotation_reference,
--   sq.provider_company_id,
--   sq.customer_company_id,
--   sq.quoted_amount,
--   sq.currency,
--   sq.quotation_status,
--   sq.accepted_at,
--   sq.converted_job_reference,
--   sj.job_status,
--   sj.payment_status
-- FROM public.service_quotations sq
-- LEFT JOIN public.secured_jobs sj ON sj.job_reference = sq.converted_job_reference;
