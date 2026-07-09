-- =============================================================================
-- 009 Stability Indexes + disable_optional_modules setting
-- Run once in the Supabase SQL editor.
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- =============================================================================

-- ── Core job-lookup indexes ───────────────────────────────────────────────────

-- secured_jobs: job_reference is usually the PK, but add if missing
CREATE INDEX IF NOT EXISTS idx_secured_jobs_job_reference
  ON public.secured_jobs (job_reference);

-- payment_obligations: FK → secured_jobs.job_reference (most critical)
CREATE INDEX IF NOT EXISTS idx_payment_obligations_job_reference
  ON public.payment_obligations (job_reference);

-- held_payments: FK → secured_jobs.job_reference
CREATE INDEX IF NOT EXISTS idx_held_payments_job_reference
  ON public.held_payments (job_reference);

-- audit_logs: filtered + ordered by created_at — composite index
CREATE INDEX IF NOT EXISTS idx_audit_logs_job_ref_created
  ON public.audit_logs (job_reference, created_at DESC);

-- job_terms_snapshots: FK → secured_jobs.job_reference
CREATE INDEX IF NOT EXISTS idx_job_terms_snapshots_job_reference
  ON public.job_terms_snapshots (job_reference);

-- manual_payment_operations: FK → secured_jobs.job_reference
CREATE INDEX IF NOT EXISTS idx_manual_payment_ops_job_reference
  ON public.manual_payment_operations (job_reference);

-- release_settlements: FK → secured_jobs.job_reference (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'release_settlements'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_release_settlements_job_reference
      ON public.release_settlements (job_reference);
  END IF;
END $$;

-- release_instructions: FK → secured_jobs.job_reference (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'release_instructions'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_release_instructions_job_reference
      ON public.release_instructions (job_reference);
  END IF;
END $$;

-- notifications: job_reference lookup (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'job_reference'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_notifications_job_reference
      ON public.notifications (job_reference);
  END IF;
END $$;

-- workflow_tasks: job_reference lookup (if table + column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workflow_tasks' AND column_name = 'job_reference'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_workflow_tasks_job_reference
      ON public.workflow_tasks (job_reference);
  END IF;
END $$;

-- ── system_settings: disable_optional_modules ─────────────────────────────────

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'disable_optional_modules',
  'false',
  'When true, optional AI/intelligence panels are hidden on job detail pages to improve load performance'
)
ON CONFLICT (key) DO NOTHING;
