-- =============================================================================
-- company_cashflow_v1.sql
-- Company Cash Flow Overview — tables, indexes, RLS policies.
--
-- Creates:
--   public.company_cashflow_items      — individual cashflow line items
--   public.company_cashflow_snapshots  — periodic summary snapshots
--
-- All statements are idempotent — safe to re-run.
-- Apply in Supabase SQL Editor before using /cashflow pages or API routes.
-- =============================================================================

-- ─── 1. company_cashflow_items ────────────────────────────────────────────────

create table if not exists public.company_cashflow_items (
  id                   uuid        primary key default gen_random_uuid(),
  company_id           uuid        references public.companies(id) on delete cascade,
  company_role         text        check (company_role in (
                                     'Importer','Exporter','Freight Forwarder',
                                     'Logistics Provider','Supplier','Buyer',
                                     'Capital Partner','Other'
                                   )),
  job_reference        text,
  procurement_reference text,
  supplier_id          uuid        references public.supplier_counterparties(id) on delete set null,
  cashflow_type        text        not null check (cashflow_type in (
                                     'Cash Inflow','Cash Outflow',
                                     'Receivable','Payable',
                                     'Nexum Held Amount','Nexum Release Expected',
                                     'Supplier Advance','Supplier Balance',
                                     'Logistics Fee','Duty / Tax','Insurance',
                                     'Inventory Cost','Customer Collection',
                                     'Carrier Payment','Haulier Payment',
                                     'Warehouse / Storage','Claim Reserve',
                                     'Refund','Other'
                                   )),
  cashflow_direction   text        not null check (cashflow_direction in ('Inflow','Outflow','Neutral'))
                                   default 'Neutral',
  amount               numeric     not null,
  currency             text        not null default 'RM',
  base_currency        text        not null default 'RM',
  fx_rate_to_base      numeric,
  base_amount          numeric,
  expected_date        date,
  actual_date          date,
  status               text        not null check (status in (
                                     'Expected','Pending','Secured',
                                     'Paid','Received','Overdue','Disputed','Cancelled'
                                   )) default 'Expected',
  source_type          text,        -- e.g. 'secured_job','procurement_order','manual'
  source_id            uuid,
  description          text,
  -- Provenance labels (requirement 11)
  is_nexum_controlled  boolean     not null default false,
  is_external          boolean     not null default false,
  is_projected         boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── 2. company_cashflow_snapshots ───────────────────────────────────────────

create table if not exists public.company_cashflow_snapshots (
  id                          uuid        primary key default gen_random_uuid(),
  company_id                  uuid        references public.companies(id) on delete cascade,
  snapshot_date               date        not null default current_date,
  period_start                date,
  period_end                  date,
  total_expected_inflow       numeric     not null default 0,
  total_expected_outflow      numeric     not null default 0,
  total_receivables           numeric     not null default 0,
  total_payables              numeric     not null default 0,
  total_nexum_held            numeric     not null default 0,
  total_nexum_release_expected numeric    not null default 0,
  total_overdue_receivables   numeric     not null default 0,
  total_overdue_payables      numeric     not null default 0,
  net_cash_position           numeric     not null default 0,
  projected_funding_gap       numeric     not null default 0,
  currency                    text        not null default 'RM',
  risk_level                  text        not null check (risk_level in ('Low','Medium','High','Critical'))
                                          default 'Medium',
  cashflow_note               text,
  created_at                  timestamptz not null default now()
);

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_cashflow_items_company_id
  on public.company_cashflow_items (company_id);

create index if not exists idx_cashflow_items_job_reference
  on public.company_cashflow_items (job_reference)
  where job_reference is not null;

create index if not exists idx_cashflow_items_expected_date
  on public.company_cashflow_items (expected_date)
  where expected_date is not null;

create index if not exists idx_cashflow_items_status
  on public.company_cashflow_items (status);

create index if not exists idx_cashflow_snapshots_company_id
  on public.company_cashflow_snapshots (company_id);

create index if not exists idx_cashflow_snapshots_date
  on public.company_cashflow_snapshots (company_id, snapshot_date desc);

-- ─── 4. Enable Row-Level Security ─────────────────────────────────────────────

alter table public.company_cashflow_items      enable row level security;
alter table public.company_cashflow_snapshots  enable row level security;

-- ─── 5. RLS policies — company_cashflow_items ─────────────────────────────────

-- Admin: full access
drop policy if exists "admin_all_cashflow_items" on public.company_cashflow_items;
create policy "admin_all_cashflow_items"
  on public.company_cashflow_items
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Company users: read/insert/update their own company's items
drop policy if exists "company_users_read_own_cashflow_items" on public.company_cashflow_items;
create policy "company_users_read_own_cashflow_items"
  on public.company_cashflow_items
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "company_users_insert_own_cashflow_items" on public.company_cashflow_items;
create policy "company_users_insert_own_cashflow_items"
  on public.company_cashflow_items
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "company_users_update_own_cashflow_items" on public.company_cashflow_items;
create policy "company_users_update_own_cashflow_items"
  on public.company_cashflow_items
  for update
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  )
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Service role: bypass RLS (full access via service key)
drop policy if exists "service_role_all_cashflow_items" on public.company_cashflow_items;
create policy "service_role_all_cashflow_items"
  on public.company_cashflow_items
  for all
  to service_role
  using (true)
  with check (true);

-- ─── 6. RLS policies — company_cashflow_snapshots ────────────────────────────

drop policy if exists "admin_all_cashflow_snapshots" on public.company_cashflow_snapshots;
create policy "admin_all_cashflow_snapshots"
  on public.company_cashflow_snapshots
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "company_users_read_own_snapshots" on public.company_cashflow_snapshots;
create policy "company_users_read_own_snapshots"
  on public.company_cashflow_snapshots
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "company_users_insert_own_snapshots" on public.company_cashflow_snapshots;
create policy "company_users_insert_own_snapshots"
  on public.company_cashflow_snapshots
  for insert
  to authenticated
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "service_role_all_cashflow_snapshots" on public.company_cashflow_snapshots;
create policy "service_role_all_cashflow_snapshots"
  on public.company_cashflow_snapshots
  for all
  to service_role
  using (true)
  with check (true);

-- ─── 7. Grant table access ────────────────────────────────────────────────────

grant select, insert, update, delete on table public.company_cashflow_items     to service_role;
grant select, insert, update         on table public.company_cashflow_items     to authenticated;

grant select, insert, update, delete on table public.company_cashflow_snapshots to service_role;
grant select, insert                 on table public.company_cashflow_snapshots to authenticated;

-- ─── 8. Verification ─────────────────────────────────────────────────────────

select table_name, column_name, data_type
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   in ('company_cashflow_items','company_cashflow_snapshots')
order  by table_name, ordinal_position;
-- Expected: 26 rows for company_cashflow_items, 16 rows for company_cashflow_snapshots
