-- =============================================================================
-- add_missing_columns_v5.sql
-- Fixes two remaining optional-step failures in repair-job-setup:
--
--   1. workflow_tasks.task_title IS NULL  (23502 null violation)
--      Root cause: task_title / task_description are legacy NOT NULL columns
--      that are absent from the TypeScript types.  The repair route now
--      always mirrors title → task_title and description → task_description.
--      This migration makes both columns nullable so older code paths that
--      don't supply them don't fail.
--
--   2. notifications RLS blocked  (42501)
--      Service role needs INSERT permission + permissive policy on notifications.
--      This is a consolidation of repair_job_setup_rls_fix_v1.sql focused on
--      notifications only.  Run repair_job_setup_rls_fix_v1.sql for full coverage.
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — all statements are idempotent.
-- =============================================================================

-- ─── 1. workflow_tasks: add / relax task_title and task_description ───────────

-- Add columns if they don't already exist
alter table public.workflow_tasks
  add column if not exists task_title       text;

alter table public.workflow_tasks
  add column if not exists task_description text;

-- Remove NOT NULL constraints if present (makes these columns safe to omit)
alter table public.workflow_tasks
  alter column task_title       drop not null;

alter table public.workflow_tasks
  alter column task_description drop not null;

-- ─── 2. notifications: grant INSERT to service_role + permissive policy ───────

grant usage  on schema public to service_role;
grant select, insert, update on table public.notifications to service_role;
grant usage, select on all sequences in schema public to service_role;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notifications'
      and policyname = 'service_role_all'
  ) then
    execute $pol$
      create policy "service_role_all"
        on public.notifications
        as permissive for all
        to service_role
        using (true)
        with check (true)
    $pol$;
  end if;
end $$;

-- ─── 3. Absorb earlier migrations (all idempotent) ───────────────────────────
alter table public.workflow_tasks
  add column if not exists source_reference  text;
alter table public.workflow_tasks
  add column if not exists created_by_system boolean default false;
alter table public.workflow_tasks
  add column if not exists company_id        uuid
    references public.companies(id) on delete set null;
alter table public.workflow_tasks
  add column if not exists action_url        text;
alter table public.notifications
  add column if not exists sent_at           timestamptz;
alter table public.notifications
  add column if not exists delivery_channel  text;
alter table public.notifications
  add column if not exists action_url        text;

-- ─── 4. Verification ─────────────────────────────────────────────────────────

-- Check workflow_tasks columns
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'workflow_tasks'
  and column_name  in ('task_title', 'task_description', 'source_reference', 'created_by_system')
order by column_name;
-- Expected: 4 rows, all is_nullable = 'YES'

-- Check notifications policy
select schemaname, tablename, policyname, roles, cmd
from   pg_policies
where  schemaname = 'public'
  and  tablename  = 'notifications'
  and  policyname = 'service_role_all';
-- Expected: 1 row with roles = '{service_role}'
