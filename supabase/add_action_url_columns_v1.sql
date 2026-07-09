-- =============================================================================
-- add_action_url_columns_v1.sql
-- Adds action_url column to notifications and workflow_tasks tables.
--
-- These columns exist in the TypeScript types (NotificationRow, WorkflowTaskRow)
-- but were not present in the original schema. The repair-job-setup API omits
-- action_url from its inserts until this migration is applied.
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

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
  and table_name   in ('notifications', 'workflow_tasks')
  and column_name  = 'action_url'
order by table_name;

-- Expected: 2 rows — one for notifications, one for workflow_tasks.
-- Both should show data_type = 'text', is_nullable = 'YES'.
