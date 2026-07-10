-- ─────────────────────────────────────────────────────────────────────────────
-- Supplier / Counterparty Profile v1
-- Creates supplier_counterparties and job_supplier_links tables.
-- Captures supplier info from job forms and document extraction.
-- Links supplier profiles to secured jobs.
-- No supplier comparison or marketplace — Stage 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. supplier_counterparties ──────────────────────────────────────────────

create table if not exists public.supplier_counterparties (
  id                  uuid        primary key default gen_random_uuid(),
  supplier_name       text        not null,
  supplier_country    text,
  supplier_address    text,
  contact_person      text,
  contact_email       text,
  contact_phone       text,
  business_type       text,
  commodity_category  text,
  hs_code             text,
  hs_code_description text,
  tax_registration_no text,
  export_license_note text,
  supplier_status     text        default 'New'
    check (supplier_status in ('New', 'Known', 'Verified', 'Watchlist', 'Blocked')),
  risk_level          text        default 'Medium'
    check (risk_level in ('Low', 'Medium', 'High', 'Critical')),
  risk_note           text,
  created_by_role     text,       -- 'admin' | 'service_provider' | 'document_extraction'
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

comment on table public.supplier_counterparties
  is 'Supplier and counterparty profiles. Captured from job forms, RFQs, and document extraction. Not an approved supplier guarantee.';
comment on column public.supplier_counterparties.supplier_status
  is 'Admin-managed status: New (first seen), Known (seen before), Verified (admin confirmed), Watchlist (flagged for review), Blocked (do not transact).';
comment on column public.supplier_counterparties.risk_level
  is 'Admin-assessed supplier risk level. Low/Medium/High/Critical.';
comment on column public.supplier_counterparties.created_by_role
  is 'Role that created this profile: admin, service_provider, or document_extraction.';

-- ─── 2. job_supplier_links ───────────────────────────────────────────────────

create table if not exists public.job_supplier_links (
  id                uuid        primary key default gen_random_uuid(),
  job_reference     text        not null,
  supplier_id       uuid        references public.supplier_counterparties(id) on delete cascade,
  relationship_type text        default 'Seller'
    check (relationship_type in (
      'Seller', 'Shipper', 'Manufacturer', 'Exporter',
      'Consignee', 'Notify Party', 'Other'
    )),
  source            text        default 'Manual'
    check (source in (
      'Manual', 'Document Extraction', 'Admin Verified',
      'Customer Provided', 'Provider Provided'
    )),
  confidence_score  numeric,    -- 0.00–1.00; populated from document extraction
  created_at        timestamptz default now()
);

comment on table public.job_supplier_links
  is 'Many-to-many link between secured jobs and supplier profiles. Source tracks how the link was established.';
comment on column public.job_supplier_links.confidence_score
  is 'Extraction confidence when source is Document Extraction. Null for manual entries.';

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_supplier_counterparties_name
  on public.supplier_counterparties (supplier_name);

create index if not exists idx_supplier_counterparties_status
  on public.supplier_counterparties (supplier_status);

create index if not exists idx_supplier_counterparties_risk
  on public.supplier_counterparties (risk_level);

create index if not exists idx_supplier_counterparties_country
  on public.supplier_counterparties (supplier_country)
  where supplier_country is not null;

create index if not exists idx_job_supplier_links_job_reference
  on public.job_supplier_links (job_reference);

create index if not exists idx_job_supplier_links_supplier_id
  on public.job_supplier_links (supplier_id);

-- ─── 4. Row-Level Security ───────────────────────────────────────────────────

alter table public.supplier_counterparties enable row level security;
alter table public.job_supplier_links       enable row level security;

-- supplier_counterparties: all authenticated users may read
create policy "supplier_counterparties_select_authenticated"
  on public.supplier_counterparties
  for select
  to authenticated
  using (true);

-- supplier_counterparties: authenticated users may insert (role checks in API layer)
create policy "supplier_counterparties_insert_authenticated"
  on public.supplier_counterparties
  for insert
  to authenticated
  with check (true);

-- supplier_counterparties: only admins may update (enforced in API layer via service role)
-- Using service role in API routes bypasses RLS for admin operations.
-- Providers cannot update supplier_status or risk_level directly.

-- job_supplier_links: all authenticated users may read
create policy "job_supplier_links_select_authenticated"
  on public.job_supplier_links
  for select
  to authenticated
  using (true);

-- job_supplier_links: authenticated users may insert
create policy "job_supplier_links_insert_authenticated"
  on public.job_supplier_links
  for insert
  to authenticated
  with check (true);

-- ─── 5. Audit action reference (from lib/supplierProfile.ts) ─────────────────
-- supplier_counterparty_created
-- supplier_counterparty_updated
-- supplier_linked_to_job
-- supplier_extracted_from_document
-- supplier_marked_watchlist
-- supplier_marked_blocked
-- supplier_verified
