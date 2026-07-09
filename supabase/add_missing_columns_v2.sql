-- =============================================================================
-- add_missing_columns_v2.sql
-- Adds columns that exist in the TypeScript types but were absent from the DB,
-- causing repair-job-setup optional steps to fail with "missing column" errors.
--
-- Columns added:
--   notifications.delivery_channel  — text, nullable
--   workflow_tasks.company_id       — uuid, nullable (FK to companies)
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ─── notifications.delivery_channel ──────────────────────────────────────────
alter table public.notifications
  add column if not exists delivery_channel text;

-- ─── workflow_tasks.company_id ────────────────────────────────────────────────
alter table public.workflow_tasks
  add column if not exists company_id uuid
    references public.companies(id) on delete set null;

-- ─── Also add action_url if not already applied from add_action_url_columns_v1.sql
-- (idempotent — safe to run even if already applied)
alter table public.notifications
  add column if not exists action_url text;

alter table public.workflow_tasks
  add column if not exists action_url text;

-- ─── Verification ─────────────────────────────────────────────────────────────

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'notifications'  and column_name in ('delivery_channel', 'action_url'))
    or
    (table_name = 'workflow_tasks' and column_name in ('company_id', 'action_url'))
  )
order by table_name, column_name;

-- Expected: 4 rows.
--   notifications  / action_url      / text / YES
--   notifications  / delivery_channel / text / YES
--   workflow_tasks / action_url      / text / YES
--   workflow_tasks / company_id      / uuid / YES
