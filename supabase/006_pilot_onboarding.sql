-- =============================================================================
-- NEXUM SECUREFLOW — 006_pilot_onboarding.sql
-- First Pilot Customer Onboarding & Live Transaction Checklist — Phase 5
--
-- SAFE TO RE-RUN: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE POLICY, idempotent GO-LIVE seed block.
--
-- PILOT SCOPE (Phase 1):
--   Local Malaysia · MYR only · Logistics fee only
--   Manual bank transfer / DuitNow · No cargo/supplier · No FX · No financing
--
-- CREATES:
--   1. pilot_onboarding_checklists
--   2. pilot_onboarding_items
--   3. pilot_status column on secured_jobs
--   4. RLS for both tables
--   5. Indexes
--   6. Go-live readiness items for Phase 5
-- =============================================================================

-- =============================================================================
-- 1. PILOT_ONBOARDING_CHECKLISTS
-- One checklist per company (onboarding) or per job (approval/readiness).
-- =============================================================================

create table if not exists public.pilot_onboarding_checklists (
  id                    uuid      primary key default gen_random_uuid(),
  checklist_reference   text      unique not null,
  checklist_type        text      check (checklist_type in (
                          'Provider Onboarding',
                          'Customer Onboarding',
                          'Live Job Approval',
                          'Payment Readiness',
                          'Release Readiness',
                          'Exception Review'
                        )) not null,
  company_id            uuid      references public.companies(id),
  company_name          text,
  job_reference         text,
  status                text      check (status in (
                          'Pending',
                          'In Review',
                          'Approved',
                          'Rejected',
                          'On Hold',
                          'Waived'
                        )) default 'Pending',
  risk_level            text      check (risk_level in ('Low','Medium','High','Critical')) default 'Medium',
  reviewed_by           uuid      references auth.users(id),
  reviewed_at           timestamptz,
  review_note           text,
  created_by            uuid      references auth.users(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

drop trigger if exists trg_poc_updated_at on public.pilot_onboarding_checklists;
create trigger trg_poc_updated_at
  before update on public.pilot_onboarding_checklists
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. PILOT_ONBOARDING_ITEMS
-- Individual checklist items, auto-populated from API on checklist creation.
-- =============================================================================

create table if not exists public.pilot_onboarding_items (
  id               uuid      primary key default gen_random_uuid(),
  checklist_id     uuid      references public.pilot_onboarding_checklists(id) on delete cascade,
  item_category    text,
  item_name        text      not null,
  item_description text,
  required         boolean   default true,
  status           text      check (status in (
                     'Pending',
                     'Passed',
                     'Failed',
                     'Waived',
                     'Not Applicable'
                   )) default 'Pending',
  evidence_note    text,
  evidence_url     text,
  checked_by       uuid      references auth.users(id),
  checked_at       timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

drop trigger if exists trg_poi_updated_at on public.pilot_onboarding_items;
create trigger trg_poi_updated_at
  before update on public.pilot_onboarding_items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 3. ADD pilot_status COLUMN TO secured_jobs
-- Controls whether a job is cleared for actual customer pilot.
-- =============================================================================

alter table public.secured_jobs
  add column if not exists pilot_status text
    check (pilot_status in (
      'Internal Test',
      'Pilot Review',
      'Live Pilot Approved',
      'Live Pilot Rejected',
      'Live Pilot Completed',
      'On Hold'
    )) default 'Internal Test';

-- =============================================================================
-- 4. INDEXES
-- =============================================================================

create index if not exists idx_poc_company_id
  on public.pilot_onboarding_checklists (company_id);

create index if not exists idx_poc_job_reference
  on public.pilot_onboarding_checklists (job_reference);

create index if not exists idx_poc_type_status
  on public.pilot_onboarding_checklists (checklist_type, status);

create index if not exists idx_poi_checklist_id
  on public.pilot_onboarding_items (checklist_id);

create index if not exists idx_poi_status
  on public.pilot_onboarding_items (status);

create index if not exists idx_sj_pilot_status
  on public.secured_jobs (pilot_status);

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

alter table public.pilot_onboarding_checklists  enable row level security;
alter table public.pilot_onboarding_items        enable row level security;

-- ── pilot_onboarding_checklists ──────────────────────────────────────────────

drop policy if exists "poc_admin_all"           on public.pilot_onboarding_checklists;
drop policy if exists "poc_provider_select"     on public.pilot_onboarding_checklists;
drop policy if exists "poc_customer_select"     on public.pilot_onboarding_checklists;

-- Admin: full access
create policy "poc_admin_all"
  on public.pilot_onboarding_checklists for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- Provider: read own company's checklists
create policy "poc_provider_select"
  on public.pilot_onboarding_checklists for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and company_id = public.nexum_my_company_id()
  );

-- Customer: read own company's checklists
create policy "poc_customer_select"
  on public.pilot_onboarding_checklists for select
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and company_id = public.nexum_my_company_id()
  );

-- ── pilot_onboarding_items ────────────────────────────────────────────────────

drop policy if exists "poi_admin_all"        on public.pilot_onboarding_items;
drop policy if exists "poi_company_select"   on public.pilot_onboarding_items;

-- Admin: full access
create policy "poi_admin_all"
  on public.pilot_onboarding_items for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- Provider / Customer: read items belonging to their own checklists
create policy "poi_company_select"
  on public.pilot_onboarding_items for select
  to authenticated
  using (
    exists (
      select 1 from public.pilot_onboarding_checklists poc
      where poc.id = pilot_onboarding_items.checklist_id
        and poc.company_id = public.nexum_my_company_id()
    )
  );

-- =============================================================================
-- 6. GO-LIVE READINESS ITEMS — PHASE 5
-- =============================================================================

do $gl_phase5$
begin
  if not exists (
    select 1 from public.go_live_readiness_items
    where item_name = 'First pilot provider onboarded and approved'
  ) then
    insert into public.go_live_readiness_items
      (category, item_name, priority, owner_name, evidence_note)
    values
      ('I. User Acceptance Testing', 'First pilot provider onboarded and approved',          'Critical', 'Admin', 'Provider Onboarding checklist status = Approved'),
      ('I. User Acceptance Testing', 'First pilot customer onboarded and approved',          'Critical', 'Admin', 'Customer Onboarding checklist status = Approved'),
      ('I. User Acceptance Testing', 'First live job approval checklist passed',             'Critical', 'Admin', 'Live Job Approval checklist status = Approved'),
      ('I. User Acceptance Testing', 'Payment Readiness checklist passed for first job',     'Critical', 'Admin', 'Payment Readiness checklist status = Approved'),
      ('I. User Acceptance Testing', 'Release Readiness checklist passed for first job',     'Critical', 'Admin', 'Release Readiness checklist status = Approved'),
      ('I. User Acceptance Testing', 'Exception Review process documented and tested',       'High',     'Admin', 'Exception Review checklist created and reviewed for at least one scenario'),
      ('E. Payment Workflow',        'First job pilot_status = Live Pilot Approved',         'Critical', 'Admin', 'secured_jobs.pilot_status = Live Pilot Approved for first real job'),
      ('E. Payment Workflow',        'First job pilot scope confirmed — MYR logistics fee only', 'Critical', 'Admin', 'Live Job Approval checklist: Cargo excluded, No FX, No financing'),
      ('E. Payment Workflow',        'Pilot gating rules tested — job blocked without approval', 'High',  'Admin', 'Job marked Internal Test shows warning; only approved jobs proceed'),
      ('J. Legal/Compliance',        'All pilot onboarding items passed or formally waived', 'Critical', 'Admin', 'No required items in Failed or Pending status at go-live');
  end if;
end $gl_phase5$;

-- =============================================================================
-- 7. VERIFICATION QUERIES
-- =============================================================================

select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in ('pilot_onboarding_checklists','pilot_onboarding_items')
group by tablename;

-- Check pilot_status column exists on secured_jobs
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'secured_jobs'
  and column_name  = 'pilot_status';
