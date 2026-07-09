-- =============================================================================
-- 010 Customer delivery confirmation columns
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- ── secured_jobs additions ────────────────────────────────────────────────────

ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS customer_confirmed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_confirmation_status text,
  ADD COLUMN IF NOT EXISTS release_blocked              boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_clarification_note  text;

-- ── release_instructions additions ───────────────────────────────────────────

ALTER TABLE public.release_instructions
  ADD COLUMN IF NOT EXISTS release_eligibility_status text,
  ADD COLUMN IF NOT EXISTS customer_confirmed          boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at       timestamptz;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_secured_jobs_customer_confirmation_status
  ON public.secured_jobs (customer_confirmation_status)
  WHERE customer_confirmation_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_secured_jobs_release_blocked
  ON public.secured_jobs (release_blocked)
  WHERE release_blocked = true;
