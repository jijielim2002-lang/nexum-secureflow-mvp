-- ── Accounting / E-Invoice Export v1 ──────────────────────────────────────────
-- Table:  public.accounting_exports
-- Purpose: Structured export of job/payment/settlement data for accounting and
--          e-invoice preparation. Does NOT connect to LHDN MyInvois or any
--          accounting system. All fields are for internal operational reference.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounting_exports (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  export_reference        text        UNIQUE NOT NULL,
  export_type             text        NOT NULL CHECK (export_type IN (
    'Job Settlement',
    'Provider Release',
    'Customer Payment',
    'Nexum Service Fee',
    'Claim Reserve',
    'Refund',
    'Full Job Export',
    'Other'
  )),
  job_reference           text,
  company_id              uuid        REFERENCES public.companies(id),
  counterparty_company_id uuid        REFERENCES public.companies(id),
  currency                text        NOT NULL DEFAULT 'RM',
  gross_amount            numeric     NOT NULL DEFAULT 0,
  tax_amount              numeric     NOT NULL DEFAULT 0,
  net_amount              numeric     NOT NULL DEFAULT 0,
  export_status           text        NOT NULL DEFAULT 'Draft' CHECK (export_status IN (
    'Draft',
    'Generated',
    'Exported',
    'Cancelled'
  )),
  export_payload          jsonb,
  generated_by            uuid        REFERENCES auth.users(id),
  generated_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ae_job_reference  ON public.accounting_exports(job_reference);
CREATE INDEX IF NOT EXISTS idx_ae_company_id     ON public.accounting_exports(company_id);
CREATE INDEX IF NOT EXISTS idx_ae_status         ON public.accounting_exports(export_status);
CREATE INDEX IF NOT EXISTS idx_ae_type           ON public.accounting_exports(export_type);
CREATE INDEX IF NOT EXISTS idx_ae_created_at     ON public.accounting_exports(created_at DESC);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_accounting_exports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounting_exports_updated_at ON public.accounting_exports;
CREATE TRIGGER trg_accounting_exports_updated_at
  BEFORE UPDATE ON public.accounting_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_accounting_exports_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.accounting_exports ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY ae_admin_all ON public.accounting_exports
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Service Provider: read exports where their company is primary or counterparty
CREATE POLICY ae_provider_read ON public.accounting_exports
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'service_provider'
    AND (
      company_id              = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      OR counterparty_company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Customer: read exports where their company is primary or counterparty
CREATE POLICY ae_customer_read ON public.accounting_exports
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'customer'
    AND (
      company_id              = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      OR counterparty_company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );
