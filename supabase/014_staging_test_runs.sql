-- Migration 014: Staging Test Runs
-- Stores saved staging deployment test run results and item statuses.

CREATE TABLE IF NOT EXISTS public.staging_test_runs (
  id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  run_label       text,
  final_result    text,        -- 'Staging Passed' | 'Staging Failed' | 'In Progress'
  items           jsonb        NOT NULL DEFAULT '[]',
  total_passed    int          DEFAULT 0,
  total_failed    int          DEFAULT 0,
  total_waived    int          DEFAULT 0,
  total_pending   int          DEFAULT 0,
  tested_by_id    uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  tested_by_name  text,
  tested_by_email text,
  notes           text,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);

ALTER TABLE public.staging_test_runs ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin manages staging_test_runs"
  ON public.staging_test_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Index for most-recent-first queries
CREATE INDEX IF NOT EXISTS idx_staging_test_runs_created_at
  ON public.staging_test_runs (created_at DESC);
