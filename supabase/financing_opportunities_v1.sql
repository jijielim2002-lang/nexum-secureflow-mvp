-- =============================================================================
-- financing_opportunities_v1.sql
-- Financing Opportunity Engine — table, indexes, RLS.
--
-- Creates:
--   public.financing_opportunities
--
-- All statements are idempotent — safe to re-run.
-- Apply AFTER working_capital_needs_v1.sql.
-- Apply BEFORE using /admin/financing-opportunities or the generate API.
-- =============================================================================

create table if not exists public.financing_opportunities (
  id                       uuid        primary key default gen_random_uuid(),
  opportunity_reference    text        unique not null,
  working_capital_need_id  uuid        references public.working_capital_needs(id) on delete set null,
  company_id               uuid        references public.companies(id) on delete cascade,
  company_name             text,
  company_role             text,
  job_reference            text,
  procurement_reference    text,
  supplier_id              uuid        references public.supplier_counterparties(id) on delete set null,

  opportunity_type         text        not null check (opportunity_type in (
                                         'Supplier Advance Financing',
                                         'Supplier Balance Financing',
                                         'Logistics Working Capital',
                                         'Carrier / Vendor Payment Financing',
                                         'Duty / Tax Financing',
                                         'Invoice Financing',
                                         'Purchase Order Financing',
                                         'Inventory Financing',
                                         'Release-Against-POD Financing',
                                         'Release Delay Bridge',
                                         'Claim Reserve Bridge',
                                         'FX Timing Bridge',
                                         'Other'
                                       )),

  opportunity_status       text        not null check (opportunity_status in (
                                         'Detected',
                                         'Under Review',
                                         'Ready for Simulation',
                                         'Simulation Created',
                                         'Shared with Capital Partner',
                                         'Not Suitable',
                                         'Dismissed',
                                         'Closed'
                                       )) default 'Detected',

  requested_amount         numeric,
  currency                 text        not null default 'RM',
  base_currency            text        not null default 'RM',
  base_amount              numeric,
  suggested_tenure_days    integer,
  expected_repayment_date  date,
  repayment_source         text,
  repayment_trigger        text,
  recommended_security     text,
  supporting_evidence      jsonb,

  risk_level               text        not null check (risk_level in ('Low','Medium','High','Critical'))
                                       default 'Medium',
  financeability_score     numeric     check (financeability_score >= 0 and financeability_score <= 100),
  confidence_score         numeric     check (confidence_score >= 0 and confidence_score <= 100),
  pricing_band             text,
  recommended_fee_rate     numeric,
  rationale                text,
  next_action              text,

  -- Link to financing simulation (set when converted)
  financing_offer_id       uuid,

  reviewed_by              uuid        references auth.users(id) on delete set null,
  reviewed_at              timestamptz,
  review_note              text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── Auto-update updated_at ───────────────────────────────────────────────────

create or replace function public.set_fop_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fop_updated_at on public.financing_opportunities;
create trigger trg_fop_updated_at
  before update on public.financing_opportunities
  for each row execute function public.set_fop_updated_at();

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_fop_company_id
  on public.financing_opportunities (company_id);

create index if not exists idx_fop_status
  on public.financing_opportunities (opportunity_status);

create index if not exists idx_fop_risk_level
  on public.financing_opportunities (risk_level);

create index if not exists idx_fop_type
  on public.financing_opportunities (opportunity_type);

create index if not exists idx_fop_wcn_id
  on public.financing_opportunities (working_capital_need_id)
  where working_capital_need_id is not null;

create index if not exists idx_fop_job_reference
  on public.financing_opportunities (job_reference)
  where job_reference is not null;

create index if not exists idx_fop_created_at
  on public.financing_opportunities (created_at desc);

-- Deduplication index: one open opportunity per (company, need, type)
create index if not exists idx_fop_dedup
  on public.financing_opportunities (company_id, working_capital_need_id, opportunity_type)
  where opportunity_status not in ('Dismissed', 'Closed', 'Not Suitable');

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.financing_opportunities enable row level security;

-- Admin: full access
drop policy if exists "admin_all_fop" on public.financing_opportunities;
create policy "admin_all_fop"
  on public.financing_opportunities
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Company users: read their own company's opportunities
drop policy if exists "company_users_read_own_fop" on public.financing_opportunities;
create policy "company_users_read_own_fop"
  on public.financing_opportunities
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Service role: bypass RLS
drop policy if exists "service_role_all_fop" on public.financing_opportunities;
create policy "service_role_all_fop"
  on public.financing_opportunities
  for all
  to service_role
  using (true)
  with check (true);

-- ─── Grants ───────────────────────────────────────────────────────────────────

grant select, insert, update, delete on table public.financing_opportunities to service_role;
grant select                          on table public.financing_opportunities to authenticated;

-- ─── Add opportunity_reference column to simulated_financing_offers ───────────
-- (links back to the opportunity that generated the simulation)

alter table public.simulated_financing_offers
  add column if not exists opportunity_reference text;

alter table public.simulated_financing_offers
  add column if not exists opportunity_id uuid references public.financing_opportunities(id) on delete set null;

alter table public.simulated_financing_offers
  add column if not exists financeability_score numeric;

alter table public.simulated_financing_offers
  add column if not exists repayment_trigger text;

-- ─── Verification ─────────────────────────────────────────────────────────────

select column_name, data_type, column_default, is_nullable
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   = 'financing_opportunities'
order  by ordinal_position;
-- Expected: 33 columns
