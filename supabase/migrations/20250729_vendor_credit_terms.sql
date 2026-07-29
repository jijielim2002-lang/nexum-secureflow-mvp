-- ─────────────────────────────────────────────────────────────────────────────
-- Vendor Credit Term Module
-- Allows customers to record, monitor, and build history on vendor credit terms
-- instead of being forced into Nexum upfront payment models.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Main table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendor_credit_terms (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links (at least one should be set)
  tradeflow_reference       text,
  bundle_reference          text,
  trade_chain_reference     text,

  -- Parties
  buyer_company_id          uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  supplier_company_id       uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  supplier_name             text        NOT NULL,

  -- Invoice details
  invoice_reference         text,
  invoice_date              date,
  due_date                  date        NOT NULL,
  credit_days               integer,
  credit_limit_granted      numeric     DEFAULT 0,
  invoice_amount            numeric     NOT NULL DEFAULT 0,
  currency                  text        NOT NULL DEFAULT 'MYR',

  -- Status
  payment_status            text        NOT NULL DEFAULT 'Not Due'
                            CHECK (payment_status IN (
                              'Not Due',
                              'Due Soon',
                              'Paid On Time',
                              'Paid Late',
                              'Overdue',
                              'Disputed',
                              'Cancelled'
                            )),

  -- Payment proof
  payment_proof_document_id uuid,
  paid_at                   timestamptz,
  days_late                 integer,

  -- Scoring signals (computed on proof upload / overdue trigger)
  buyer_score_delta         integer     DEFAULT 0,   -- positive = good, negative = bad
  score_reason              text,

  -- Reminders sent (bitmask-style flags)
  reminder_7d_sent          boolean     DEFAULT false,
  reminder_3d_sent          boolean     DEFAULT false,
  reminder_due_sent         boolean     DEFAULT false,
  reminder_overdue_sent     boolean     DEFAULT false,

  -- Audit
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vct_buyer_company_id      ON public.vendor_credit_terms(buyer_company_id);
CREATE INDEX IF NOT EXISTS vct_bundle_reference      ON public.vendor_credit_terms(bundle_reference);
CREATE INDEX IF NOT EXISTS vct_tradeflow_reference   ON public.vendor_credit_terms(tradeflow_reference);
CREATE INDEX IF NOT EXISTS vct_due_date              ON public.vendor_credit_terms(due_date);
CREATE INDEX IF NOT EXISTS vct_payment_status        ON public.vendor_credit_terms(payment_status);

-- ── 3. Payment model: ALTER shipment_bundles to add 'Vendor Credit Term' ──────

DO $$
BEGIN
  -- Drop the old CHECK constraint on shipment_bundles.payment_model and replace it
  -- (constraint name may vary; use a safe drop-and-recreate pattern)
  ALTER TABLE public.shipment_bundles
    DROP CONSTRAINT IF EXISTS shipment_bundles_payment_model_check;

  ALTER TABLE public.shipment_bundles
    ADD CONSTRAINT shipment_bundles_payment_model_check
    CHECK (payment_model IN (
      'Full Upfront',
      'Deposit + Balance',
      'Milestone Payment',
      'Financed Gap',
      'Vendor Credit Term',
      'Manual'
    ));
END $$;

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.vct_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vct_set_updated_at ON public.vendor_credit_terms;
CREATE TRIGGER vct_set_updated_at
  BEFORE UPDATE ON public.vendor_credit_terms
  FOR EACH ROW EXECUTE FUNCTION public.vct_set_updated_at();

-- ── 5. Auto-status view: "due soon" and "overdue" ────────────────────────────
-- Computed view used by admin dashboard; actual status column updated via API.

CREATE OR REPLACE VIEW public.vendor_credit_terms_status AS
SELECT
  v.*,
  (v.due_date - CURRENT_DATE)               AS days_until_due,
  CASE
    WHEN v.payment_status IN ('Paid On Time','Paid Late','Cancelled','Disputed') THEN v.payment_status
    WHEN CURRENT_DATE > v.due_date           THEN 'Overdue'
    WHEN (v.due_date - CURRENT_DATE) <= 3   THEN 'Due Soon'
    WHEN (v.due_date - CURRENT_DATE) <= 7   THEN 'Due Soon'
    ELSE 'Not Due'
  END                                        AS computed_status
FROM public.vendor_credit_terms v;

-- ── 6. Buyer credit behaviour score function ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_buyer_score_delta(
  p_paid_at       timestamptz,
  p_due_date      date,
  p_has_proof     boolean,
  p_is_disputed   boolean
)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_score integer := 0;
  v_days_late integer;
BEGIN
  IF p_is_disputed THEN
    RETURN -10;
  END IF;

  IF NOT p_has_proof THEN
    RETURN -5;
  END IF;

  v_days_late := EXTRACT(DAY FROM (p_paid_at - p_due_date::timestamptz))::integer;

  IF v_days_late <= 0 THEN
    v_score := 10;  -- paid on time or early
  ELSIF v_days_late <= 7 THEN
    v_score := 2;   -- slightly late
  ELSIF v_days_late <= 14 THEN
    v_score := -3;
  ELSE
    v_score := -8;  -- significantly late
  END IF;

  RETURN v_score;
END;
$$;

-- ── 7. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.vendor_credit_terms ENABLE ROW LEVEL SECURITY;

-- Admin: see everything
CREATE POLICY "admin_all_vct" ON public.vendor_credit_terms
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Buyer company: see and manage their own vendor credit terms
CREATE POLICY "buyer_own_vct" ON public.vendor_credit_terms
  FOR ALL TO authenticated
  USING (
    buyer_company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    buyer_company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ── 8. Grant on view ──────────────────────────────────────────────────────────

GRANT SELECT ON public.vendor_credit_terms_status TO authenticated;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Run this file as role: postgres in Supabase SQL Editor.
