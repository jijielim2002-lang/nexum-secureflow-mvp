-- ─── Provider Performance Benchmarks v1 ──────────────────────────────────────
--
-- SQL to run in Supabase SQL Editor.
-- COMPLIANCE NOTE: Benchmark scores are internal operational metrics only.
--   Not a certification, rating, or regulated financial assessment.
--   Do not present as a guarantee of provider performance.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_performance_benchmarks (
  id                                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_company_id                    uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_name                          text,

  -- Volume
  total_jobs                             integer     NOT NULL DEFAULT 0,
  completed_jobs                         integer     NOT NULL DEFAULT 0,
  active_jobs                            integer     NOT NULL DEFAULT 0,

  -- Quote characteristics
  average_quote_amount                   numeric,
  average_deposit_percentage             numeric,

  -- Timing metrics (hours)
  average_payment_secured_time_hours     numeric,
  average_execution_time_hours           numeric,
  average_pod_upload_time_hours          numeric,
  average_delivery_confirmation_time_hours numeric,
  average_release_cycle_time_hours       numeric,

  -- Performance rates (0–100 scale, not percentage)
  on_time_delivery_rate                  numeric,
  pod_uploaded_rate                      numeric,
  dispute_rate                           numeric,   -- lower is better
  claim_rate                             numeric,   -- lower is better

  -- Quality scores (0–100)
  document_quality_score                 numeric,
  tracking_update_score                  numeric,
  payment_release_success_rate           numeric,

  -- Composite
  overall_provider_score                 numeric,
  reliability_grade                      text        NOT NULL DEFAULT 'C'
    CHECK (reliability_grade IN ('A', 'B', 'C', 'D', 'Watchlist')),

  benchmark_note                         text,

  last_calculated_at                     timestamptz,
  created_at                             timestamptz NOT NULL DEFAULT now(),
  updated_at                             timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one benchmark row per provider company
CREATE UNIQUE INDEX IF NOT EXISTS provider_benchmarks_company_uniq
  ON public.provider_performance_benchmarks (provider_company_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_provider_benchmarks_grade
  ON public.provider_performance_benchmarks (reliability_grade);

CREATE INDEX IF NOT EXISTS idx_provider_benchmarks_score
  ON public.provider_performance_benchmarks (overall_provider_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_provider_benchmarks_dispute
  ON public.provider_performance_benchmarks (dispute_rate ASC NULLS LAST);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.provider_performance_benchmarks ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY ppb_admin_all ON public.provider_performance_benchmarks
  FOR ALL
  TO authenticated
  USING (nexum_is_admin());

-- Service provider: read their own benchmark only
CREATE POLICY ppb_provider_read ON public.provider_performance_benchmarks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'service_provider'
        AND profiles.company_id = provider_performance_benchmarks.provider_company_id
    )
  );

-- Customer: read all provider benchmarks (for comparison)
CREATE POLICY ppb_customer_read ON public.provider_performance_benchmarks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'customer'
    )
  );

-- ── Helper: auto-update updated_at ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_provider_benchmark_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_benchmark_updated_at
  ON public.provider_performance_benchmarks;

CREATE TRIGGER trg_provider_benchmark_updated_at
  BEFORE UPDATE ON public.provider_performance_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.set_provider_benchmark_updated_at();

-- ── Notes ─────────────────────────────────────────────────────────────────────
--
-- Score weights (applied in application layer, not database):
--   on_time_delivery_rate          25%
--   pod_uploaded_rate              15%
--   (100 - dispute_rate)           20%   (inverse: lower dispute = higher score)
--   document_quality_score         15%
--   tracking_update_score          10%
--   payment_release_success_rate   15%
--
-- Grade thresholds:
--   A         >= 85
--   B         75–84
--   C         60–74
--   D         45–59
--   Watchlist  < 45 OR dispute_rate > 30 OR has critical exceptions
--
-- Recalculation:
--   Triggered manually by admin via /api/provider-benchmarks POST action=recalculate
--   Or per-company via /api/provider-benchmarks/[companyId] POST action=recalculate
--   Reads: secured_jobs, job_exceptions, documents, dispute_cases,
--          document_extractions, shipment_trackings, release_settlements,
--          held_payments, service_quotations
