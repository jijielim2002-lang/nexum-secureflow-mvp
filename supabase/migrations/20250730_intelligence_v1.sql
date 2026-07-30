-- ============================================================
-- Nexum Ontology & Intelligence Layer v1
-- Parts A–G: entities, ingestion, facts, signals, scores, actions, packs
-- ============================================================

-- ── PART A: Master Entity Registry ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nexum_entities (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text        NOT NULL CHECK (entity_type IN (
    'Company','Person','Document','Shipment','Shipment Leg','Trade Chain',
    'Trade Link','Payment Obligation','Wallet','Reserve','Invoice','Product',
    'Commodity','Port','Airport','Country','Risk Signal','Financing Opportunity','Other'
  )),
  source_table     text,
  source_id        text,
  canonical_name   text        NOT NULL,
  normalized_key   text,
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexum_entities_type        ON public.nexum_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_nexum_entities_source      ON public.nexum_entities(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_nexum_entities_norm_key    ON public.nexum_entities(normalized_key);

CREATE TABLE IF NOT EXISTS public.nexum_entity_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id   uuid        NOT NULL REFERENCES public.nexum_entities(id) ON DELETE CASCADE,
  to_entity_id     uuid        NOT NULL REFERENCES public.nexum_entities(id) ON DELETE CASCADE,
  link_type        text        NOT NULL CHECK (link_type IN (
    'Owns','Buys From','Sells To','Ships Through','Pays','Receives Payment From',
    'Provides Service To','Belongs To','Documents','Settles','Triggers',
    'Depends On','Finances','Insures','Other'
  )),
  confidence_score numeric     CHECK (confidence_score BETWEEN 0 AND 1),
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_links_from ON public.nexum_entity_links(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_to   ON public.nexum_entity_links(to_entity_id);

-- ── PART B: Data Ingestion Log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intelligence_ingestion_events (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module           text        NOT NULL CHECK (source_module IN (
    'Marketplace','SecureFlow','TradeFlow','Shipment Bundle','Trade Chain',
    'TradeCycle','Tracking Agent','Document Intelligence','Payment Ledger',
    'Manual Admin','Partner API','Other'
  )),
  source_reference        text,
  event_type              text        NOT NULL,
  raw_payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence   numeric     CHECK (extraction_confidence BETWEEN 0 AND 1),
  processing_status       text        NOT NULL CHECK (processing_status IN (
    'Received','Extracted','Normalized','Validated','Linked','Scored','Actioned','Failed','Needs Review'
  )) DEFAULT 'Received',
  error_message           text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_module    ON public.intelligence_ingestion_events(source_module);
CREATE INDEX IF NOT EXISTS idx_ingest_status    ON public.intelligence_ingestion_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_ingest_ref       ON public.intelligence_ingestion_events(source_reference);
CREATE INDEX IF NOT EXISTS idx_ingest_created   ON public.intelligence_ingestion_events(created_at DESC);

-- ── PART C: Normalized Trade Facts ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.normalized_trade_facts (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_type                       text        NOT NULL CHECK (fact_type IN (
    'Company Identity','Invoice Amount','Cargo Value','HS Code','Commodity',
    'Quantity','Weight','Volume','Incoterm','Payment Term','Due Date','BL Number',
    'AWB Number','Container Number','Port','Airport','Shipment Status','POD',
    'Payment Proof','Delivery Date','Receivable','Inventory','Other'
  )),
  source_module                   text        NOT NULL,
  source_reference                text,
  related_company_id              uuid        REFERENCES public.companies(id),
  related_trade_chain_reference   text,
  related_bundle_reference        text,
  related_job_reference           text,
  related_document_id             uuid,
  fact_value                      text,
  fact_value_numeric              numeric,
  currency                        text,
  confidence_score                numeric     CHECK (confidence_score BETWEEN 0 AND 1),
  verification_status             text        NOT NULL CHECK (verification_status IN (
    'System Extracted','Admin Reviewed','Provider Confirmed','Customer Confirmed','Mismatch','Rejected'
  )) DEFAULT 'System Extracted',
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facts_company    ON public.normalized_trade_facts(related_company_id);
CREATE INDEX IF NOT EXISTS idx_facts_type       ON public.normalized_trade_facts(fact_type);
CREATE INDEX IF NOT EXISTS idx_facts_bundle     ON public.normalized_trade_facts(related_bundle_reference);
CREATE INDEX IF NOT EXISTS idx_facts_job        ON public.normalized_trade_facts(related_job_reference);
CREATE INDEX IF NOT EXISTS idx_facts_chain      ON public.normalized_trade_facts(related_trade_chain_reference);

-- ── PART D: Risk Signals ─────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS intelligence_risk_signal_seq START 1;

CREATE OR REPLACE FUNCTION generate_risk_signal_reference()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'RSK-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('intelligence_risk_signal_seq')::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.intelligence_risk_signals (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_reference                text        UNIQUE NOT NULL DEFAULT generate_risk_signal_reference(),
  signal_type                     text        NOT NULL CHECK (signal_type IN (
    'Document Mismatch','Payment Overdue','Payment Late','POD Missing',
    'Shipment Delayed','Customs Hold','Provider No Response','Supplier Delay',
    'Customer Overextended','Funding Gap High','Cargo Value Abnormal','HS Code Risk',
    'FX Exposure','Buyer Concentration','Supplier Concentration','Margin Compression',
    'Inventory Stuck','Receivable Overdue','Other'
  )),
  severity                        text        NOT NULL CHECK (severity IN ('Low','Medium','High','Critical')) DEFAULT 'Medium',
  related_company_id              uuid        REFERENCES public.companies(id),
  related_trade_chain_reference   text,
  related_bundle_reference        text,
  related_job_reference           text,
  related_payment_obligation_id   uuid,
  related_document_id             uuid,
  description                     text,
  evidence                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status                          text        NOT NULL CHECK (status IN (
    'Open','In Review','Resolved','Waived','False Positive'
  )) DEFAULT 'Open',
  assigned_to                     uuid        REFERENCES auth.users(id),
  resolved_by                     uuid        REFERENCES auth.users(id),
  resolved_at                     timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_company    ON public.intelligence_risk_signals(related_company_id);
CREATE INDEX IF NOT EXISTS idx_signals_severity   ON public.intelligence_risk_signals(severity);
CREATE INDEX IF NOT EXISTS idx_signals_status     ON public.intelligence_risk_signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_type       ON public.intelligence_risk_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_bundle     ON public.intelligence_risk_signals(related_bundle_reference);
CREATE INDEX IF NOT EXISTS idx_signals_job        ON public.intelligence_risk_signals(related_job_reference);
CREATE INDEX IF NOT EXISTS idx_signals_chain      ON public.intelligence_risk_signals(related_trade_chain_reference);

-- ── PART E: Company Intelligence Scores ──────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS company_score_seq START 1;

CREATE OR REPLACE FUNCTION generate_score_reference()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'CIS-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('company_score_seq')::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.company_intelligence_scores (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid        NOT NULL REFERENCES public.companies(id),
  score_reference             text        UNIQUE NOT NULL DEFAULT generate_score_reference(),
  overall_score               numeric     CHECK (overall_score BETWEEN 0 AND 100),
  payment_behaviour_score     numeric     CHECK (payment_behaviour_score BETWEEN 0 AND 100),
  document_accuracy_score     numeric     CHECK (document_accuracy_score BETWEEN 0 AND 100),
  shipment_performance_score  numeric     CHECK (shipment_performance_score BETWEEN 0 AND 100),
  counterparty_quality_score  numeric     CHECK (counterparty_quality_score BETWEEN 0 AND 100),
  trade_consistency_score     numeric     CHECK (trade_consistency_score BETWEEN 0 AND 100),
  exception_rate_score        numeric     CHECK (exception_rate_score BETWEEN 0 AND 100),
  risk_level                  text        CHECK (risk_level IN ('Low','Medium','High','Critical')),
  financing_readiness         text        NOT NULL CHECK (financing_readiness IN (
    'Not Enough Data','Monitor','Potentially Eligible','Ready for Review','Approved Internally','Rejected'
  )) DEFAULT 'Not Enough Data',
  recommended_limit           numeric,
  currency                    text        DEFAULT 'MYR',
  score_reason                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  calculated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scores_company     ON public.company_intelligence_scores(company_id);
CREATE INDEX IF NOT EXISTS idx_scores_overall     ON public.company_intelligence_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_scores_readiness   ON public.company_intelligence_scores(financing_readiness);
CREATE INDEX IF NOT EXISTS idx_scores_calculated  ON public.company_intelligence_scores(calculated_at DESC);

-- Scoring computation function
CREATE OR REPLACE FUNCTION compute_company_intelligence_score(p_company_id uuid)
RETURNS uuid SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_payment_score       numeric := 50;
  v_doc_score           numeric := 50;
  v_shipment_score      numeric := 50;
  v_counterparty_score  numeric := 50;
  v_consistency_score   numeric := 50;
  v_exception_score     numeric := 50;
  v_overall             numeric;
  v_risk_level          text;
  v_readiness           text;
  v_recommended_limit   numeric := 0;
  v_reason              jsonb;
  v_score_id            uuid;

  -- Payment behaviour from vendor_credit_terms
  v_total_payments    integer := 0;
  v_on_time           integer := 0;
  v_late              integer := 0;
  v_disputed          integer := 0;

  -- Document accuracy from normalized_trade_facts
  v_total_facts       integer := 0;
  v_confirmed_facts   integer := 0;
  v_mismatch_facts    integer := 0;

  -- Risk signals
  v_open_critical     integer := 0;
  v_open_high         integer := 0;
  v_total_signals     integer := 0;

  -- Job/bundle volume
  v_total_jobs        integer := 0;
BEGIN
  -- 1. Payment Behaviour (30%)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE payment_status IN ('Paid On Time')),
    COUNT(*) FILTER (WHERE payment_status IN ('Paid Late')),
    COUNT(*) FILTER (WHERE payment_status IN ('Disputed'))
  INTO v_total_payments, v_on_time, v_late, v_disputed
  FROM public.vendor_credit_terms
  WHERE buyer_company_id = p_company_id
    AND payment_status IN ('Paid On Time','Paid Late','Disputed');

  IF v_total_payments > 0 THEN
    v_payment_score := ROUND(
      (v_on_time::numeric / v_total_payments * 100)
      - (v_late::numeric / v_total_payments * 30)
      - (v_disputed::numeric / v_total_payments * 50)
    );
    v_payment_score := GREATEST(0, LEAST(100, v_payment_score));
  END IF;

  -- 2. Document Accuracy (20%)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE verification_status IN ('Admin Reviewed','Provider Confirmed','Customer Confirmed')),
    COUNT(*) FILTER (WHERE verification_status = 'Mismatch')
  INTO v_total_facts, v_confirmed_facts, v_mismatch_facts
  FROM public.normalized_trade_facts
  WHERE related_company_id = p_company_id;

  IF v_total_facts > 0 THEN
    v_doc_score := ROUND(
      (v_confirmed_facts::numeric / v_total_facts * 100)
      - (v_mismatch_facts::numeric / v_total_facts * 40)
    );
    v_doc_score := GREATEST(0, LEAST(100, v_doc_score));
  END IF;

  -- 3. Shipment Performance (20%) — penalise open shipment delay signals
  SELECT COUNT(*) INTO v_total_signals
  FROM public.intelligence_risk_signals
  WHERE related_company_id = p_company_id
    AND signal_type IN ('Shipment Delayed','POD Missing','Customs Hold','Provider No Response')
    AND status = 'Open';

  v_shipment_score := GREATEST(0, 100 - (v_total_signals * 15));

  -- 4. Counterparty Quality (10%) — based on entity link confidence
  SELECT COALESCE(AVG(confidence_score) * 100, 50)
  INTO v_counterparty_score
  FROM public.nexum_entity_links nel
  JOIN public.nexum_entities ne ON ne.id = nel.from_entity_id
  WHERE ne.source_table = 'companies' AND ne.source_id = p_company_id::text;

  v_counterparty_score := GREATEST(0, LEAST(100, COALESCE(v_counterparty_score, 50)));

  -- 5. Trade Volume Consistency (10%)
  SELECT COUNT(*) INTO v_total_jobs
  FROM public.secured_jobs
  WHERE customer_company_id = p_company_id
    AND job_status = 'Completed';

  v_consistency_score := LEAST(100, 50 + (v_total_jobs * 5));

  -- 6. Exception Rate (10%) — open critical/high signals
  SELECT
    COUNT(*) FILTER (WHERE severity = 'Critical'),
    COUNT(*) FILTER (WHERE severity = 'High')
  INTO v_open_critical, v_open_high
  FROM public.intelligence_risk_signals
  WHERE related_company_id = p_company_id AND status = 'Open';

  v_exception_score := GREATEST(0, 100 - (v_open_critical * 25) - (v_open_high * 10));

  -- Weighted overall score
  v_overall := ROUND(
    v_payment_score     * 0.30 +
    v_doc_score         * 0.20 +
    v_shipment_score    * 0.20 +
    v_counterparty_score* 0.10 +
    v_consistency_score * 0.10 +
    v_exception_score   * 0.10,
    1
  );

  -- Risk level
  v_risk_level := CASE
    WHEN v_overall >= 80 THEN 'Low'
    WHEN v_overall >= 60 THEN 'Medium'
    WHEN v_overall >= 40 THEN 'High'
    ELSE 'Critical'
  END;

  -- Financing readiness
  v_readiness := CASE
    WHEN v_total_payments = 0 AND v_total_jobs < 3 THEN 'Not Enough Data'
    WHEN v_overall >= 75 AND v_open_critical = 0    THEN 'Ready for Review'
    WHEN v_overall >= 60                            THEN 'Potentially Eligible'
    WHEN v_overall >= 40                            THEN 'Monitor'
    ELSE 'Not Enough Data'
  END;

  -- Recommended limit: approx 3× total completed trade value
  SELECT COALESCE(SUM(job_value) * 3, 0)
  INTO v_recommended_limit
  FROM public.secured_jobs
  WHERE customer_company_id = p_company_id AND job_status = 'Completed';

  v_reason := jsonb_build_object(
    'payment_payments',        v_total_payments,
    'payment_on_time',         v_on_time,
    'payment_late',            v_late,
    'payment_disputed',        v_disputed,
    'doc_total_facts',         v_total_facts,
    'doc_confirmed',           v_confirmed_facts,
    'doc_mismatch',            v_mismatch_facts,
    'shipment_delay_signals',  v_total_signals,
    'completed_jobs',          v_total_jobs,
    'open_critical_signals',   v_open_critical,
    'open_high_signals',       v_open_high
  );

  INSERT INTO public.company_intelligence_scores (
    company_id, overall_score, payment_behaviour_score, document_accuracy_score,
    shipment_performance_score, counterparty_quality_score, trade_consistency_score,
    exception_rate_score, risk_level, financing_readiness, recommended_limit, score_reason
  ) VALUES (
    p_company_id, v_overall, v_payment_score, v_doc_score,
    v_shipment_score, v_counterparty_score, v_consistency_score,
    v_exception_score, v_risk_level, v_readiness, v_recommended_limit, v_reason
  ) RETURNING id INTO v_score_id;

  RETURN v_score_id;
END;
$$;

-- ── PART F: Recommended Action Engine ────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS intelligence_action_seq START 1;

CREATE OR REPLACE FUNCTION generate_action_reference()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'ACT-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('intelligence_action_seq')::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.intelligence_recommended_actions (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_reference                text        UNIQUE NOT NULL DEFAULT generate_action_reference(),
  action_type                     text        NOT NULL CHECK (action_type IN (
    'Request Document','Hold Payment Release','Approve Release Review',
    'Send Payment Reminder','Send Provider Reminder','Flag Admin Review',
    'Recommend Financing Simulation','Reduce Trade Capacity','Increase Trade Capacity',
    'Update Provider Rating','Update Company Score','Create Evidence Pack','Other'
  )),
  priority                        text        NOT NULL CHECK (priority IN ('Low','Medium','High','Critical')) DEFAULT 'Medium',
  related_company_id              uuid        REFERENCES public.companies(id),
  related_trade_chain_reference   text,
  related_bundle_reference        text,
  related_job_reference           text,
  related_signal_reference        text,
  action_reason                   text,
  action_status                   text        NOT NULL CHECK (action_status IN (
    'Pending','Accepted','Rejected','Completed','Cancelled'
  )) DEFAULT 'Pending',
  assigned_to                     uuid        REFERENCES auth.users(id),
  completed_by                    uuid        REFERENCES auth.users(id),
  completed_at                    timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actions_company    ON public.intelligence_recommended_actions(related_company_id);
CREATE INDEX IF NOT EXISTS idx_actions_status     ON public.intelligence_recommended_actions(action_status);
CREATE INDEX IF NOT EXISTS idx_actions_priority   ON public.intelligence_recommended_actions(priority);
CREATE INDEX IF NOT EXISTS idx_actions_signal     ON public.intelligence_recommended_actions(related_signal_reference);

-- ── PART G: Evidence Pack Registry ───────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS evidence_pack_seq START 1;

CREATE OR REPLACE FUNCTION generate_evidence_pack_reference()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'EVP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('evidence_pack_seq')::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.evidence_packs (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_pack_reference         text        UNIQUE NOT NULL DEFAULT generate_evidence_pack_reference(),
  pack_type                       text        NOT NULL CHECK (pack_type IN (
    'Company Credit Report','Shipment Bundle Report','Trade Chain Report',
    'Financing Review Pack','Provider Performance Report',
    'Customer Payment Behaviour Report','Other'
  )),
  related_company_id              uuid        REFERENCES public.companies(id),
  related_trade_chain_reference   text,
  related_bundle_reference        text,
  related_job_reference           text,
  generated_by                    uuid        REFERENCES auth.users(id),
  report_status                   text        NOT NULL CHECK (report_status IN (
    'Draft','Generated','Reviewed','Shared','Archived'
  )) DEFAULT 'Draft',
  report_data                     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packs_company  ON public.evidence_packs(related_company_id);
CREATE INDEX IF NOT EXISTS idx_packs_status   ON public.evidence_packs(report_status);
CREATE INDEX IF NOT EXISTS idx_packs_type     ON public.evidence_packs(pack_type);

-- ── Updated_at trigger helper ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION intel_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_entities_updated_at ON public.nexum_entities;
CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON public.nexum_entities
  FOR EACH ROW EXECUTE FUNCTION intel_set_updated_at();

-- ── Intelligence Access Log ───────────────────────────────────────────────────
-- (Part J: every sensitive view must create access log)

CREATE TABLE IF NOT EXISTS public.intelligence_access_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id    uuid        REFERENCES auth.users(id),
  target_type  text        NOT NULL,
  target_id    text        NOT NULL,
  access_type  text        NOT NULL,
  ip_hint      text,
  accessed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_log_viewer ON public.intelligence_access_log(viewer_id);
CREATE INDEX IF NOT EXISTS idx_access_log_target ON public.intelligence_access_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_access_log_time   ON public.intelligence_access_log(accessed_at DESC);

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE public.nexum_entities                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexum_entity_links                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_ingestion_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_trade_facts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_risk_signals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_intelligence_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_recommended_actions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_packs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_access_log           ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent re-run safety)
DROP POLICY IF EXISTS "admin_all_entities"           ON public.nexum_entities;
DROP POLICY IF EXISTS "admin_all_entity_links"       ON public.nexum_entity_links;
DROP POLICY IF EXISTS "admin_all_ingestion"          ON public.intelligence_ingestion_events;
DROP POLICY IF EXISTS "admin_all_trade_facts"        ON public.normalized_trade_facts;
DROP POLICY IF EXISTS "admin_all_risk_signals"       ON public.intelligence_risk_signals;
DROP POLICY IF EXISTS "admin_all_scores"             ON public.company_intelligence_scores;
DROP POLICY IF EXISTS "admin_all_actions"            ON public.intelligence_recommended_actions;
DROP POLICY IF EXISTS "admin_all_evidence_packs"     ON public.evidence_packs;
DROP POLICY IF EXISTS "admin_all_access_log"         ON public.intelligence_access_log;
DROP POLICY IF EXISTS "company_own_trade_facts"      ON public.normalized_trade_facts;
DROP POLICY IF EXISTS "company_own_risk_signals"     ON public.intelligence_risk_signals;
DROP POLICY IF EXISTS "company_own_scores"           ON public.company_intelligence_scores;
DROP POLICY IF EXISTS "company_own_actions"          ON public.intelligence_recommended_actions;
DROP POLICY IF EXISTS "company_own_evidence_packs"   ON public.evidence_packs;
DROP POLICY IF EXISTS "company_own_entities"         ON public.nexum_entities;
DROP POLICY IF EXISTS "company_write_access_log"     ON public.intelligence_access_log;
DROP POLICY IF EXISTS "company_own_access_log"       ON public.intelligence_access_log;

-- Admin sees everything
CREATE POLICY "admin_all_entities"
  ON public.nexum_entities FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_entity_links"
  ON public.nexum_entity_links FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_ingestion"
  ON public.intelligence_ingestion_events FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_trade_facts"
  ON public.normalized_trade_facts FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_risk_signals"
  ON public.intelligence_risk_signals FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_scores"
  ON public.company_intelligence_scores FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_actions"
  ON public.intelligence_recommended_actions FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_evidence_packs"
  ON public.evidence_packs FOR ALL
  USING (nexum_is_admin());

CREATE POLICY "admin_all_access_log"
  ON public.intelligence_access_log FOR ALL
  USING (nexum_is_admin());

-- Company sees own data only
CREATE POLICY "company_own_trade_facts"
  ON public.normalized_trade_facts FOR SELECT
  USING (related_company_id = nexum_my_company_id());

CREATE POLICY "company_own_risk_signals"
  ON public.intelligence_risk_signals FOR SELECT
  USING (related_company_id = nexum_my_company_id());

CREATE POLICY "company_own_scores"
  ON public.company_intelligence_scores FOR SELECT
  USING (company_id = nexum_my_company_id());

CREATE POLICY "company_own_actions"
  ON public.intelligence_recommended_actions FOR SELECT
  USING (related_company_id = nexum_my_company_id());

CREATE POLICY "company_own_evidence_packs"
  ON public.evidence_packs FOR SELECT
  USING (related_company_id = nexum_my_company_id());

-- Company can see entities linked to their company
CREATE POLICY "company_own_entities"
  ON public.nexum_entities FOR SELECT
  USING (
    source_table = 'companies' AND source_id = (nexum_my_company_id())::text
    OR id IN (
      SELECT to_entity_id FROM public.nexum_entity_links nel
      JOIN public.nexum_entities ne ON ne.id = nel.from_entity_id
      WHERE ne.source_table = 'companies' AND ne.source_id = (nexum_my_company_id())::text
    )
  );

-- Company can write access log for own views
CREATE POLICY "company_write_access_log"
  ON public.intelligence_access_log FOR INSERT
  WITH CHECK (viewer_id = auth.uid());

CREATE POLICY "company_own_access_log"
  ON public.intelligence_access_log FOR SELECT
  USING (viewer_id = auth.uid());
