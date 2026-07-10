-- =============================================================================
-- add_missing_columns_v3.sql
-- Adds columns that exist in the TypeScript types but were absent from the DB,
-- causing repair-job-setup optional steps to fail with "missing column" errors.
--
-- Columns added:
--   notifications.sent_at          — timestamptz, nullable
--   workflow_tasks.created_by_system — boolean, nullable (defaults false)
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ─── notifications.sent_at ───────────────────────────────────────────────────
alter table public.notifications
  add column if not exists sent_at timestamptz;

-- ─── workflow_tasks.created_by_system ────────────────────────────────────────
alter table public.workflow_tasks
  add column if not exists created_by_system boolean default false;

-- ─── Also absorb v2 columns in case v2 was not applied (all idempotent) ──────
alter table public.notifications
  add column if not exists delivery_channel text;

alter table public.workflow_tasks
  add column if not exists company_id uuid
    references public.companies(id) on delete set null;

alter table public.notifications
  add column if not exists action_url text;

alter table public.workflow_tasks
  add column if not exists action_url text;

-- ─── Verification ─────────────────────────────────────────────────────────────

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'notifications'  and column_name in ('sent_at', 'delivery_channel', 'action_url'))
    or
    (table_name = 'workflow_tasks' and column_name in ('created_by_system', 'company_id', 'action_url'))
  )
order by table_name, column_name;

-- Expected: 6 rows.
--   notifications  / action_url        / text             / YES  / (null)
--   notifications  / delivery_channel  / text             / YES  / (null)
--   notifications  / sent_at           / timestamp w/ tz  / YES  / (null)
--   workflow_tasks / action_url        / text             / YES  / (null)
--   workflow_tasks / company_id        / uuid             / YES  / (null)
--   workflow_tasks / created_by_system / boolean          / YES  / false
