-- =============================================================================
-- add_missing_columns_v4.sql
-- Adds workflow_tasks.source_reference (text) so that human-readable job
-- references like "NSF-1017" can be stored without touching source_id (uuid).
--
-- Root cause: repair-job-setup was putting job_reference text into source_id
-- (a uuid column), triggering PostgreSQL error 22P02:
--   "invalid input syntax for type uuid: NSF-1017"
--
-- Fix pattern:
--   source_id        = null            (uuid — only real UUIDs go here)
--   source_reference = "NSF-1017"      (text — safe for job ref strings)
--   source_type      = "secured_job"   (describes what the source is)
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ─── workflow_tasks.source_reference ─────────────────────────────────────────
alter table public.workflow_tasks
  add column if not exists source_reference text;

-- ─── Also absorb earlier migrations (all idempotent) ─────────────────────────
alter table public.workflow_tasks
  add column if not exists source_id         uuid;     -- was already uuid; no-op if present
alter table public.workflow_tasks
  add column if not exists created_by_system boolean   default false;
alter table public.workflow_tasks
  add column if not exists company_id        uuid      references public.companies(id) on delete set null;
alter table public.workflow_tasks
  add column if not exists action_url        text;
alter table public.notifications
  add column if not exists sent_at           timestamptz;
alter table public.notifications
  add column if not exists delivery_channel  text;
alter table public.notifications
  add column if not exists action_url        text;

-- ─── Verification ─────────────────────────────────────────────────────────────

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workflow_tasks'
  and column_name in (
    'source_id', 'source_reference', 'source_type',
    'created_by_system', 'company_id', 'action_url'
  )
order by column_name;

-- Expected rows for workflow_tasks:
--   action_url        / text             / YES
--   company_id        / uuid             / YES
--   created_by_system / boolean          / YES
--   source_id         / uuid             / YES   ← MUST be uuid, not text
--   source_reference  / text             / YES   ← new — safe for "NSF-1017"
--   source_type       / text             / YES
