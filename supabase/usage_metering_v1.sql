-- ─── Usage Metering / Overage Billing v1 ─────────────────────────────────────
-- Run this in Supabase SQL editor.

-- ── usage_metering_records ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.usage_metering_records (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  membership_id       uuid        REFERENCES public.memberships(id) ON DELETE SET NULL,
  plan_id             uuid        REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  usage_type          text        NOT NULL CHECK (usage_type IN (
    'Secured Job',
    'Document Extraction',
    'Tracking Check',
    'RFQ',
    'Quotation',
    'Capital Readiness Assessment',
    'Financing Simulation',
    'Credit Pack',
    'Communication',
    'Other'
  )),
  usage_reference     text,                          -- e.g. job_reference, doc id, etc.
  quantity            numeric     NOT NULL DEFAULT 1,
  included_quantity   numeric     NOT NULL DEFAULT 0, -- how much of this is within included quota
  overage_quantity    numeric     NOT NULL DEFAULT 0, -- quantity above quota
  unit_rate           numeric     NOT NULL DEFAULT 0, -- overage rate per unit
  overage_amount      numeric     NOT NULL DEFAULT 0, -- overage_quantity * unit_rate
  currency            text        NOT NULL DEFAULT 'RM',
  usage_period_start  date,
  usage_period_end    date,
  status              text        NOT NULL DEFAULT 'Recorded'
                                  CHECK (status IN ('Recorded','Calculated','Approved','Waived','Exported','Cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_umr_company      ON public.usage_metering_records (company_id);
CREATE INDEX IF NOT EXISTS idx_umr_membership   ON public.usage_metering_records (membership_id);
CREATE INDEX IF NOT EXISTS idx_umr_usage_type   ON public.usage_metering_records (usage_type);
CREATE INDEX IF NOT EXISTS idx_umr_status       ON public.usage_metering_records (status);
CREATE INDEX IF NOT EXISTS idx_umr_period_start ON public.usage_metering_records (usage_period_start);

ALTER TABLE public.usage_metering_records ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY umr_admin_all ON public.usage_metering_records
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Provider: read own company's records
CREATE POLICY umr_provider_read ON public.usage_metering_records
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ── overage_billing_summaries ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.overage_billing_summaries (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  membership_id               uuid        REFERENCES public.memberships(id) ON DELETE SET NULL,
  plan_id                     uuid        REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  billing_period_start        date        NOT NULL,
  billing_period_end          date        NOT NULL,
  -- Usage totals for period
  total_secured_jobs          integer     NOT NULL DEFAULT 0,
  total_document_extractions  integer     NOT NULL DEFAULT 0,
  total_tracking_checks       integer     NOT NULL DEFAULT 0,
  total_rfqs                  integer     NOT NULL DEFAULT 0,
  total_quotations            integer     NOT NULL DEFAULT 0,
  -- Overage totals
  overage_secured_jobs        integer     NOT NULL DEFAULT 0,
  overage_document_extractions integer    NOT NULL DEFAULT 0,
  overage_tracking_checks     integer     NOT NULL DEFAULT 0,
  overage_rfqs                integer     NOT NULL DEFAULT 0,
  overage_quotations          integer     NOT NULL DEFAULT 0,
  total_overage_amount        numeric     NOT NULL DEFAULT 0,
  currency                    text        NOT NULL DEFAULT 'RM',
  summary_status              text        NOT NULL DEFAULT 'Draft'
                                          CHECK (summary_status IN ('Draft','Generated','Approved','Waived','Exported','Cancelled')),
  -- Linked service fee (created when approved)
  service_fee_id              uuid,
  generated_by                uuid        REFERENCES auth.users(id),
  generated_at                timestamptz,
  approved_by                 uuid        REFERENCES auth.users(id),
  approved_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obs_company ON public.overage_billing_summaries (company_id);
CREATE INDEX IF NOT EXISTS idx_obs_status  ON public.overage_billing_summaries (summary_status);
CREATE INDEX IF NOT EXISTS idx_obs_period  ON public.overage_billing_summaries (billing_period_start, billing_period_end);

ALTER TABLE public.overage_billing_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY obs_admin_all ON public.overage_billing_summaries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY obs_provider_read ON public.overage_billing_summaries
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ── Audit action reference ────────────────────────────────────────────────────
-- usage_recorded
-- usage_overage_calculated
-- overage_summary_generated
-- overage_summary_approved
-- overage_summary_waived
-- overage_exported
