-- =============================================================================
-- TradeFlow v1 — Trade Payment Control & Document Release Workflow
-- =============================================================================

-- ─── Reference generator ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_tradeflow_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars  text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  suffix text := '';
  i      int;
BEGIN
  FOR i IN 1..6 LOOP
    suffix := suffix || substr(chars, floor(random() * 36)::int + 1, 1);
  END LOOP;
  RETURN 'TF-' || to_char(now(), 'YYYYMMDD') || '-' || suffix;
END;
$$;

-- ─── tradeflow_requests ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradeflow_requests (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeflow_reference       text        UNIQUE NOT NULL DEFAULT public.generate_tradeflow_reference(),
  customer_company_id       uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  supplier_company_id       uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  request_type              text,
  trade_type                text        CHECK (trade_type IN ('Import','Export','Domestic','Other')) DEFAULT 'Import',

  supplier_name             text,
  supplier_country          text,
  buyer_name                text,
  buyer_country             text,
  commodity_description     text,
  hs_code                   text,

  currency                  text        DEFAULT 'USD',
  trade_amount              numeric,
  requested_payment_amount  numeric,

  payment_stage             text        CHECK (payment_stage IN (
                                          'Deposit','Balance','Full Payment',
                                          'Milestone Payment','Document Release','Other'
                                        )),
  incoterm                  text,
  origin_country            text,
  destination_country       text,
  shipment_mode             text        CHECK (shipment_mode IN (
                                          'Sea','Air','Truck','Courier','Not Applicable','Other'
                                        )),
  expected_ship_date        date,
  expected_arrival_date     date,
  release_condition         text,

  remittance_required       boolean     DEFAULT false,
  remittance_partner        text,
  remittance_status         text        CHECK (remittance_status IN (
                                          'Not Required',
                                          'Pending Partner Review',
                                          'Pending Customer Instruction',
                                          'Processing by Licensed Partner',
                                          'Completed','Failed','Cancelled'
                                        )) DEFAULT 'Not Required',

  payment_status            text        CHECK (payment_status IN (
                                          'Draft',
                                          'Awaiting Customer Acceptance',
                                          'Awaiting Payment',
                                          'Payment Proof Uploaded',
                                          'Payment Verified',
                                          'Release Review',
                                          'Released','Closed','Disputed','Cancelled'
                                        )) DEFAULT 'Draft',

  workflow_status           text,
  risk_level                text,
  compliance_note           text,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tf_requests_customer_company ON public.tradeflow_requests (customer_company_id);
CREATE INDEX IF NOT EXISTS idx_tf_requests_payment_status   ON public.tradeflow_requests (payment_status);
CREATE INDEX IF NOT EXISTS idx_tf_requests_created_at       ON public.tradeflow_requests (created_at DESC);

ALTER TABLE public.tradeflow_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tradeflow_requests_updated_at ON public.tradeflow_requests;
CREATE TRIGGER tradeflow_requests_updated_at
  BEFORE UPDATE ON public.tradeflow_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── tradeflow_milestones ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradeflow_milestones (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeflow_reference   text        NOT NULL,
  milestone_name        text,
  milestone_type        text        CHECK (milestone_type IN (
                                      'Proforma Invoice Accepted',
                                      'Commercial Invoice Received',
                                      'Packing List Received',
                                      'Production Completed',
                                      'Goods Ready',
                                      'BL/AWB Issued',
                                      'Customs Cleared',
                                      'Delivery Confirmed',
                                      'Customer Approval',
                                      'Admin Release Approval',
                                      'Remittance Completed',
                                      'Other'
                                    )),
  release_percentage    numeric,
  release_amount        numeric,
  required_documents    jsonb       DEFAULT '[]'::jsonb,
  status                text        CHECK (status IN ('Pending','Completed','Rejected','Waived')) DEFAULT 'Pending',
  completed_at          timestamptz,
  completed_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tf_milestones_reference ON public.tradeflow_milestones (tradeflow_reference);

ALTER TABLE public.tradeflow_milestones ENABLE ROW LEVEL SECURITY;

-- ─── tradeflow_payment_instructions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradeflow_payment_instructions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeflow_reference     text        NOT NULL,
  instruction_type        text        CHECK (instruction_type IN (
                                        'Customer Payment to Designated Account',
                                        'Remittance via Licensed Partner',
                                        'Supplier Release Instruction',
                                        'Refund','Other'
                                      )),
  account_holder_name     text,
  bank_name               text,
  account_number_masked   text,       -- always store masked, never full account number
  currency                text,
  amount                  numeric,
  payment_reference       text,
  instruction_status      text        CHECK (instruction_status IN (
                                        'Draft','Issued','Payment Proof Uploaded','Verified','Cancelled'
                                      )) DEFAULT 'Draft',
  created_by              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tf_instructions_reference ON public.tradeflow_payment_instructions (tradeflow_reference);

ALTER TABLE public.tradeflow_payment_instructions ENABLE ROW LEVEL SECURITY;

-- ─── tradeflow_release_reviews ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tradeflow_release_reviews (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tradeflow_reference       text        NOT NULL,
  release_stage             text,
  requested_release_amount  numeric,
  currency                  text,
  release_condition_met     boolean     DEFAULT false,
  document_check_status     text,
  mismatch_flags            jsonb       DEFAULT '[]'::jsonb,
  admin_decision            text        CHECK (admin_decision IN (
                                          'Pending','Approved','Rejected',
                                          'Request More Info','Hold'
                                        )) DEFAULT 'Pending',
  decision_note             text,
  decided_by                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tf_release_reference ON public.tradeflow_release_reviews (tradeflow_reference);

ALTER TABLE public.tradeflow_release_reviews ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- tradeflow_requests: customer sees own company, admin sees all
DROP POLICY IF EXISTS "tf_requests_select_customer" ON public.tradeflow_requests;
CREATE POLICY "tf_requests_select_customer"
  ON public.tradeflow_requests FOR SELECT TO authenticated
  USING (
    nexum_is_admin()
    OR customer_company_id = nexum_my_company_id()
  );

DROP POLICY IF EXISTS "tf_requests_insert_customer" ON public.tradeflow_requests;
CREATE POLICY "tf_requests_insert_customer"
  ON public.tradeflow_requests FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() IN ('customer', 'admin')
    AND (customer_company_id = nexum_my_company_id() OR nexum_is_admin())
  );

DROP POLICY IF EXISTS "tf_requests_update_admin" ON public.tradeflow_requests;
CREATE POLICY "tf_requests_update_admin"
  ON public.tradeflow_requests FOR UPDATE TO authenticated
  USING (nexum_is_admin() OR customer_company_id = nexum_my_company_id())
  WITH CHECK (nexum_is_admin() OR customer_company_id = nexum_my_company_id());

-- tradeflow_milestones: join-based visibility
DROP POLICY IF EXISTS "tf_milestones_select" ON public.tradeflow_milestones;
CREATE POLICY "tf_milestones_select"
  ON public.tradeflow_milestones FOR SELECT TO authenticated
  USING (
    nexum_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tradeflow_requests r
      WHERE r.tradeflow_reference = tradeflow_milestones.tradeflow_reference
        AND r.customer_company_id = nexum_my_company_id()
    )
  );

DROP POLICY IF EXISTS "tf_milestones_insert_admin" ON public.tradeflow_milestones;
CREATE POLICY "tf_milestones_insert_admin"
  ON public.tradeflow_milestones FOR INSERT TO authenticated
  WITH CHECK (nexum_is_admin());

DROP POLICY IF EXISTS "tf_milestones_update_admin" ON public.tradeflow_milestones;
CREATE POLICY "tf_milestones_update_admin"
  ON public.tradeflow_milestones FOR UPDATE TO authenticated
  USING (nexum_is_admin());

-- tradeflow_payment_instructions: admin manages, customer reads own
DROP POLICY IF EXISTS "tf_instructions_select" ON public.tradeflow_payment_instructions;
CREATE POLICY "tf_instructions_select"
  ON public.tradeflow_payment_instructions FOR SELECT TO authenticated
  USING (
    nexum_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tradeflow_requests r
      WHERE r.tradeflow_reference = tradeflow_payment_instructions.tradeflow_reference
        AND r.customer_company_id = nexum_my_company_id()
    )
  );

DROP POLICY IF EXISTS "tf_instructions_insert_admin" ON public.tradeflow_payment_instructions;
CREATE POLICY "tf_instructions_insert_admin"
  ON public.tradeflow_payment_instructions FOR INSERT TO authenticated
  WITH CHECK (nexum_is_admin());

DROP POLICY IF EXISTS "tf_instructions_update_admin" ON public.tradeflow_payment_instructions;
CREATE POLICY "tf_instructions_update_admin"
  ON public.tradeflow_payment_instructions FOR UPDATE TO authenticated
  USING (nexum_is_admin());

-- tradeflow_release_reviews: admin manages, customer reads own
DROP POLICY IF EXISTS "tf_reviews_select" ON public.tradeflow_release_reviews;
CREATE POLICY "tf_reviews_select"
  ON public.tradeflow_release_reviews FOR SELECT TO authenticated
  USING (
    nexum_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tradeflow_requests r
      WHERE r.tradeflow_reference = tradeflow_release_reviews.tradeflow_reference
        AND r.customer_company_id = nexum_my_company_id()
    )
  );

DROP POLICY IF EXISTS "tf_reviews_insert_admin" ON public.tradeflow_release_reviews;
CREATE POLICY "tf_reviews_insert_admin"
  ON public.tradeflow_release_reviews FOR INSERT TO authenticated
  WITH CHECK (nexum_is_admin());

DROP POLICY IF EXISTS "tf_reviews_update_admin" ON public.tradeflow_release_reviews;
CREATE POLICY "tf_reviews_update_admin"
  ON public.tradeflow_release_reviews FOR UPDATE TO authenticated
  USING (nexum_is_admin());
