-- ─────────────────────────────────────────────────────────────────────────────
-- Shipment Bundle Module  —  multi-leg supply chain orchestration
--
-- Architecture:
--   Customer creates ONE Bundle (SHP-YYYYMMDD-XXXXXX)
--   Each leg is a separate SecureFlow job assigned to a different provider
--   Nexum collects total payment; auto-releases per-leg on leg completion
--   Providers never interact with each other — Nexum is the intermediary
--
-- Payment flow:
--   Customer → pays total (sum of all leg quotes + Nexum platform fee)
--           → Nexum escrow
--           → Released per leg when leg_status = 'Completed'
--
-- Cash Flow Options (payment_terms):
--   full_upfront  — Customer pays 100% on bundle creation (default)
--   milestone     — 40% on booking, 30% on departure confirmed, 30% on delivery
--   net30         — Nexum advances to providers; customer repays Nexum in 30 days
--   net60         — Same but 60 days (requires credit approval)
--
-- Run in Supabase SQL Editor AFTER marketplace_v2 migration
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Reference generator ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_bundle_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE ref text; dup boolean;
BEGIN
  LOOP
    ref := 'SHP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.shipment_bundles WHERE bundle_reference = ref) INTO dup;
    EXIT WHEN NOT dup;
  END LOOP;
  RETURN ref;
END; $$;

-- ─── shipment_bundles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_bundles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference      text        NOT NULL UNIQUE DEFAULT generate_bundle_reference(),
  customer_company_id   uuid        NOT NULL REFERENCES public.companies(id),

  -- Shipment details
  shipment_name         text,                            -- e.g. "Q3 Electronics from Shenzhen"
  origin_country        text        NOT NULL,
  origin_location       text,                            -- city / port / address
  destination_country   text        NOT NULL,
  destination_location  text,
  cargo_type            text,
  cargo_description     text,
  weight_kg             numeric,
  volume_cbm            numeric,
  quantity              integer,
  incoterm              text,                            -- EXW, FOB, CIF, DDP, etc.
  commodity_hs_code     text,                            -- HS code for customs
  ready_date            date,
  target_delivery_date  date,

  -- Bundle status
  bundle_status         text        NOT NULL DEFAULT 'Draft'
                        CHECK (bundle_status IN (
                          'Draft',           -- customer building the bundle
                          'Active',          -- all legs assigned, in progress
                          'Completed',       -- all legs done
                          'Cancelled'
                        )),

  -- Payment & finance
  payment_terms         text        NOT NULL DEFAULT 'full_upfront'
                        CHECK (payment_terms IN ('full_upfront','milestone','net30','net60')),
  total_amount          numeric,                         -- sum of all leg quotes
  platform_fee          numeric,                         -- Nexum's fee (e.g. 2%)
  currency              text        DEFAULT 'MYR',
  payment_status        text        NOT NULL DEFAULT 'Pending'
                        CHECK (payment_status IN (
                          'Pending',         -- not yet paid
                          'Partial',         -- milestone: deposit received
                          'Paid',            -- fully paid to Nexum
                          'Released',        -- all funds released to providers
                          'Refunded'
                        )),
  finance_approved      boolean     DEFAULT false,       -- for net30/net60 terms
  finance_due_date      date,                            -- repayment date for net terms

  -- Milestone payment percentages (for milestone payment_terms)
  milestone_booking_pct    numeric   DEFAULT 40,         -- % due on bundle activation
  milestone_departure_pct  numeric   DEFAULT 30,         -- % due on leg departure confirmed
  milestone_delivery_pct   numeric   DEFAULT 30,         -- % due on final delivery

  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── shipment_legs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipment_legs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id               uuid        NOT NULL REFERENCES public.shipment_bundles(id) ON DELETE CASCADE,
  leg_number              integer     NOT NULL,          -- 1, 2, 3 in sequence
  service_category        text        NOT NULL,          -- Customs Brokerage, Sea Freight, etc.
  leg_description         text,                          -- e.g. "China export customs + CIF to Port Klang"

  -- Provider assignment (via Marketplace RFQ or direct selection)
  provider_company_id     uuid        REFERENCES public.companies(id),
  rfq_id                  uuid        REFERENCES public.marketplace_rfqs(id),
  quote_id                uuid        REFERENCES public.marketplace_quotes(id),
  job_id                  uuid        REFERENCES public.secured_jobs(id),          -- created on provider select

  -- Leg status
  leg_status              text        NOT NULL DEFAULT 'Pending Assignment'
                          CHECK (leg_status IN (
                            'Pending Assignment',        -- no provider yet
                            'RFQ Sent',                  -- RFQ published for this leg
                            'Provider Selected',         -- quote accepted, awaiting job start
                            'In Progress',               -- SecureFlow job active
                            'Completed',                 -- milestone: leg done, triggers next
                            'Cancelled'
                          )),

  -- Scheduling
  estimated_start_date    date,
  estimated_end_date      date,
  actual_start_date       date,
  actual_end_date         date,

  -- Payment for this leg
  leg_amount              numeric,                       -- from accepted quote
  leg_currency            text        DEFAULT 'MYR',
  payment_released        boolean     DEFAULT false,     -- true when released to provider
  payment_released_at     timestamptz,

  -- Handoff
  prerequisite_leg_id     uuid        REFERENCES public.shipment_legs(id),  -- must complete before this starts
  handoff_notes           text,                          -- e.g. "Notify when B/L issued"

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (bundle_id, leg_number)
);

-- ─── Triggers ────────────────────────────────────────────────────────────────

CREATE TRIGGER shipment_bundles_updated_at
  BEFORE UPDATE ON public.shipment_bundles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER shipment_legs_updated_at
  BEFORE UPDATE ON public.shipment_legs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.shipment_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_legs    ENABLE ROW LEVEL SECURITY;

-- Bundles: customer sees own; admin sees all; provider sees legs they're assigned to (via leg table)
CREATE POLICY "bundles_customer_own" ON public.shipment_bundles
  FOR ALL USING (
    customer_company_id = nexum_my_company_id()
    OR nexum_is_admin()
  );

-- Legs: customer sees legs of own bundles; provider sees their own legs; admin sees all
CREATE POLICY "legs_select" ON public.shipment_legs
  FOR SELECT USING (
    nexum_is_admin()
    OR provider_company_id = nexum_my_company_id()
    OR bundle_id IN (
      SELECT id FROM public.shipment_bundles
      WHERE customer_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "legs_customer_manage" ON public.shipment_legs
  FOR ALL USING (
    nexum_is_admin()
    OR bundle_id IN (
      SELECT id FROM public.shipment_bundles
      WHERE customer_company_id = nexum_my_company_id()
    )
  );

-- ─── Helpful view: bundle with leg summary ────────────────────────────────────

CREATE OR REPLACE VIEW public.bundle_summary AS
SELECT
  b.*,
  COUNT(l.id)                                           AS total_legs,
  COUNT(l.id) FILTER (WHERE l.leg_status = 'Completed') AS completed_legs,
  COUNT(l.id) FILTER (WHERE l.leg_status = 'In Progress') AS active_legs,
  SUM(l.leg_amount)                                     AS legs_total_amount
FROM public.shipment_bundles b
LEFT JOIN public.shipment_legs l ON l.bundle_id = b.id
GROUP BY b.id;

-- ─── TradeFlow Finance: credit_applications ──────────────────────────────────
-- Customers apply for net30/net60 financing on specific bundles

CREATE TABLE IF NOT EXISTS public.bundle_finance_applications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id           uuid        NOT NULL REFERENCES public.shipment_bundles(id),
  customer_company_id uuid        NOT NULL REFERENCES public.companies(id),
  requested_terms     text        NOT NULL CHECK (requested_terms IN ('net30','net60')),
  requested_amount    numeric     NOT NULL,
  currency            text        DEFAULT 'MYR',
  status              text        NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending','Approved','Rejected','Repaid')),
  due_date            date,
  admin_note          text,
  approved_by         uuid        REFERENCES public.profiles(id),
  approved_at         timestamptz,
  repaid_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bundle_finance_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_app_own" ON public.bundle_finance_applications
  FOR ALL USING (
    customer_company_id = nexum_my_company_id()
    OR nexum_is_admin()
  );

CREATE TRIGGER bundle_finance_updated_at
  BEFORE UPDATE ON public.bundle_finance_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
