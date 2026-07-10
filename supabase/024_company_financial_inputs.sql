-- =============================================================================
-- 024_company_financial_inputs.sql
-- Manual financial input tables for company credit / financial health reports.
--   company_financial_inputs  — periodic P&L, balance sheet, facility data
--   company_market_inputs     — product, margin, and competitor pricing data
-- Admin-only via RLS; service role bypasses for API routes.
-- =============================================================================

-- ── company_financial_inputs ──────────────────────────────────────────────────

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

-- ── company_market_inputs ─────────────────────────────────────────────────────

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

-- ── RLS: admin-only ───────────────────────────────────────────────────────────

ALTER TABLE public.company_financial_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_market_inputs    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_rw_company_financial_inputs" ON public.company_financial_inputs;
CREATE POLICY "admin_rw_company_financial_inputs"
  ON public.company_financial_inputs USING (nexum_is_admin());

DROP POLICY IF EXISTS "admin_rw_company_market_inputs" ON public.company_market_inputs;
CREATE POLICY "admin_rw_company_market_inputs"
  ON public.company_market_inputs USING (nexum_is_admin());

-- =============================================================================
-- END 024_company_financial_inputs.sql
-- =============================================================================
