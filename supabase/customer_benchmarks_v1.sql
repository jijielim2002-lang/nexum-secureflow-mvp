-- ─── Customer Performance Benchmarks v1 ──────────────────────────────────────
-- Run in Supabase SQL Editor.
-- Tracks buyer/customer payment behavior, confirmation habits, dispute history.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_performance_benchmarks (
  id                                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_company_id                      uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_name                            text,

  total_jobs                               integer     NOT NULL DEFAULT 0,
  completed_jobs                           integer     NOT NULL DEFAULT 0,
  active_jobs                              integer     NOT NULL DEFAULT 0,

  average_job_value                        numeric,
  total_secured_value                      numeric,

  -- Timing metrics
  average_payment_proof_upload_time_hours  numeric,
  average_payment_reconciliation_time_hours numeric,
  average_delivery_confirmation_time_hours numeric,

  -- Behavioral rates
  auto_confirmation_rate                   numeric,   -- % of jobs auto-confirmed (customer did not respond in window)
  dispute_rate                             numeric,   -- % of jobs with any dispute
  payment_dispute_rate                     numeric,   -- % of jobs with payment-related dispute
  overdue_payment_rate                     numeric,   -- % of payment obligations that went overdue

  -- Component scores (0–100 each)
  document_completeness_score              numeric,
  payment_behavior_score                   numeric,
  receipt_confirmation_score               numeric,
  communication_responsiveness_score       numeric,

  -- Composite
  overall_customer_score                   numeric,
  customer_grade                           text        NOT NULL DEFAULT 'C'
                                             CHECK (customer_grade IN ('A', 'B', 'C', 'D', 'Watchlist')),

  -- Recommendations
  recommended_payment_terms                text,
  recommended_deposit_percentage           numeric,
  risk_note                                text,

  last_calculated_at                       timestamptz,
  created_at                              timestamptz NOT NULL DEFAULT now(),
  updated_at                              timestamptz NOT NULL DEFAULT now()
);

-- One row per customer company
CREATE UNIQUE INDEX IF NOT EXISTS customer_benchmarks_company_uniq
  ON public.customer_performance_benchmarks (customer_company_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.customer_performance_benchmarks ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY cpb_admin_all ON public.customer_performance_benchmarks
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Service provider: read-only view of any customer they have an active/completed job with
CREATE POLICY cpb_provider_read ON public.customer_performance_benchmarks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.secured_jobs sj
      JOIN   public.profiles     p  ON p.id = auth.uid()
      WHERE  p.role = 'service_provider'
        AND  p.company_id = sj.service_provider_company_id
        AND  sj.customer_company_id = customer_performance_benchmarks.customer_company_id
    )
  );

-- Customer: can read their own benchmark
CREATE POLICY cpb_customer_self ON public.customer_performance_benchmarks
  FOR SELECT TO authenticated
  USING (
    customer_company_id IN (
      SELECT company_id FROM public.profiles
      WHERE  id = auth.uid() AND role = 'customer'
    )
  );

-- ── Updated_at trigger ────────────────────────────────────────────────────────
-- (only needed if a trigger function already exists for updated_at)
-- CREATE TRIGGER set_customer_benchmarks_updated_at
--   BEFORE UPDATE ON public.customer_performance_benchmarks
--   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
