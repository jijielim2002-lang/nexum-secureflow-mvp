-- ─── Pricing Plan / Membership Commercial Package v1 ──────────────────────────
-- Run this in Supabase SQL editor.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.membership_plans (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name                       text        NOT NULL UNIQUE,
  plan_status                     text        NOT NULL DEFAULT 'Draft'
                                              CHECK (plan_status IN ('Active', 'Inactive', 'Draft')),
  annual_fee                      numeric     NOT NULL DEFAULT 0,
  monthly_equivalent              numeric     NOT NULL DEFAULT 0,
  currency                        text        NOT NULL DEFAULT 'RM',

  -- Included usage quotas
  included_secured_jobs           integer     NOT NULL DEFAULT 0,
  included_document_extractions   integer     NOT NULL DEFAULT 0,
  included_tracking_checks        integer     NOT NULL DEFAULT 0,
  included_rfqs                   integer     NOT NULL DEFAULT 0,
  included_quotations             integer     NOT NULL DEFAULT 0,

  -- Discounted service fee rates (percentage, overrides nexum_fee_rules)
  secured_job_fee_rate            numeric     NOT NULL DEFAULT 0,
  payment_holding_fee_rate        numeric     NOT NULL DEFAULT 0,
  controlled_release_fee_rate     numeric     NOT NULL DEFAULT 0,
  document_intelligence_fee       numeric     NOT NULL DEFAULT 0,   -- per document
  tracking_monitoring_fee         numeric     NOT NULL DEFAULT 0,   -- per job

  -- Feature access flags
  capital_readiness_access        boolean     NOT NULL DEFAULT false,
  financing_simulation_access     boolean     NOT NULL DEFAULT false,
  provider_benchmark_access       boolean     NOT NULL DEFAULT false,
  customer_benchmark_access       boolean     NOT NULL DEFAULT false,
  command_center_access           boolean     NOT NULL DEFAULT false,
  priority_support                boolean     NOT NULL DEFAULT false,
  custom_terms_allowed            boolean     NOT NULL DEFAULT false,

  description                     text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_membership_plans_status   ON public.membership_plans (plan_status);
CREATE INDEX IF NOT EXISTS idx_membership_plans_name     ON public.membership_plans (plan_name);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY mp_admin_all ON public.membership_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Provider/Customer: read active plans only (for pricing page & provider membership view)
CREATE POLICY mp_member_read ON public.membership_plans
  FOR SELECT TO authenticated
  USING (plan_status = 'Active');

-- Public/anon: read active plans (pricing page)
CREATE POLICY mp_anon_read ON public.membership_plans
  FOR SELECT TO anon
  USING (plan_status = 'Active');

-- ── Seed data ──────────────────────────────────────────────────────────────────

INSERT INTO public.membership_plans (
  plan_name, plan_status,
  annual_fee, monthly_equivalent, currency,
  included_secured_jobs, included_document_extractions, included_tracking_checks, included_rfqs, included_quotations,
  secured_job_fee_rate, payment_holding_fee_rate, controlled_release_fee_rate, document_intelligence_fee, tracking_monitoring_fee,
  capital_readiness_access, financing_simulation_access, provider_benchmark_access, customer_benchmark_access,
  command_center_access, priority_support, custom_terms_allowed,
  description
) VALUES
(
  'Basic', 'Active',
  3000, 250, 'RM',
  20, 50, 50, 10, 10,
  0.5, 0.3, 0.2, 5.0, 20.0,
  false, false, false, false,
  false, false, false,
  'Entry-level plan for smaller operators. Includes 20 secured jobs, 50 document extractions, and 50 tracking checks per year. Standard service fee rates apply.'
),
(
  'Plus', 'Active',
  12000, 1000, 'RM',
  100, 300, 300, 50, 50,
  0.35, 0.2, 0.15, 3.0, 15.0,
  true, false, true, true,
  false, true, false,
  'Growth plan for established operators. Includes 100 secured jobs, 300 document extractions and tracking checks. Reduced service fee rates. Benchmark access and priority support included.'
),
(
  'Enterprise', 'Active',
  50000, 4167, 'RM',
  1000, 3000, 3000, 500, 500,
  0.2, 0.1, 0.08, 1.0, 10.0,
  true, true, true, true,
  true, true, true,
  'Full-platform plan for large operators. Custom pricing negotiable. All features included. Lowest service fee rates. Command center access, financing simulation, and custom commercial terms.'
)
ON CONFLICT (plan_name) DO NOTHING;

-- ── Optional: Add plan_id to memberships (non-breaking) ──────────────────────
-- Run this only if memberships table exists:

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.membership_plans(id) ON DELETE SET NULL;

-- Back-fill plan_id from plan name (best-effort, nulls are OK):
UPDATE public.memberships m
SET plan_id = mp.id
FROM public.membership_plans mp
WHERE LOWER(TRIM(m.plan)) = LOWER(TRIM(mp.plan_name))
  AND m.plan_id IS NULL;

-- ── Audit log action types (reference) ───────────────────────────────────────
-- membership_plan_created
-- membership_plan_updated
-- membership_plan_activated
-- membership_plan_deactivated
-- membership_upgrade_recommended
