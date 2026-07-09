-- =============================================================================
-- NEXUM SECUREFLOW — 007_deployment_cutover.sql
-- Production Deployment & Staging-to-Live Cutover Plan — Phase 6
--
-- SAFE TO RE-RUN: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE POLICY, idempotent seed blocks.
--
-- PILOT SCOPE (Phase 1):
--   Local Malaysia · MYR only · Logistics fee only
--   Manual bank transfer / DuitNow · No cargo/supplier · No FX · No financing
--
-- CREATES:
--   1. system_settings                  — live-mode gates + deployment env
--   2. deployment_cutover_checklists    — per-type cutover checklist
--   3. deployment_cutover_items         — individual items (auto-seeded from API)
--   4. RLS for all three tables
--   5. Indexes
--   6. Default system_settings seed
--   7. Go-live readiness items for Phase 6
-- =============================================================================

-- =============================================================================
-- 1. SYSTEM_SETTINGS
-- Single key-value store for deployment environment and live-mode gates.
-- =============================================================================

create table if not exists public.system_settings (
  key         text        primary key,
  value       text        not null default '',
  description text,
  updated_by  uuid        references auth.users(id),
  updated_at  timestamptz default now()
);

-- =============================================================================
-- 2. DEPLOYMENT_CUTOVER_CHECKLISTS
-- One checklist per environment × type (e.g. Production × Security Review).
-- =============================================================================

create table if not exists public.deployment_cutover_checklists (
  id                    uuid        primary key default gen_random_uuid(),
  checklist_reference   text        unique not null,
  environment           text        check (environment in (
                          'Local', 'Staging', 'Production'
                        )) default 'Staging',
  checklist_type        text        check (checklist_type in (
                          'Environment Setup',
                          'Database Cutover',
                          'Security Review',
                          'Storage Review',
                          'Admin Access',
                          'Test Data Cleanup',
                          'Backup / Recovery',
                          'Monitoring',
                          'Go-Live Approval',
                          'Post-Go-Live Review'
                        )) not null,
  status                text        check (status in (
                          'Pending', 'In Progress', 'Passed', 'Failed', 'Waived', 'Blocked'
                        )) default 'Pending',
  risk_level            text        check (risk_level in ('Low','Medium','High','Critical')) default 'Medium',
  owner_name            text,
  reviewed_by           uuid        references auth.users(id),
  reviewed_at           timestamptz,
  review_note           text,
  created_by            uuid        references auth.users(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

drop trigger if exists trg_dcc_updated_at on public.deployment_cutover_checklists;
create trigger trg_dcc_updated_at
  before update on public.deployment_cutover_checklists
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 3. DEPLOYMENT_CUTOVER_ITEMS
-- Individual checklist items — auto-populated from API on checklist creation.
-- =============================================================================

create table if not exists public.deployment_cutover_items (
  id               uuid        primary key default gen_random_uuid(),
  checklist_id     uuid        references public.deployment_cutover_checklists(id) on delete cascade,
  item_category    text,
  item_name        text        not null,
  item_description text,
  required         boolean     default true,
  status           text        check (status in (
                     'Pending', 'Passed', 'Failed', 'Waived', 'Not Applicable', 'Blocked'
                   )) default 'Pending',
  evidence_note    text,
  evidence_url     text,
  checked_by       uuid        references auth.users(id),
  checked_at       timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

drop trigger if exists trg_dci_updated_at on public.deployment_cutover_items;
create trigger trg_dci_updated_at
  before update on public.deployment_cutover_items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. INDEXES
-- =============================================================================

create index if not exists idx_dcc_environment_type
  on public.deployment_cutover_checklists (environment, checklist_type);

create index if not exists idx_dcc_status
  on public.deployment_cutover_checklists (status);

create index if not exists idx_dci_checklist_id
  on public.deployment_cutover_items (checklist_id);

create index if not exists idx_dci_status
  on public.deployment_cutover_items (status);

create index if not exists idx_ss_key
  on public.system_settings (key);

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

alter table public.system_settings                enable row level security;
alter table public.deployment_cutover_checklists  enable row level security;
alter table public.deployment_cutover_items        enable row level security;

-- ── system_settings — admin read/write only ───────────────────────────────────

drop policy if exists "ss_admin_all" on public.system_settings;

create policy "ss_admin_all"
  on public.system_settings for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- ── deployment_cutover_checklists — admin only ────────────────────────────────

drop policy if exists "dcc_admin_all" on public.deployment_cutover_checklists;

create policy "dcc_admin_all"
  on public.deployment_cutover_checklists for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- ── deployment_cutover_items — admin only ─────────────────────────────────────

drop policy if exists "dci_admin_all" on public.deployment_cutover_items;

create policy "dci_admin_all"
  on public.deployment_cutover_items for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- =============================================================================
-- 6. DEFAULT SYSTEM_SETTINGS SEED
-- Idempotent: INSERT only if key does not exist.
-- =============================================================================

insert into public.system_settings (key, value, description)
values
  ('deployment_environment', 'Staging',
   'Current deployment environment: Local | Staging | Production'),
  ('live_customer_enabled', 'false',
   'Allow creation of real pilot jobs for actual customers'),
  ('live_payment_enabled', 'false',
   'Allow marking real customer payments as secured'),
  ('live_release_enabled', 'false',
   'Allow real payout and release approval for pilot transactions')
on conflict (key) do nothing;

-- =============================================================================
-- 7. GO-LIVE READINESS ITEMS — PHASE 6
-- =============================================================================

do $gl_phase6$
begin
  if not exists (
    select 1 from public.go_live_readiness_items
    where item_name = 'Production deployment environment confirmed'
  ) then
    insert into public.go_live_readiness_items
      (category, item_name, priority, owner_name, evidence_note)
    values
      ('A. Infrastructure',   'Production deployment environment confirmed',          'Critical', 'Admin', 'system_settings.deployment_environment = Production'),
      ('A. Infrastructure',   'All environment variables set in production host',     'Critical', 'Admin', 'Environment Setup checklist Passed'),
      ('A. Infrastructure',   'SSL/HTTPS enabled on production domain',               'Critical', 'Admin', 'Environment Setup checklist item: SSL enabled'),
      ('A. Infrastructure',   'Service role key NOT exposed to browser',              'Critical', 'Admin', 'Security Review: SUPABASE_SERVICE_ROLE_KEY server-side only'),
      ('B. Database',         'Production Supabase project created and verified',     'Critical', 'Admin', 'Database Cutover checklist Passed'),
      ('B. Database',         'All RLS policies active in production',                'Critical', 'Admin', 'Schema health page Passed on production URL'),
      ('B. Database',         'Storage buckets private, signed URL working',          'Critical', 'Admin', 'Storage Review checklist Passed'),
      ('B. Database',         'Supabase backup confirmed',                            'High',     'Admin', 'Backup/Recovery checklist Passed'),
      ('C. Security',         'Security review checklist fully Passed or Waived',     'Critical', 'Admin', 'Security Review checklist status = Passed or Waived'),
      ('C. Security',         'Admin access checklist Passed',                        'Critical', 'Admin', 'Admin Access checklist Passed'),
      ('C. Security',         'Test data removed from production',                    'Critical', 'Admin', 'Test Data Cleanup checklist Passed'),
      ('D. Operations',       'Monitoring checklist Passed',                          'High',     'Admin', 'Monitoring checklist Passed'),
      ('D. Operations',       'Live mode gates configured by admin',                  'Critical', 'Admin', 'system_settings: live_customer_enabled, live_payment_enabled, live_release_enabled'),
      ('J. Legal/Compliance', 'Go-Live Approval checklist signed off',                'Critical', 'Admin', 'Go-Live Approval checklist status = Passed');
  end if;
end $gl_phase6$;

-- =============================================================================
-- 8. VERIFICATION QUERIES
-- =============================================================================

select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in ('system_settings','deployment_cutover_checklists','deployment_cutover_items')
group by tablename;

select key, value
from public.system_settings
order by key;
