-- ═══════════════════════════════════════════════════════════════════════════
-- Nexum Trade Chain Network v1
-- Sits ABOVE Shipment Bundles and SecureFlow Jobs.
-- Run AFTER: orchestration_v1 migration
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Reference generator ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_trade_chain_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE ref text; dup boolean;
BEGIN
  LOOP
    ref := 'TCN-' || to_char(now(),'YYYYMMDD') || '-' || upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.trade_chains WHERE trade_chain_reference = ref) INTO dup;
    EXIT WHEN NOT dup;
  END LOOP; RETURN ref;
END; $$;

-- ── Part A: trade_chains ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chains (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference   text        UNIQUE NOT NULL DEFAULT public.generate_trade_chain_reference(),
  chain_title             text,
  chain_type              text        CHECK (chain_type IN (
    'Import to Retail','Export Chain','Domestic Distribution',
    'Factory to Retail','Marketplace Trade','Other'
  )) DEFAULT 'Import to Retail',
  anchor_company_id       uuid        REFERENCES public.companies(id),
  created_by              uuid        REFERENCES auth.users(id),
  commodity_category      text,
  product_description     text,
  hs_code                 text,
  origin_country          text,
  destination_country     text,
  total_trade_value       numeric     DEFAULT 0,
  currency                text        DEFAULT 'MYR',
  chain_status            text        CHECK (chain_status IN (
    'Draft','Active','In Progress','Completed','Disputed','Suspended','Cancelled'
  )) DEFAULT 'Draft',
  overall_risk_level      text        CHECK (overall_risk_level IN ('Low','Medium','High','Critical')),
  financing_readiness     text        CHECK (financing_readiness IN (
    'Not Assessed','Partially Ready','Ready','Requires Review'
  )) DEFAULT 'Not Assessed',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_chains_reference    ON public.trade_chains (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_trade_chains_anchor       ON public.trade_chains (anchor_company_id);
CREATE INDEX IF NOT EXISTS idx_trade_chains_status       ON public.trade_chains (chain_status);

-- ── Part B: trade_chain_nodes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chain_nodes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference text        NOT NULL REFERENCES public.trade_chains(trade_chain_reference) ON DELETE CASCADE,
  company_id            uuid        REFERENCES public.companies(id),
  company_name          text,       -- allow unregistered parties
  node_role             text        NOT NULL CHECK (node_role IN (
    'Factory','Supplier','Exporter','Freight Forwarder','Customs Broker','Transporter',
    'Importer','Trader','Distributor','Wholesaler','Retailer','End Buyer',
    'Finance Partner','Remittance Partner','Insurance Partner','Other'
  )),
  node_sequence         integer,
  country               text,
  visibility_level      text        CHECK (visibility_level IN ('Full','Masked','Hidden')) DEFAULT 'Masked',
  node_status           text        CHECK (node_status IN (
    'Pending','Active','Completed','Blocked','Removed'
  )) DEFAULT 'Pending',
  risk_score            numeric,
  credit_score          numeric,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcn_nodes_chain     ON public.trade_chain_nodes (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_tcn_nodes_company   ON public.trade_chain_nodes (company_id);

-- ── Part C: trade_chain_links ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chain_links (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference   text        NOT NULL REFERENCES public.trade_chains(trade_chain_reference) ON DELETE CASCADE,
  from_node_id            uuid        REFERENCES public.trade_chain_nodes(id),
  to_node_id              uuid        REFERENCES public.trade_chain_nodes(id),
  link_type               text        CHECK (link_type IN (
    'Goods Sale','Logistics Service','Customs Service','Payment Obligation',
    'Document Obligation','Inventory Transfer','Receivable','Financing','Other'
  )),
  invoice_reference       text,
  payment_terms           text,
  trade_amount            numeric     DEFAULT 0,
  currency                text        DEFAULT 'MYR',
  expected_payment_date   date,
  actual_payment_date     date,
  expected_delivery_date  date,
  actual_delivery_date    date,
  link_status             text        CHECK (link_status IN (
    'Draft','Pending','Active','Completed','Overdue','Disputed','Cancelled'
  )) DEFAULT 'Draft',
  risk_level              text        CHECK (risk_level IN ('Low','Medium','High','Critical')),
  chain_link_id           uuid,       -- self-ref for sub-links
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcn_links_chain     ON public.trade_chain_links (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_tcn_links_from      ON public.trade_chain_links (from_node_id);
CREATE INDEX IF NOT EXISTS idx_tcn_links_to        ON public.trade_chain_links (to_node_id);

-- ── Part D: Extend shipment_bundles + secured_jobs ─────────────────────────

ALTER TABLE public.shipment_bundles
  ADD COLUMN IF NOT EXISTS trade_chain_reference text,
  ADD COLUMN IF NOT EXISTS chain_node_from       uuid,
  ADD COLUMN IF NOT EXISTS chain_node_to         uuid;

ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS trade_chain_reference text,
  ADD COLUMN IF NOT EXISTS chain_link_id         uuid,
  ADD COLUMN IF NOT EXISTS chain_node_from       uuid,
  ADD COLUMN IF NOT EXISTS chain_node_to         uuid;

CREATE INDEX IF NOT EXISTS idx_bundles_trade_chain   ON public.shipment_bundles (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_jobs_trade_chain      ON public.secured_jobs (trade_chain_reference);

-- ── Part E: extend documents to support all reference types ───────────────

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS bundle_reference      text,
  ADD COLUMN IF NOT EXISTS tradeflow_reference   text,
  ADD COLUMN IF NOT EXISTS trade_chain_reference text,
  ADD COLUMN IF NOT EXISTS chain_link_id         uuid,
  ADD COLUMN IF NOT EXISTS document_type_v2      text CHECK (document_type_v2 IN (
    'Proforma Invoice','Commercial Invoice','Packing List','Bill of Lading','Air Waybill',
    'Delivery Order','Kastam Form','Purchase Order','Sales Invoice','Payment Slip',
    'Receipt','POD','Inventory List','Debtor Aging','Creditor Aging',
    'Insurance','Permit','Other'
  ));

CREATE INDEX IF NOT EXISTS idx_documents_bundle_ref ON public.documents (bundle_reference);
CREATE INDEX IF NOT EXISTS idx_documents_chain_ref  ON public.documents (trade_chain_reference);

-- ── Part F: inventory positions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chain_inventory_positions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference text        NOT NULL REFERENCES public.trade_chains(trade_chain_reference) ON DELETE CASCADE,
  company_id            uuid        REFERENCES public.companies(id),
  product_description   text,
  quantity              numeric     DEFAULT 0,
  unit                  text        DEFAULT 'unit',
  inventory_value       numeric     DEFAULT 0,
  currency              text        DEFAULT 'MYR',
  location              text,
  received_at           date,
  sold_at               date,
  inventory_status      text        CHECK (inventory_status IN (
    'Ordered','In Transit','Arrived','In Warehouse','Partially Sold','Sold','Damaged','Missing'
  )) DEFAULT 'Ordered',
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcn_inv_chain      ON public.trade_chain_inventory_positions (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_tcn_inv_company    ON public.trade_chain_inventory_positions (company_id);

-- ── Part F: receivables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chain_receivables (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference text        NOT NULL REFERENCES public.trade_chains(trade_chain_reference) ON DELETE CASCADE,
  seller_company_id     uuid        REFERENCES public.companies(id),
  buyer_company_id      uuid        REFERENCES public.companies(id),
  invoice_reference     text,
  invoice_amount        numeric     DEFAULT 0,
  currency              text        DEFAULT 'MYR',
  invoice_date          date,
  due_date              date,
  paid_date             date,
  payment_status        text        CHECK (payment_status IN (
    'Unpaid','Partially Paid','Paid','Overdue','Disputed','Written Off'
  )) DEFAULT 'Unpaid',
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcn_recv_chain     ON public.trade_chain_receivables (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_tcn_recv_seller    ON public.trade_chain_receivables (seller_company_id);
CREATE INDEX IF NOT EXISTS idx_tcn_recv_buyer     ON public.trade_chain_receivables (buyer_company_id);

-- ── Part G: cash-flow gap analysis per node ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chain_cashflow_analysis (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference       text        NOT NULL REFERENCES public.trade_chains(trade_chain_reference) ON DELETE CASCADE,
  company_id                  uuid        REFERENCES public.companies(id),
  company_role                text,
  cash_out_amount             numeric     DEFAULT 0,
  cash_out_date               date,
  cash_in_amount              numeric     DEFAULT 0,
  cash_in_date                date,
  funding_gap_amount          numeric     DEFAULT 0,
  funding_gap_days            integer     DEFAULT 0,
  gap_reason                  text,
  recommended_financing_product text,
  risk_level                  text        CHECK (risk_level IN ('Low','Medium','High','Critical')),
  created_at                  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcn_cf_chain       ON public.trade_chain_cashflow_analysis (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_tcn_cf_company     ON public.trade_chain_cashflow_analysis (company_id);

-- ── Part H: financing opportunities ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chain_financing_opportunities (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference text        NOT NULL REFERENCES public.trade_chains(trade_chain_reference) ON DELETE CASCADE,
  company_id            uuid        REFERENCES public.companies(id),
  opportunity_type      text        CHECK (opportunity_type IN (
    'Supplier Deposit Protection','Supplier Balance Financing','Shipment Working Capital',
    'Duty Tax Financing','Logistics Fee Financing','Inventory Financing',
    'Invoice Financing','Receivable Financing','Distributor Working Capital',
    'Retailer Stock Financing','Payout Acceleration','Other'
  )),
  recommended_amount    numeric     DEFAULT 0,
  currency              text        DEFAULT 'MYR',
  tenor_days            integer     DEFAULT 30,
  repayment_source      text,
  eligibility_status    text        CHECK (eligibility_status IN (
    'Simulation Only','Potentially Eligible','Requires Review','Not Suitable'
  )) DEFAULT 'Simulation Only',
  reason                text,
  simulation_note       text        DEFAULT 'Simulation only — subject to credit review and documentation.',
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcn_fin_chain      ON public.trade_chain_financing_opportunities (trade_chain_reference);
CREATE INDEX IF NOT EXISTS idx_tcn_fin_company    ON public.trade_chain_financing_opportunities (company_id);

-- ── Part I: risk flags ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trade_chain_risk_flags (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_chain_reference text        NOT NULL REFERENCES public.trade_chains(trade_chain_reference) ON DELETE CASCADE,
  node_id               uuid        REFERENCES public.trade_chain_nodes(id),
  link_id               uuid        REFERENCES public.trade_chain_links(id),
  flag_type             text        NOT NULL CHECK (flag_type IN (
    'Supplier Delay','Shipment Delay','Customs Hold','Document Mismatch',
    'Payment Delay','Inventory Stuck','Receivable Overdue','Buyer Concentration',
    'Supplier Concentration','Margin Compression','FX Exposure','Funding Gap High',
    'Downstream Demand Weak','Retail Sell-through Slow'
  )),
  severity              text        CHECK (severity IN ('Low','Medium','High','Critical')) DEFAULT 'Medium',
  description           text,
  is_resolved           boolean     DEFAULT false,
  resolved_at           timestamptz,
  resolved_by           uuid        REFERENCES auth.users(id),
  resolution_note       text,
  raised_by             uuid        REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcn_risk_chain     ON public.trade_chain_risk_flags (trade_chain_reference);

-- ── Part M: evidence pack VIEW ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.trade_chain_evidence_pack AS
SELECT
  tc.*,
  (SELECT json_agg(row_to_json(n.*) ORDER BY n.node_sequence)
     FROM public.trade_chain_nodes n
     WHERE n.trade_chain_reference = tc.trade_chain_reference
  ) AS nodes,
  (SELECT json_agg(row_to_json(l.*))
     FROM public.trade_chain_links l
     WHERE l.trade_chain_reference = tc.trade_chain_reference
  ) AS links,
  (SELECT json_agg(row_to_json(sb.*))
     FROM public.shipment_bundles sb
     WHERE sb.trade_chain_reference = tc.trade_chain_reference
  ) AS shipment_bundles,
  (SELECT json_agg(row_to_json(ip.*))
     FROM public.trade_chain_inventory_positions ip
     WHERE ip.trade_chain_reference = tc.trade_chain_reference
  ) AS inventory_positions,
  (SELECT json_agg(row_to_json(r.*))
     FROM public.trade_chain_receivables r
     WHERE r.trade_chain_reference = tc.trade_chain_reference
  ) AS receivables,
  (SELECT json_agg(row_to_json(cf.*))
     FROM public.trade_chain_cashflow_analysis cf
     WHERE cf.trade_chain_reference = tc.trade_chain_reference
  ) AS cashflow_gaps,
  (SELECT json_agg(row_to_json(fo.*))
     FROM public.trade_chain_financing_opportunities fo
     WHERE fo.trade_chain_reference = tc.trade_chain_reference
  ) AS financing_opportunities,
  (SELECT json_agg(row_to_json(rf.*))
     FROM public.trade_chain_risk_flags rf
     WHERE rf.trade_chain_reference = tc.trade_chain_reference AND rf.is_resolved = false
  ) AS active_risk_flags,
  (SELECT json_agg(row_to_json(d.*))
     FROM public.documents d
     WHERE d.trade_chain_reference = tc.trade_chain_reference
  ) AS documents
FROM public.trade_chains tc;

-- ── Helper function: check if user is chain participant ────────────────────

CREATE OR REPLACE FUNCTION public.nexum_chain_participant(p_ref text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trade_chain_nodes n
    JOIN public.companies c ON c.id = n.company_id
    JOIN public.profiles p  ON p.company_id = c.id
    WHERE n.trade_chain_reference = p_ref
      AND p.id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.trade_chains tc
    WHERE tc.trade_chain_reference = p_ref
      AND tc.created_by = auth.uid()
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.trade_chains                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_nodes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_links                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_inventory_positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_receivables          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_cashflow_analysis    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_financing_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_risk_flags           ENABLE ROW LEVEL SECURITY;

-- trade_chains
DROP POLICY IF EXISTS "tc_select" ON public.trade_chains;
CREATE POLICY "tc_select" ON public.trade_chains FOR SELECT USING (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);
DROP POLICY IF EXISTS "tc_insert" ON public.trade_chains;
CREATE POLICY "tc_insert" ON public.trade_chains FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "tc_update" ON public.trade_chains;
CREATE POLICY "tc_update" ON public.trade_chains FOR UPDATE USING (
  nexum_is_admin() OR created_by = auth.uid()
    OR anchor_company_id = nexum_my_company_id()
);

-- trade_chain_nodes
DROP POLICY IF EXISTS "tcn_select" ON public.trade_chain_nodes;
CREATE POLICY "tcn_select" ON public.trade_chain_nodes FOR SELECT USING (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);
DROP POLICY IF EXISTS "tcn_insert" ON public.trade_chain_nodes;
CREATE POLICY "tcn_insert" ON public.trade_chain_nodes FOR INSERT WITH CHECK (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);
DROP POLICY IF EXISTS "tcn_update" ON public.trade_chain_nodes;
CREATE POLICY "tcn_update" ON public.trade_chain_nodes FOR UPDATE USING (
  nexum_is_admin() OR company_id = nexum_my_company_id()
);

-- trade_chain_links
DROP POLICY IF EXISTS "tcl_select" ON public.trade_chain_links;
CREATE POLICY "tcl_select" ON public.trade_chain_links FOR SELECT USING (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);
DROP POLICY IF EXISTS "tcl_insert" ON public.trade_chain_links;
CREATE POLICY "tcl_insert" ON public.trade_chain_links FOR INSERT WITH CHECK (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);
DROP POLICY IF EXISTS "tcl_update" ON public.trade_chain_links;
CREATE POLICY "tcl_update" ON public.trade_chain_links FOR UPDATE USING (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);

-- inventory positions
DROP POLICY IF EXISTS "tcip_select" ON public.trade_chain_inventory_positions;
CREATE POLICY "tcip_select" ON public.trade_chain_inventory_positions FOR SELECT USING (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);
DROP POLICY IF EXISTS "tcip_insert" ON public.trade_chain_inventory_positions;
CREATE POLICY "tcip_insert" ON public.trade_chain_inventory_positions FOR INSERT WITH CHECK (
  nexum_is_admin() OR company_id = nexum_my_company_id()
);

-- receivables
DROP POLICY IF EXISTS "tcr_select" ON public.trade_chain_receivables;
CREATE POLICY "tcr_select" ON public.trade_chain_receivables FOR SELECT USING (
  nexum_is_admin()
  OR seller_company_id = nexum_my_company_id()
  OR buyer_company_id  = nexum_my_company_id()
);
DROP POLICY IF EXISTS "tcr_insert" ON public.trade_chain_receivables;
CREATE POLICY "tcr_insert" ON public.trade_chain_receivables FOR INSERT WITH CHECK (
  nexum_is_admin() OR seller_company_id = nexum_my_company_id()
);

-- cashflow analysis
DROP POLICY IF EXISTS "tccf_select" ON public.trade_chain_cashflow_analysis;
CREATE POLICY "tccf_select" ON public.trade_chain_cashflow_analysis FOR SELECT USING (
  nexum_is_admin()
  OR company_id = nexum_my_company_id()
);
DROP POLICY IF EXISTS "tccf_insert" ON public.trade_chain_cashflow_analysis;
CREATE POLICY "tccf_insert" ON public.trade_chain_cashflow_analysis FOR INSERT WITH CHECK (
  nexum_is_admin() OR company_id = nexum_my_company_id()
);

-- financing opportunities
DROP POLICY IF EXISTS "tcfo_select" ON public.trade_chain_financing_opportunities;
CREATE POLICY "tcfo_select" ON public.trade_chain_financing_opportunities FOR SELECT USING (
  nexum_is_admin()
  OR company_id = nexum_my_company_id()
);
DROP POLICY IF EXISTS "tcfo_insert" ON public.trade_chain_financing_opportunities;
CREATE POLICY "tcfo_insert" ON public.trade_chain_financing_opportunities FOR INSERT WITH CHECK (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);

-- risk flags
DROP POLICY IF EXISTS "tcrf_select" ON public.trade_chain_risk_flags;
CREATE POLICY "tcrf_select" ON public.trade_chain_risk_flags FOR SELECT USING (
  nexum_is_admin() OR nexum_chain_participant(trade_chain_reference)
);
DROP POLICY IF EXISTS "tcrf_insert" ON public.trade_chain_risk_flags;
CREATE POLICY "tcrf_insert" ON public.trade_chain_risk_flags FOR INSERT WITH CHECK (nexum_is_admin());
DROP POLICY IF EXISTS "tcrf_update" ON public.trade_chain_risk_flags;
CREATE POLICY "tcrf_update" ON public.trade_chain_risk_flags FOR UPDATE USING (nexum_is_admin());
