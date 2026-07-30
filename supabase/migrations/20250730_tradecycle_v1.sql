-- ─────────────────────────────────────────────────────────────────────────────
-- Nexum TradeCycle / Deposit Multiplier Planning Module
-- Customer balances are split into Available / Reserved / Settled.
-- Trade capacity is an estimate only.
-- Financing simulations are subject to credit review and approval.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Wallet ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradecycle_wallets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  currency          text        NOT NULL DEFAULT 'MYR',
  total_balance     numeric     NOT NULL DEFAULT 0,
  available_balance numeric     NOT NULL DEFAULT 0,
  reserved_balance  numeric     NOT NULL DEFAULT 0,
  settled_balance   numeric     NOT NULL DEFAULT 0,
  wallet_status     text        NOT NULL DEFAULT 'Active'
                    CHECK (wallet_status IN ('Active','Suspended','Closed')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (company_id, currency)
);

CREATE INDEX IF NOT EXISTS tcw_company_id ON public.tradecycle_wallets(company_id);

-- ── 2. Reserves ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradecycle_reserves (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           uuid        NOT NULL REFERENCES public.tradecycle_wallets(id) ON DELETE CASCADE,
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bundle_reference    text,
  tradeflow_reference text,
  trade_chain_reference text,
  reserve_reference   text        UNIQUE NOT NULL,
  reserved_amount     numeric     NOT NULL DEFAULT 0,
  currency            text        NOT NULL DEFAULT 'MYR',
  reserve_purpose     text        NOT NULL
                      CHECK (reserve_purpose IN (
                        'Shipment Deposit',
                        'Supplier Deposit',
                        'Provider Payment',
                        'Customs Duty Tax',
                        'Freight Leg',
                        'Transport Leg',
                        'Release Buffer',
                        'Financing First Loss',
                        'Other'
                      )),
  reserve_status      text        NOT NULL DEFAULT 'Reserved'
                      CHECK (reserve_status IN (
                        'Reserved',
                        'Partially Released',
                        'Released',
                        'Settled',
                        'Cancelled'
                      )),
  release_condition   text,
  released_amount     numeric     NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tcr_wallet_id       ON public.tradecycle_reserves(wallet_id);
CREATE INDEX IF NOT EXISTS tcr_company_id      ON public.tradecycle_reserves(company_id);
CREATE INDEX IF NOT EXISTS tcr_bundle_ref      ON public.tradecycle_reserves(bundle_reference);
CREATE INDEX IF NOT EXISTS tcr_reserve_status  ON public.tradecycle_reserves(reserve_status);

-- ── 3. Capacity Analysis ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradecycle_capacity_analysis (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wallet_id                  uuid        REFERENCES public.tradecycle_wallets(id),
  analysis_reference         text        UNIQUE NOT NULL,
  current_cash_balance       numeric     DEFAULT 0,
  available_balance          numeric     DEFAULT 0,
  reserved_balance           numeric     DEFAULT 0,
  active_trade_value         numeric     DEFAULT 0,
  proposed_trade_value       numeric     DEFAULT 0,
  required_customer_deposit  numeric     DEFAULT 0,
  partner_financing_amount   numeric     DEFAULT 0,
  funding_gap_amount         numeric     DEFAULT 0,
  funding_gap_days           integer     DEFAULT 0,
  estimated_fee              numeric     DEFAULT 0,
  trade_capacity_multiplier  numeric     DEFAULT 1,
  recommended_payment_model  text
                             CHECK (recommended_payment_model IN (
                               'Full Upfront',
                               'Deposit + Balance',
                               'Partner-Funded Gap',
                               'Milestone Payment',
                               'Vendor Credit Term',
                               'Manual Review'
                             )),
  risk_level                 text        CHECK (risk_level IN ('Low','Medium','High','Critical')),
  eligibility_status         text        NOT NULL DEFAULT 'Simulation Only'
                             CHECK (eligibility_status IN (
                               'Simulation Only',
                               'Potentially Eligible',
                               'Requires Review',
                               'Not Suitable'
                             )),
  analysis_note              text,
  created_at                 timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tca_company_id ON public.tradecycle_capacity_analysis(company_id);

-- ── 4. Financing Simulations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradecycle_financing_simulations (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bundle_reference         text,
  tradeflow_reference      text,
  simulation_type          text        NOT NULL
                           CHECK (simulation_type IN (
                             'Customer Shipment Deferment',
                             'Supplier Deposit Financing',
                             'Supplier Balance Financing',
                             'Provider Working Capital',
                             'Payout Acceleration',
                             'Inventory Financing',
                             'Receivable Financing'
                           )),
  trade_amount             numeric     DEFAULT 0,
  customer_deposit         numeric     DEFAULT 0,
  partner_financing_amount numeric     DEFAULT 0,
  tenor_days               integer     DEFAULT 30,
  estimated_fee_rate       numeric     DEFAULT 0,
  estimated_fee_amount     numeric     DEFAULT 0,
  repayment_source         text,
  required_documents       jsonb       DEFAULT '[]'::jsonb,
  eligibility_status       text        NOT NULL DEFAULT 'Simulation Only',
  created_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tcfs_company_id ON public.tradecycle_financing_simulations(company_id);

-- ── 5. Audit Log ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradecycle_audit_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        REFERENCES public.companies(id),
  wallet_id      uuid        REFERENCES public.tradecycle_wallets(id),
  reserve_id     uuid        REFERENCES public.tradecycle_reserves(id),
  event_type     text        NOT NULL
                 CHECK (event_type IN (
                   'wallet_topup_recorded',
                   'reserve_created',
                   'reserve_released',
                   'reserve_settled',
                   'reserve_cancelled',
                   'capacity_analysis_created',
                   'financing_simulation_created',
                   'trade_capacity_exceeded'
                 )),
  event_amount   numeric,
  currency       text,
  description    text,
  performed_by   uuid        REFERENCES auth.users(id),
  metadata       jsonb       DEFAULT '{}'::jsonb,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tcal_company_id  ON public.tradecycle_audit_log(company_id);
CREATE INDEX IF NOT EXISTS tcal_wallet_id   ON public.tradecycle_audit_log(wallet_id);
CREATE INDEX IF NOT EXISTS tcal_event_type  ON public.tradecycle_audit_log(event_type);
CREATE INDEX IF NOT EXISTS tcal_created_at  ON public.tradecycle_audit_log(created_at DESC);

-- ── 6. Reference generators ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_reserve_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_date text := to_char(now(), 'YYYYMMDD');
  v_rand text;
BEGIN
  SELECT string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ceil(random()*36)::int, 1), '')
  INTO v_rand FROM generate_series(1, 6);
  RETURN 'RSV-' || v_date || '-' || v_rand;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_analysis_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_date text := to_char(now(), 'YYYYMMDD');
  v_rand text;
BEGIN
  SELECT string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ceil(random()*36)::int, 1), '')
  INTO v_rand FROM generate_series(1, 6);
  RETURN 'TCA-' || v_date || '-' || v_rand;
END;
$$;

-- ── 7. updated_at triggers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tc_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tc_wallet_updated_at  ON public.tradecycle_wallets;
CREATE TRIGGER tc_wallet_updated_at
  BEFORE UPDATE ON public.tradecycle_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tc_set_updated_at();

DROP TRIGGER IF EXISTS tc_reserve_updated_at ON public.tradecycle_reserves;
CREATE TRIGGER tc_reserve_updated_at
  BEFORE UPDATE ON public.tradecycle_reserves
  FOR EACH ROW EXECUTE FUNCTION public.tc_set_updated_at();

-- ── 8. Wallet balance recompute function ──────────────────────────────────────
-- Called after any reserve change to keep wallet totals consistent.

CREATE OR REPLACE FUNCTION public.recompute_wallet_balances(p_wallet_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reserved  numeric;
  v_settled   numeric;
  v_total     numeric;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN reserve_status IN ('Reserved','Partially Released')
                      THEN reserved_amount - released_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reserve_status = 'Settled'
                      THEN released_amount ELSE 0 END), 0)
  INTO v_reserved, v_settled
  FROM public.tradecycle_reserves
  WHERE wallet_id = p_wallet_id;

  SELECT total_balance INTO v_total
  FROM public.tradecycle_wallets WHERE id = p_wallet_id;

  UPDATE public.tradecycle_wallets SET
    reserved_balance  = v_reserved,
    settled_balance   = v_settled,
    available_balance = GREATEST(0, v_total - v_reserved)
  WHERE id = p_wallet_id;
END;
$$;

-- ── 9. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.tradecycle_wallets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradecycle_reserves             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradecycle_capacity_analysis    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradecycle_financing_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradecycle_audit_log            ENABLE ROW LEVEL SECURITY;

-- Helper: is current user admin?
-- (reuses existing nexum_is_admin() if available, otherwise inline check)

-- ── Wallets ──
CREATE POLICY "tcw_admin_all" ON public.tradecycle_wallets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "tcw_company_own" ON public.tradecycle_wallets
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ── Reserves ──
CREATE POLICY "tcr_admin_all" ON public.tradecycle_reserves
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "tcr_company_own" ON public.tradecycle_reserves
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ── Capacity Analysis ──
CREATE POLICY "tca_admin_all" ON public.tradecycle_capacity_analysis
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "tca_company_own" ON public.tradecycle_capacity_analysis
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ── Financing Simulations ──
CREATE POLICY "tcfs_admin_all" ON public.tradecycle_financing_simulations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "tcfs_company_own" ON public.tradecycle_financing_simulations
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ── Audit Log — read-only for company, full for admin ──
CREATE POLICY "tcal_admin_all" ON public.tradecycle_audit_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "tcal_company_read" ON public.tradecycle_audit_log
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Run as role: postgres in Supabase SQL Editor.
