-- =============================================================================
-- customer_acceptance_hardening_v1.sql
-- Hardens the customer acceptance flow:
--
--   1. job_terms_snapshots.accepted_by_label  (text, nullable)
--      Stores a human-readable label (full name / id / "customer") when
--      accepted_by (uuid) is null or as a display-friendly fallback.
--
--   2. job_terms_snapshots — service_role grants + permissive policy
--      The snapshot API uses the service-role client.  Without INSERT
--      permission + a permissive RLS policy the insert silently fails
--      with 42501.
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — all statements are idempotent.
-- =============================================================================

-- ─── 1. Add accepted_by_label column ─────────────────────────────────────────

alter table public.job_terms_snapshots
  add column if not exists accepted_by_label text;

-- ─── 2. Grant service_role access to job_terms_snapshots ─────────────────────

grant usage  on schema public to service_role;
grant select, insert, update on table public.job_terms_snapshots to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ─── 3. Permissive RLS policy for service_role ───────────────────────────────

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
        using      (true)
        with check (true)
    $pol$;
  end if;
end $$;

-- ─── 4. Verification ─────────────────────────────────────────────────────────

-- Check accepted_by_label column exists
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'job_terms_snapshots'
  and column_name  = 'accepted_by_label';
-- Expected: 1 row, data_type = 'text', is_nullable = 'YES'

-- Check RLS policy exists
select schemaname, tablename, policyname, roles, cmd
from   pg_policies
where  schemaname = 'public'
  and  tablename  = 'job_terms_snapshots'
  and  policyname = 'service_role_all';
-- Expected: 1 row with roles = '{service_role}'
