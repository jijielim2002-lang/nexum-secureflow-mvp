-- ═══════════════════════════════════════════════════════════════════════════
-- Nexum Supply Chain Orchestration v1
-- Replaces previous shipment_bundles / shipment_legs (draft) tables.
-- Run AFTER: marketplace_v2 migration
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Drop previous draft tables (from bundle MVP) ───────────────────────────
DROP TABLE IF EXISTS public.bundle_finance_applications  CASCADE;
DROP TABLE IF EXISTS public.shipment_legs               CASCADE;
DROP TABLE IF EXISTS public.shipment_bundles            CASCADE;

-- ── Reference generators ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_bundle_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE ref text; dup boolean;
BEGIN
  LOOP
    ref := 'SHP-' || to_char(now(),'YYYYMMDD') || '-' || upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.shipment_bundles WHERE bundle_reference = ref) INTO dup;
    EXIT WHEN NOT dup;
  END LOOP; RETURN ref;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_leg_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE ref text; dup boolean;
BEGIN
  LOOP
    ref := 'LEG-' || to_char(now(),'YYYYMMDD') || '-' || upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.shipment_legs WHERE leg_reference = ref) INTO dup;
    EXIT WHEN NOT dup;
  END LOOP; RETURN ref;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Part A — shipment_bundles
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.shipment_bundles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference      text        NOT NULL UNIQUE DEFAULT generate_bundle_reference(),
  customer_company_id   uuid        REFERENCES public.companies(id),
  created_by            uuid        REFERENCES auth.users(id),

  -- Shipment identity
  bundle_title          text,
  trade_type            text        NOT NULL DEFAULT 'Import'
                        CHECK (trade_type IN ('Import','Export','Domestic','Cross-border','Other')),
  shipment_mode         text        NOT NULL DEFAULT 'Multimodal'
                        CHECK (shipment_mode IN ('Sea','Air','Road','Multimodal','Other')),

  -- Route
  origin_country        text,
  destination_country   text,
  origin_location       text,
  destination_location  text,

  -- Cargo
  cargo_description     text,
  cargo_type            text        NOT NULL DEFAULT 'General Cargo',
  hs_code               text,
  incoterm              text,
  gross_weight_kg       numeric,
  volume_cbm            numeric,
  quantity              integer,

  -- Financials
  total_service_amount  numeric     NOT NULL DEFAULT 0,
  total_cargo_value     numeric     NOT NULL DEFAULT 0,
  currency              text        NOT NULL DEFAULT 'MYR',

  -- Status
  bundle_status         text        NOT NULL DEFAULT 'Draft'
                        CHECK (bundle_status IN (
                          'Draft',
                          'Pending Quote',
                          'Pending Customer Acceptance',
                          'Active',
                          'In Progress',
                          'Partially Completed',
                          'Completed',
                          'Disputed',
                          'Cancelled'
                        )),

  -- Payment & finance
  payment_model         text        NOT NULL DEFAULT 'Full Upfront'
                        CHECK (payment_model IN (
                          'Full Upfront',
                          'Deposit + Balance',
                          'Milestone Payment',
                          'Financed Gap',
                          'Manual'
                        )),
  cashflow_status       text,
  risk_level            text        CHECK (risk_level IN ('Low','Medium','High','Critical')),

  -- Dates
  cargo_ready_date      date,
  target_delivery_date  date,

  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER shipment_bundles_updated_at
  BEFORE UPDATE ON public.shipment_bundles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Part B — shipment_legs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.shipment_legs (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference            text        NOT NULL,
  leg_reference               text        NOT NULL UNIQUE DEFAULT generate_leg_reference(),
  leg_sequence                integer     NOT NULL,

  leg_type                    text        NOT NULL
                              CHECK (leg_type IN (
                                'Customs Clearance',
                                'Sea Freight',
                                'Air Freight',
                                'Local Transport',
                                'Console Truck',
                                'Courier',
                                'Warehouse',
                                'TradeFlow',
                                'Other'
                              )),

  -- Provider assignment
  service_provider_company_id uuid        REFERENCES public.companies(id),
  provider_name               text,

  -- Links to marketplace + jobs
  service_listing_id          uuid,
  quote_reference             text,
  secured_job_reference       text,

  -- Route
  origin_location             text,
  destination_location        text,

  -- Dates
  expected_start_date         date,
  expected_end_date           date,
  actual_start_at             timestamptz,
  actual_completed_at         timestamptz,

  -- Financials
  leg_amount                  numeric     NOT NULL DEFAULT 0,
  currency                    text        NOT NULL DEFAULT 'MYR',
  payable_to_provider         boolean     NOT NULL DEFAULT true,

  -- Status
  leg_status                  text        NOT NULL DEFAULT 'Draft'
                              CHECK (leg_status IN (
                                'Draft',
                                'RFQ',
                                'Quoted',
                                'Assigned',
                                'Awaiting Start',
                                'In Progress',
                                'Completed',
                                'Blocked',
                                'Disputed',
                                'Cancelled'
                              )),

  -- Handoff trigger
  trigger_next_leg_on_status  text,   -- e.g. 'Completed' → triggers leg_sequence+1
  handoff_note                text,

  -- Risk
  risk_flags                  text[],

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (bundle_reference, leg_sequence)
);

CREATE TRIGGER shipment_legs_updated_at
  BEFORE UPDATE ON public.shipment_legs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Part C — Alter secured_jobs to support bundle orchestration
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS bundle_reference         text,
  ADD COLUMN IF NOT EXISTS leg_reference            text,
  ADD COLUMN IF NOT EXISTS is_bundle_leg            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bundle_sequence          integer,
  ADD COLUMN IF NOT EXISTS orchestrator_company_id  uuid REFERENCES public.companies(id);

CREATE INDEX IF NOT EXISTS idx_secured_jobs_bundle ON public.secured_jobs(bundle_reference) WHERE bundle_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_secured_jobs_leg    ON public.secured_jobs(leg_reference)    WHERE leg_reference IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Part D — Payment Allocation
-- ═══════════════════════════════════════════════════════════════════════════

-- One payment plan per bundle
CREATE TABLE public.bundle_payment_plans (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference            text        NOT NULL,
  payment_model               text,
  total_amount                numeric     NOT NULL DEFAULT 0,
  deposit_amount              numeric     NOT NULL DEFAULT 0,   -- for Deposit + Balance model
  balance_amount              numeric     GENERATED ALWAYS AS (total_amount - deposit_amount) STORED,
  currency                    text        NOT NULL DEFAULT 'MYR',
  customer_company_id         uuid        REFERENCES public.companies(id),
  primary_payee_company_id    uuid        REFERENCES public.companies(id), -- Company A / lead provider
  designated_account_note     text,   -- instruction to customer on where to pay
  payment_due_date            date,
  deposit_due_date            date,
  balance_due_date            date,
  payment_status              text        NOT NULL DEFAULT 'Draft'
                              CHECK (payment_status IN (
                                'Draft',
                                'Issued',
                                'Awaiting Payment',
                                'Payment Proof Uploaded',
                                'Payment Verified',
                                'Partially Allocated',
                                'Fully Allocated',
                                'Closed',
                                'Cancelled'
                              )),
  payment_proof_url           text,
  payment_proof_uploaded_at   timestamptz,
  payment_verified_by         uuid        REFERENCES auth.users(id),
  payment_verified_at         timestamptz,
  nexum_platform_fee_pct      numeric     DEFAULT 2.0,   -- % of total
  nexum_platform_fee_amount   numeric     DEFAULT 0,
  internal_notes              text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER bundle_payment_plans_updated_at
  BEFORE UPDATE ON public.bundle_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-leg (and per-fee-type) allocation lines
CREATE TABLE public.bundle_payment_allocations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference        text        NOT NULL,
  leg_reference           text,
  secured_job_reference   text,
  payable_company_id      uuid        REFERENCES public.companies(id),
  payable_company_name    text,

  allocation_type         text        NOT NULL
                          CHECK (allocation_type IN (
                            'Provider Leg Fee',
                            'Nexum Platform Fee',
                            'Customs Disbursement',
                            'Duty Tax',
                            'Insurance',
                            'Other'
                          )),
  allocation_amount       numeric     NOT NULL DEFAULT 0,
  currency                text        NOT NULL DEFAULT 'MYR',

  -- Release conditions
  release_condition       text,
  release_trigger_milestone text,
  release_status          text        NOT NULL DEFAULT 'Pending'
                          CHECK (release_status IN (
                            'Pending',
                            'Eligible',
                            'Approved',
                            'Released',
                            'On Hold',
                            'Rejected',
                            'Cancelled'
                          )),
  release_instruction_ref text,   -- internal reference for payout instruction
  released_at             timestamptz,
  released_by             uuid        REFERENCES auth.users(id),
  release_note            text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER bundle_payment_allocations_updated_at
  BEFORE UPDATE ON public.bundle_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Part E — Cash Flow Analysis
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.bundle_cashflow_analysis (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference                text        NOT NULL,
  customer_company_id             uuid        REFERENCES public.companies(id),
  orchestrator_company_id         uuid        REFERENCES public.companies(id),

  -- Amounts
  total_bundle_amount             numeric,
  customer_deposit_amount         numeric     DEFAULT 0,
  customer_balance_amount         numeric,

  -- Dates
  expected_cash_in_date           date,   -- when customer pays
  expected_cash_out_date          date,   -- when providers need to be paid
  earliest_provider_payable_date  date,
  latest_customer_collection_date date,   -- when importer receives goods

  -- Gap analysis
  funding_gap_amount              numeric     DEFAULT 0,
  funding_gap_days                integer     DEFAULT 0,
  transit_days_estimate           integer     DEFAULT 20,

  gap_owner                       text        CHECK (gap_owner IN (
                                    'Customer',
                                    'Orchestrator Provider',
                                    'Leg Provider',
                                    'Nexum/Finance Partner',
                                    'None'
                                  )),

  recommended_financing_product   text        CHECK (recommended_financing_product IN (
                                    'None',
                                    'Customer Shipment Deferment',
                                    'Provider Working Capital',
                                    'Leg Payout Acceleration',
                                    'Release Against Milestone',
                                    'Supplier Balance Financing',
                                    'Manual Review'
                                  )),

  risk_level                      text        CHECK (risk_level IN ('Low','Medium','High','Critical')),
  analysis_note                   text,
  computed_at                     timestamptz DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER bundle_cashflow_updated_at
  BEFORE UPDATE ON public.bundle_cashflow_analysis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- Part F — Financing Simulations (simulation only, no disbursement)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.bundle_financing_simulations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference    text        NOT NULL,
  simulation_type     text        NOT NULL
                      CHECK (simulation_type IN (
                        'Customer Deferment',
                        'Provider Working Capital',
                        'Payout Acceleration',
                        'Milestone Financing'
                      )),
  financing_amount    numeric     NOT NULL DEFAULT 0,
  currency            text        NOT NULL DEFAULT 'MYR',
  tenor_days          integer     NOT NULL DEFAULT 30,
  fee_rate            numeric     DEFAULT 0.02,   -- e.g. 2% per tenor
  fee_amount          numeric     GENERATED ALWAYS AS (financing_amount * fee_rate) STORED,
  repayment_source    text,
  eligibility_status  text        NOT NULL DEFAULT 'Simulation Only'
                      CHECK (eligibility_status IN (
                        'Simulation Only',
                        'Potentially Eligible',
                        'Requires Review',
                        'Not Suitable'
                      )),
  simulation_note     text        DEFAULT 'Simulation only — subject to credit review and documentation.',
  requested_by        uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Part H — Bundle Participants (Provider Dual Role)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.bundle_participants (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference    text        NOT NULL,
  company_id          uuid        NOT NULL REFERENCES public.companies(id),
  participant_role    text        NOT NULL
                      CHECK (participant_role IN (
                        'bundle_customer',
                        'bundle_orchestrator',
                        'leg_provider',
                        'finance_reviewer',
                        'admin'
                      )),
  leg_reference       text,   -- null = applies to whole bundle
  added_by            uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_reference, company_id, participant_role, leg_reference)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Part I — Risk Flags
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.bundle_risk_flags (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_reference text        NOT NULL,
  leg_reference    text,
  flag_type        text        NOT NULL
                   CHECK (flag_type IN (
                     'Leg Delay',
                     'Provider No Response',
                     'Payment Allocation Mismatch',
                     'Missing Document',
                     'Customs Hold',
                     'Cargo Arrived But Transport Not Assigned',
                     'Provider Payout Blocked',
                     'Customer Balance Overdue',
                     'Funding Gap High',
                     'Financing Review Required'
                   )),
  severity         text        NOT NULL DEFAULT 'Medium'
                   CHECK (severity IN ('Low','Medium','High','Critical')),
  description      text,
  is_resolved      boolean     NOT NULL DEFAULT false,
  resolved_at      timestamptz,
  resolved_by      uuid        REFERENCES auth.users(id),
  resolution_note  text,
  raised_by        uuid        REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_bundles_customer      ON public.shipment_bundles(customer_company_id);
CREATE INDEX idx_bundles_status        ON public.shipment_bundles(bundle_status);
CREATE INDEX idx_bundles_created       ON public.shipment_bundles(created_at DESC);

CREATE INDEX idx_legs_bundle           ON public.shipment_legs(bundle_reference);
CREATE INDEX idx_legs_provider         ON public.shipment_legs(service_provider_company_id);
CREATE INDEX idx_legs_status           ON public.shipment_legs(leg_status);
CREATE INDEX idx_legs_job              ON public.shipment_legs(secured_job_reference) WHERE secured_job_reference IS NOT NULL;

CREATE INDEX idx_bpp_bundle            ON public.bundle_payment_plans(bundle_reference);
CREATE INDEX idx_bpa_bundle            ON public.bundle_payment_allocations(bundle_reference);
CREATE INDEX idx_bpa_leg               ON public.bundle_payment_allocations(leg_reference);
CREATE INDEX idx_bpa_payable_company   ON public.bundle_payment_allocations(payable_company_id);
CREATE INDEX idx_bcf_bundle            ON public.bundle_cashflow_analysis(bundle_reference);
CREATE INDEX idx_bfs_bundle            ON public.bundle_financing_simulations(bundle_reference);
CREATE INDEX idx_bpart_bundle          ON public.bundle_participants(bundle_reference);
CREATE INDEX idx_bpart_company         ON public.bundle_participants(company_id);
CREATE INDEX idx_brisk_bundle          ON public.bundle_risk_flags(bundle_reference);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.shipment_bundles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_legs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_payment_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_payment_allocations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_cashflow_analysis     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_financing_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_participants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_risk_flags            ENABLE ROW LEVEL SECURITY;

-- Helper: is current company a participant in this bundle?
CREATE OR REPLACE FUNCTION public.nexum_bundle_participant(p_bundle_reference text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bundle_participants
    WHERE bundle_reference = p_bundle_reference
      AND company_id = nexum_my_company_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.shipment_bundles
    WHERE bundle_reference = p_bundle_reference
      AND customer_company_id = nexum_my_company_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.shipment_legs
    WHERE bundle_reference = p_bundle_reference
      AND service_provider_company_id = nexum_my_company_id()
  );
$$;

-- shipment_bundles
CREATE POLICY "bundles_select" ON public.shipment_bundles FOR SELECT USING (
  nexum_is_admin()
  OR customer_company_id = nexum_my_company_id()
  OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "bundles_insert" ON public.shipment_bundles FOR INSERT WITH CHECK (
  nexum_is_admin() OR customer_company_id = nexum_my_company_id()
);
CREATE POLICY "bundles_update" ON public.shipment_bundles FOR UPDATE USING (
  nexum_is_admin() OR customer_company_id = nexum_my_company_id()
);

-- shipment_legs
CREATE POLICY "legs_select" ON public.shipment_legs FOR SELECT USING (
  nexum_is_admin()
  OR service_provider_company_id = nexum_my_company_id()
  OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "legs_insert" ON public.shipment_legs FOR INSERT WITH CHECK (
  nexum_is_admin()
  OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "legs_update" ON public.shipment_legs FOR UPDATE USING (
  nexum_is_admin()
  OR service_provider_company_id = nexum_my_company_id()
  OR nexum_bundle_participant(bundle_reference)
);

-- payment_plans — customer + admin
CREATE POLICY "bpp_select" ON public.bundle_payment_plans FOR SELECT USING (
  nexum_is_admin() OR customer_company_id = nexum_my_company_id() OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "bpp_manage" ON public.bundle_payment_plans FOR ALL USING (
  nexum_is_admin() OR customer_company_id = nexum_my_company_id()
);

-- payment_allocations — each provider sees own allocation; customer sees all; admin sees all
CREATE POLICY "bpa_select" ON public.bundle_payment_allocations FOR SELECT USING (
  nexum_is_admin()
  OR payable_company_id = nexum_my_company_id()
  OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "bpa_manage" ON public.bundle_payment_allocations FOR ALL USING (nexum_is_admin());

-- cashflow — customer + admin
CREATE POLICY "bcf_select" ON public.bundle_cashflow_analysis FOR SELECT USING (
  nexum_is_admin() OR customer_company_id = nexum_my_company_id() OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "bcf_manage" ON public.bundle_cashflow_analysis FOR ALL USING (
  nexum_is_admin() OR customer_company_id = nexum_my_company_id()
);

-- financing simulations — customer + admin
CREATE POLICY "bfs_select" ON public.bundle_financing_simulations FOR SELECT USING (
  nexum_is_admin() OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "bfs_insert" ON public.bundle_financing_simulations FOR INSERT WITH CHECK (
  nexum_is_admin() OR nexum_bundle_participant(bundle_reference)
);

-- participants
CREATE POLICY "bpart_select" ON public.bundle_participants FOR SELECT USING (
  nexum_is_admin() OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "bpart_manage" ON public.bundle_participants FOR ALL USING (nexum_is_admin());

-- risk flags — admin manages; participants can see
CREATE POLICY "brisk_select" ON public.bundle_risk_flags FOR SELECT USING (
  nexum_is_admin() OR nexum_bundle_participant(bundle_reference)
);
CREATE POLICY "brisk_manage" ON public.bundle_risk_flags FOR ALL USING (nexum_is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- Evidence Pack View  (Part J)
-- Aggregates all evidence for a bundle into one query
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.bundle_evidence_pack AS
SELECT
  b.bundle_reference,
  b.bundle_title,
  b.bundle_status,
  b.customer_company_id,
  b.total_service_amount,
  b.currency,
  b.created_at  AS bundle_created_at,

  -- Leg summary
  (SELECT json_agg(json_build_object(
      'leg_reference',   l.leg_reference,
      'leg_sequence',    l.leg_sequence,
      'leg_type',        l.leg_type,
      'leg_status',      l.leg_status,
      'provider',        l.provider_name,
      'leg_amount',      l.leg_amount,
      'actual_start',    l.actual_start_at,
      'actual_completed',l.actual_completed_at,
      'job_reference',   l.secured_job_reference
    ) ORDER BY l.leg_sequence)
   FROM public.shipment_legs l WHERE l.bundle_reference = b.bundle_reference
  ) AS legs,

  -- Payment plan
  (SELECT row_to_json(pp.*) FROM public.bundle_payment_plans pp
   WHERE pp.bundle_reference = b.bundle_reference LIMIT 1
  ) AS payment_plan,

  -- Allocation schedule
  (SELECT json_agg(json_build_object(
      'leg',             pa.leg_reference,
      'payable_to',      pa.payable_company_name,
      'type',            pa.allocation_type,
      'amount',          pa.allocation_amount,
      'release_status',  pa.release_status,
      'released_at',     pa.released_at
    ))
   FROM public.bundle_payment_allocations pa WHERE pa.bundle_reference = b.bundle_reference
  ) AS payment_allocations,

  -- Cash-flow analysis
  (SELECT row_to_json(cf.*) FROM public.bundle_cashflow_analysis cf
   WHERE cf.bundle_reference = b.bundle_reference LIMIT 1
  ) AS cashflow_analysis,

  -- Financing simulations
  (SELECT json_agg(row_to_json(fs.*))
   FROM public.bundle_financing_simulations fs WHERE fs.bundle_reference = b.bundle_reference
  ) AS financing_simulations,

  -- Risk flags
  (SELECT json_agg(json_build_object(
      'flag_type',   rf.flag_type,
      'severity',    rf.severity,
      'description', rf.description,
      'is_resolved', rf.is_resolved,
      'created_at',  rf.created_at
    ))
   FROM public.bundle_risk_flags rf WHERE rf.bundle_reference = b.bundle_reference AND NOT rf.is_resolved
  ) AS active_risk_flags,

  -- Documents linked to any leg's secured job
  (SELECT json_agg(json_build_object(
      'document_name', d.file_name,
      'document_type', d.document_type,
      'job_reference', sj.job_reference,
      'leg_reference', sj.leg_reference,
      'uploaded_at',   d.created_at
    ))
   FROM public.documents d
   JOIN public.secured_jobs sj ON sj.job_reference = d.job_reference
   WHERE sj.bundle_reference = b.bundle_reference
  ) AS documents

FROM public.shipment_bundles b;
