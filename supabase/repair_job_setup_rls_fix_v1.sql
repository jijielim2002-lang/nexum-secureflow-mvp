-- =============================================================================
-- repair_job_setup_rls_fix_v1.sql
-- Fixes RLS / permission errors when the Repair Job Setup API (service role)
-- tries to insert into payment_obligations, held_payments, workflow_tasks,
-- notifications, and related tables.
--
-- Root cause: In Supabase the service_role JWT bypasses RLS only when the
-- role has BYPASSRLS privilege AND the table grants INSERT to service_role.
-- If either is missing you get PostgreSQL error 42501 (insufficient_privilege).
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — all statements are idempotent.
-- =============================================================================

-- ─── 1. Verify your service role key is correct ───────────────────────────────
-- Before running this SQL, confirm SUPABASE_SERVICE_ROLE_KEY in .env.local
-- starts with "eyJ..." and matches the "service_role" JWT in:
--   Supabase Dashboard → Project Settings → API → service_role (secret)
-- Using the anon key by mistake will always get RLS errors regardless of SQL.

-- ─── 2. Grant INSERT + SELECT to service_role on core tables ─────────────────

grant usage on schema public to service_role;

grant select, insert, update on table public.payment_obligations to service_role;
grant select, insert, update on table public.held_payments        to service_role;
grant select, insert, update on table public.job_terms_snapshots  to service_role;
grant select, insert, update on table public.workflow_tasks       to service_role;
grant select, insert, update on table public.notifications        to service_role;
grant select, insert, update on table public.audit_logs           to service_role;

-- ─── 3. Ensure service_role can bypass RLS ───────────────────────────────────
-- In Supabase the service_role already has BYPASSRLS by default.
-- Run this only if you are still seeing 42501 errors after step 2.

-- alter role service_role bypassrls;   -- uncomment if still blocked

-- ─── 4. Explicit permissive RLS policies (belt-and-suspenders) ───────────────
-- These policies allow the service_role to read/write regardless of other
-- policies. Safe to add even if BYPASSRLS is already set.

-- payment_obligations
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'payment_obligations'
      and policyname = 'service_role_all'
  ) then
    execute $pol$
      create policy "service_role_all"
        on public.payment_obligations
        as permissive for all
        to service_role
        using (true)
        with check (true)
    $pol$;
  end if;
end $$;

-- held_payments
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'held_payments'
      and policyname = 'service_role_all'
  ) then
    execute $pol$
      create policy "service_role_all"
        on public.held_payments
        as permissive for all
        to service_role
        using (true)
        with check (true)
    $pol$;
  end if;
end $$;

-- job_terms_snapshots
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'job_terms_snapshots'
      and policyname = 'service_role_all'
  ) then
    execute $pol$
      create policy "service_role_all"
        on public.job_terms_snapshots
        as permissive for all
        to service_role
        using (true)
        with check (true)
    $pol$;
  end if;
end $$;

-- workflow_tasks
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'workflow_tasks'
      and policyname = 'service_role_all'
  ) then
    execute $pol$
      create policy "service_role_all"
        on public.workflow_tasks
        as permissive for all
        to service_role
        using (true)
        with check (true)
    $pol$;
  end if;
end $$;

-- notifications
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

-- ─── 5. Sequence grants (needed for id columns that use sequences) ────────────

grant usage, select on all sequences in schema public to service_role;

-- ─── 6. Verification ─────────────────────────────────────────────────────────
-- Run this after applying to confirm policies exist.

select schemaname, tablename, policyname, roles, cmd
from   pg_policies
where  schemaname = 'public'
  and  tablename  in (
    'payment_obligations', 'held_payments', 'job_terms_snapshots',
    'workflow_tasks', 'notifications', 'audit_logs'
  )
order  by tablename, policyname;
-- Expected: at least one row per table with policyname = 'service_role_all'
-- and roles = '{service_role}'.
