-- =============================================================================
-- NEXUM SECUREFLOW — 008_live_pilot_dry_run.sql
-- First Live Pilot Transaction Dry Run — Phase 7
--
-- SAFE TO RE-RUN: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE POLICY, idempotent seed blocks.
--
-- PILOT SCOPE (Phase 1):
--   Local Malaysia · MYR only · Logistics fee only
--   Manual bank transfer / DuitNow · No real funds in dry-run
--   No cargo/supplier · No FX · No financing
--
-- CREATES:
--   1. live_pilot_dry_runs
--   2. live_pilot_dry_run_steps  (CASCADE from dry_runs)
--   3. system_settings additions (first_live_transaction_approved + metadata)
--   4. RLS for both tables (admin only)
--   5. Indexes
--   6. Go-live readiness items for Phase 7
-- =============================================================================

-- =============================================================================
-- 1. LIVE_PILOT_DRY_RUNS
-- =============================================================================

create table if not exists public.live_pilot_dry_runs (
  id                    uuid        primary key default gen_random_uuid(),
  dry_run_reference     text        unique not null,
  job_reference         text,
  provider_company_id   uuid        references public.companies(id),
  customer_company_id   uuid        references public.companies(id),
  dry_run_status        text        check (dry_run_status in (
                          'Not Started', 'In Progress', 'Passed', 'Failed', 'Blocked', 'Waived'
                        )) default 'Not Started',
  environment           text        check (environment in ('Staging','Production')) default 'Staging',
  dry_run_type          text        check (dry_run_type in (
                          'Internal Simulation',
                          'Production No-Money Test',
                          'Live Pilot Rehearsal'
                        )) default 'Production No-Money Test',
  amount                numeric,
  currency              text        default 'MYR',
  reviewer_id           uuid        references auth.users(id),
  reviewed_at           timestamptz,
  review_note           text,
  created_by            uuid        references auth.users(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

drop trigger if exists trg_lpdr_updated_at on public.live_pilot_dry_runs;
create trigger trg_lpdr_updated_at
  before update on public.live_pilot_dry_runs
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. LIVE_PILOT_DRY_RUN_STEPS
-- =============================================================================

create table if not exists public.live_pilot_dry_run_steps (
  id              uuid        primary key default gen_random_uuid(),
  dry_run_id      uuid        references public.live_pilot_dry_runs(id) on delete cascade,
  step_number     integer     not null,
  step_category   text,
  step_name       text        not null,
  expected_result text,
  actual_result   text,
  status          text        check (status in (
                    'Pending', 'Passed', 'Failed', 'Blocked', 'Waived', 'Not Applicable'
                  )) default 'Pending',
  required        boolean     default true,
  evidence_note   text,
  evidence_url    text,
  checked_by      uuid        references auth.users(id),
  checked_at      timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists trg_lpdrs_updated_at on public.live_pilot_dry_run_steps;
create trigger trg_lpdrs_updated_at
  before update on public.live_pilot_dry_run_steps
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 3. SYSTEM_SETTINGS ADDITIONS — first live transaction gate
-- =============================================================================

insert into public.system_settings (key, value, description)
values
  ('first_live_transaction_approved',    'false', 'Whether first live transaction has been approved after dry run'),
  ('first_live_transaction_approved_by', '',      'UUID of admin who approved first live transaction'),
  ('first_live_transaction_approved_at', '',      'ISO timestamp of first live transaction approval'),
  ('first_live_transaction_note',        '',      'Management sign-off note for first live transaction')
on conflict (key) do nothing;

-- =============================================================================
-- 4. INDEXES
-- =============================================================================

create index if not exists idx_lpdr_status
  on public.live_pilot_dry_runs (dry_run_status);

create index if not exists idx_lpdr_environment
  on public.live_pilot_dry_runs (environment);

create index if not exists idx_lpdr_job_reference
  on public.live_pilot_dry_runs (job_reference);

create index if not exists idx_lpdrs_dry_run_id
  on public.live_pilot_dry_run_steps (dry_run_id);

create index if not exists idx_lpdrs_status
  on public.live_pilot_dry_run_steps (status);

create index if not exists idx_lpdrs_step_number
  on public.live_pilot_dry_run_steps (dry_run_id, step_number);

-- =============================================================================
-- 5. ROW LEVEL SECURITY — admin-only for both tables
-- =============================================================================

alter table public.live_pilot_dry_runs       enable row level security;
alter table public.live_pilot_dry_run_steps  enable row level security;

drop policy if exists "lpdr_admin_all"  on public.live_pilot_dry_runs;
drop policy if exists "lpdrs_admin_all" on public.live_pilot_dry_run_steps;

create policy "lpdr_admin_all"
  on public.live_pilot_dry_runs for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

create policy "lpdrs_admin_all"
  on public.live_pilot_dry_run_steps for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- =============================================================================
-- 6. GO-LIVE READINESS ITEMS — PHASE 7
-- =============================================================================

do $gl_phase7$
begin
  if not exists (
    select 1 from public.go_live_readiness_items
    where item_name = 'First live pilot dry run created'
  ) then
    insert into public.go_live_readiness_items
      (category, item_name, priority, owner_name, evidence_note)
    values
      ('I. User Acceptance Testing', 'First live pilot dry run created',               'Critical', 'Admin', 'live_pilot_dry_runs: at least one record exists'),
      ('I. User Acceptance Testing', 'Dry run environment and access flow passed',      'Critical', 'Admin', 'Dry run Category A: all required steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run provider flow passed',                   'Critical', 'Admin', 'Dry run Category B: provider steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run admin job approval flow passed',          'Critical', 'Admin', 'Dry run Category C: admin approval steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run customer flow passed',                   'Critical', 'Admin', 'Dry run Category D: customer steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run payment proof flow passed',              'Critical', 'Admin', 'Dry run Category E: payment proof steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run execution and POD flow passed',          'High',     'Admin', 'Dry run Category F: POD upload steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run release and payout flow passed',         'Critical', 'Admin', 'Dry run Category H: release steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run evidence pack and export verified',      'High',     'Admin', 'Dry run Category I: evidence pack steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run security negative tests passed',         'Critical', 'Admin', 'Dry run Category J: security steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run final review completed',                 'Critical', 'Admin', 'Dry run Category K: final review steps Passed or Waived'),
      ('I. User Acceptance Testing', 'Dry run overall status = Passed',                'Critical', 'Admin', 'live_pilot_dry_runs.dry_run_status = Passed'),
      ('J. Legal/Compliance',        'First live transaction formally approved by admin', 'Critical', 'Admin', 'system_settings: first_live_transaction_approved = true'),
      ('J. Legal/Compliance',        'First live transaction approval note recorded',  'Critical', 'Admin', 'system_settings: first_live_transaction_note is not empty');
  end if;
end $gl_phase7$;

-- =============================================================================
-- 7. VERIFICATION QUERIES
-- =============================================================================

select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in ('live_pilot_dry_runs','live_pilot_dry_run_steps')
group by tablename;

select key, value
from public.system_settings
where key like 'first_live%'
order by key;
