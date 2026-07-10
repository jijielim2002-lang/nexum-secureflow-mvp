-- =============================================================================
-- working_capital_needs_v1.sql
-- Working Capital Need Detector — table, indexes, RLS.
--
-- Creates:
--   public.working_capital_needs
--
-- All statements are idempotent — safe to re-run.
-- Apply BEFORE using /admin/working-capital-needs or the detect API.
-- =============================================================================

create table if not exists public.working_capital_needs (
  id                       uuid        primary key default gen_random_uuid(),
  need_reference           text        unique not null,
  company_id               uuid        references public.companies(id) on delete cascade,
  company_name             text,
  company_role             text        check (company_role in (
                                         'Importer','Exporter','Freight Forwarder',
                                         'Logistics Provider','Supplier','Buyer','Other'
                                       )),
  job_reference            text,
  procurement_reference    text,
  supplier_id              uuid        references public.supplier_counterparties(id) on delete set null,
  need_type                text        not null check (need_type in (
                                         'Supplier Advance Gap',
                                         'Supplier Balance Gap',
                                         'Duty / Tax Gap',
                                         'Logistics Fee Gap',
                                         'Carrier / Vendor Payment Gap',
                                         'Inventory Funding Gap',
                                         'Receivables Gap',
                                         'Release Delay Gap',
                                         'Claim Reserve Gap',
                                         'FX Timing Gap',
                                         'Other'
                                       )),
  need_status              text        not null check (need_status in (
                                         'Detected',
                                         'Under Review',
                                         'Eligible for Simulation',
                                         'Not Suitable',
                                         'Converted to Financing Simulation',
                                         'Resolved',
                                         'Dismissed'
                                       )) default 'Detected',
  gap_amount               numeric,
  currency                 text        not null default 'RM',
  base_currency            text        not null default 'RM',
  fx_rate_to_base          numeric,
  base_gap_amount          numeric,
  gap_start_date           date,
  gap_end_date             date,
  estimated_gap_days       integer,
  expected_inflow_amount   numeric,
  expected_inflow_date     date,
  expected_outflow_amount  numeric,
  expected_outflow_date    date,
  repayment_source         text,
  supporting_evidence      jsonb,
  risk_level               text        not null check (risk_level in ('Low','Medium','High','Critical'))
                                       default 'Medium',
  confidence_score         numeric     check (confidence_score >= 0 and confidence_score <= 100),
  rationale                text,
  recommended_next_action  text,
  created_by_system        boolean     not null default true,
  reviewed_by              uuid        references auth.users(id) on delete set null,
  reviewed_at              timestamptz,
  review_note              text,
  -- Link to financing simulation (set when converted)
  financing_offer_id       uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_wcn_company_id
  on public.working_capital_needs (company_id);

create index if not exists idx_wcn_need_status
  on public.working_capital_needs (need_status);

create index if not exists idx_wcn_risk_level
  on public.working_capital_needs (risk_level);

create index if not exists idx_wcn_need_type
  on public.working_capital_needs (need_type);

create index if not exists idx_wcn_job_reference
  on public.working_capital_needs (job_reference)
  where job_reference is not null;

create index if not exists idx_wcn_created_at
  on public.working_capital_needs (created_at desc);

-- Deduplication index: one open need per (company, type, job/procurement)
create index if not exists idx_wcn_dedup
  on public.working_capital_needs (company_id, need_type, job_reference, procurement_reference)
  where need_status not in ('Resolved', 'Dismissed');

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.working_capital_needs enable row level security;

-- Admin: full access
drop policy if exists "admin_all_wcn" on public.working_capital_needs;
create policy "admin_all_wcn"
  on public.working_capital_needs
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Company users: read their own company's needs
drop policy if exists "company_users_read_own_wcn" on public.working_capital_needs;
create policy "company_users_read_own_wcn"
  on public.working_capital_needs
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Service role: bypass RLS
drop policy if exists "service_role_all_wcn" on public.working_capital_needs;
create policy "service_role_all_wcn"
  on public.working_capital_needs
  for all
  to service_role
  using (true)
  with check (true);

-- ─── Grants ───────────────────────────────────────────────────────────────────

grant select, insert, update, delete on table public.working_capital_needs to service_role;
grant select                         on table public.working_capital_needs to authenticated;

-- ─── Verification ─────────────────────────────────────────────────────────────

select column_name, data_type, column_default, is_nullable
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   = 'working_capital_needs'
order  by ordinal_position;
-- Expected: 35 columns
