-- ─── Procurement Order Control v1 ─────────────────────────────────────────────
-- Procurement order layer linking buyer purchase intent, supplier quotation/PI,
-- purchase order, supplier acceptance, SPP, shipment documents, and release.
-- NOT a legal contract. NOT credit approval. NOT escrow guarantee.
-- Procurement order control and document verification workflow only.

-- ── Table: procurement_orders ──────────────────────────────────────────────────

create table if not exists public.procurement_orders (
  id                        uuid        primary key default gen_random_uuid(),
  procurement_reference     text        unique not null,
  job_reference             text,
  buyer_company_id          uuid        references public.companies(id) on delete set null,
  supplier_id               uuid        references public.supplier_counterparties(id) on delete set null,
  supplier_name             text,
  supplier_country          text,
  procurement_status        text        check (procurement_status in (
    'Draft',
    'Pending Supplier Quotation',
    'Quotation Received',
    'PO Issued',
    'Supplier Accepted',
    'Advance Payment Required',
    'Advance Secured',
    'In Production',
    'Ready for Inspection',
    'Ready for Shipment',
    'Shipped',
    'Delivered',
    'Completed',
    'Disputed',
    'Cancelled'
  )) default 'Draft',
  goods_description         text,
  commodity_category        text,
  hs_code                   text,
  hs_code_description       text,
  incoterm                  text,
  order_value_amount        numeric,
  order_value_currency      text        default 'USD',
  advance_required_amount   numeric,
  advance_currency          text        default 'USD',
  advance_percentage        numeric,
  balance_amount            numeric,
  balance_currency          text        default 'USD',
  expected_production_days  integer,
  expected_ready_date       date,
  expected_ship_date        date,
  expected_delivery_date    date,
  supplier_payment_terms    text,
  buyer_po_number           text,
  supplier_pi_number        text,
  supplier_invoice_number   text,
  required_documents        jsonb,      -- list of expected document types
  quality_requirement       text,
  inspection_required       boolean     default false,
  -- Linkage
  linked_spp_id             uuid,       -- supplier_payment_protections.id (soft link, no FK to avoid circular)
  linked_spp_reference      text,       -- human-readable SPP reference
  -- Admin tracking
  discrepancy_flagged       boolean     default false,
  discrepancy_notes         text,
  discrepancy_flagged_by    uuid        references auth.users(id),
  discrepancy_flagged_at    timestamptz,
  admin_remarks             text,
  -- Metadata
  remarks                   text,
  created_by                uuid        references auth.users(id),
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

create index if not exists po_buyer_company_idx  on public.procurement_orders (buyer_company_id);
create index if not exists po_supplier_idx        on public.procurement_orders (supplier_id);
create index if not exists po_job_reference_idx   on public.procurement_orders (job_reference);
create index if not exists po_status_idx          on public.procurement_orders (procurement_status);

-- ── Table: procurement_order_documents ────────────────────────────────────────

create table if not exists public.procurement_order_documents (
  id                     uuid        primary key default gen_random_uuid(),
  procurement_reference  text        not null references public.procurement_orders(procurement_reference) on delete cascade,
  job_reference          text,
  document_id            uuid        references public.documents(id) on delete set null,
  document_type          text        check (document_type in (
    'Supplier Quotation',
    'Proforma Invoice',
    'Purchase Order',
    'Supplier Acceptance',
    'Commercial Invoice',
    'Packing List',
    'Inspection Report',
    'Production Photo',
    'Bill of Lading',
    'Airway Bill',
    'Payment Proof',
    'Other'
  )),
  verification_status    text        check (verification_status in (
    'Pending',
    'Verified',
    'Rejected',
    'Needs Review'
  )) default 'Pending',
  uploaded_by_role       text,
  uploaded_by_user_id    uuid        references auth.users(id),
  verified_by            uuid        references auth.users(id),
  verified_at            timestamptz,
  rejection_reason       text,
  remarks                text,
  created_at             timestamptz default now()
);

create index if not exists pod_procurement_ref_idx on public.procurement_order_documents (procurement_reference);
create index if not exists pod_job_reference_idx   on public.procurement_order_documents (job_reference);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.procurement_orders          enable row level security;
alter table public.procurement_order_documents enable row level security;

-- SELECT: authenticated users
create policy "authenticated_select_procurement_orders"
  on public.procurement_orders
  for select to authenticated using (true);

create policy "authenticated_select_procurement_order_documents"
  on public.procurement_order_documents
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE: service role only (all mutations via API routes)
