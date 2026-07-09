-- ── Nexum Service Fee / Platform Revenue Module v1 ───────────────────────────
-- Tables: nexum_fee_rules, nexum_service_fees
-- Purpose: Define fee rules and track calculated/approved platform revenue
--          per job. Does NOT connect to payment gateway. No official invoice.

-- ── nexum_fee_rules ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nexum_fee_rules (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_name            text        NOT NULL,
  fee_type            text        NOT NULL CHECK (fee_type IN (
    'Membership Fee',
    'Secured Job Fee',
    'Payment Holding Workflow Fee',
    'Controlled Release Fee',
    'Document Intelligence Fee',
    'Tracking Monitoring Fee',
    'RFQ / Quotation Fee',
    'Capital Readiness Fee',
    'Financing Referral Fee',
    'Manual Admin Fee',
    'Other'
  )),
  calculation_method  text        NOT NULL CHECK (calculation_method IN (
    'Fixed Amount',
    'Percentage of Job Value',
    'Percentage of Held Amount',
    'Percentage of Released Amount',
    'Per Document',
    'Per Tracking Sync',
    'Per Job',
    'Manual'
  )),
  fixed_amount        numeric,
  percentage_rate     numeric,
  minimum_fee         numeric,
  maximum_fee         numeric,
  currency            text        NOT NULL DEFAULT 'RM',
  applies_to_plan     text,
  is_active           boolean     NOT NULL DEFAULT true,
  remarks             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfr_is_active   ON public.nexum_fee_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_nfr_fee_type    ON public.nexum_fee_rules(fee_type);

CREATE OR REPLACE FUNCTION public.set_nexum_fee_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_nfr_updated_at ON public.nexum_fee_rules;
CREATE TRIGGER trg_nfr_updated_at
  BEFORE UPDATE ON public.nexum_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_nexum_fee_rules_updated_at();

ALTER TABLE public.nexum_fee_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfr_admin_all ON public.nexum_fee_rules
  FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── nexum_service_fees ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nexum_service_fees (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference        text,
  company_id           uuid        REFERENCES public.companies(id),
  fee_rule_id          uuid        REFERENCES public.nexum_fee_rules(id),
  fee_type             text        NOT NULL,
  fee_description      text,
  base_amount          numeric     NOT NULL DEFAULT 0,
  fee_amount           numeric     NOT NULL DEFAULT 0,
  currency             text        NOT NULL DEFAULT 'RM',
  fee_status           text        NOT NULL DEFAULT 'Draft' CHECK (fee_status IN (
    'Draft',
    'Calculated',
    'Approved',
    'Waived',
    'Exported',
    'Collected',
    'Cancelled'
  )),
  invoice_required     boolean     NOT NULL DEFAULT false,
  accounting_export_id uuid        REFERENCES public.accounting_exports(id),
  approved_by          uuid        REFERENCES auth.users(id),
  approved_at          timestamptz,
  waived_reason        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nsf_job_reference  ON public.nexum_service_fees(job_reference);
CREATE INDEX IF NOT EXISTS idx_nsf_company_id     ON public.nexum_service_fees(company_id);
CREATE INDEX IF NOT EXISTS idx_nsf_fee_status     ON public.nexum_service_fees(fee_status);
CREATE INDEX IF NOT EXISTS idx_nsf_fee_type       ON public.nexum_service_fees(fee_type);
CREATE INDEX IF NOT EXISTS idx_nsf_created_at     ON public.nexum_service_fees(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_nexum_service_fees_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_nsf_updated_at ON public.nexum_service_fees;
CREATE TRIGGER trg_nsf_updated_at
  BEFORE UPDATE ON public.nexum_service_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_nexum_service_fees_updated_at();

ALTER TABLE public.nexum_service_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY nsf_admin_all ON public.nexum_service_fees
  FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY nsf_provider_read ON public.nexum_service_fees
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'service_provider'
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ── Seed: sample fee rules ────────────────────────────────────────────────────
INSERT INTO public.nexum_fee_rules
  (fee_name, fee_type, calculation_method, percentage_rate, fixed_amount, currency, is_active, remarks)
VALUES
  ('Secured Job Fee',
   'Secured Job Fee',
   'Percentage of Job Value',
   0.5, NULL, 'RM', true,
   '0.5% of total job value. Applied once per job at booking.'),

  ('Payment Holding Workflow Fee',
   'Payment Holding Workflow Fee',
   'Percentage of Held Amount',
   0.3, NULL, 'RM', true,
   '0.3% of held payment amount for escrow-style payment workflow.'),

  ('Document Intelligence Fee',
   'Document Intelligence Fee',
   'Per Document',
   NULL, 5.00, 'RM', true,
   'RM 5.00 per uploaded document processed through document intelligence.'),

  ('Tracking Monitoring Fee',
   'Tracking Monitoring Fee',
   'Per Job',
   NULL, 20.00, 'RM', true,
   'RM 20.00 flat fee per job for tracking and monitoring service.'),

  ('Capital Readiness Fee',
   'Capital Readiness Fee',
   'Fixed Amount',
   NULL, 100.00, 'RM', true,
   'RM 100.00 per capital readiness assessment generated.');
