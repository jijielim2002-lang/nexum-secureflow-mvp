-- =============================================================================
-- 013 Secured jobs — customer confirmation detail columns
-- Idempotent — safe to run multiple times.
-- All columns use ADD COLUMN IF NOT EXISTS so re-running is always safe.
-- =============================================================================

ALTER TABLE public.secured_jobs
  -- Who confirmed (FK to auth.users — nullable so confirmation never fails if user lookup is unavailable)
  ADD COLUMN IF NOT EXISTS customer_confirmed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Denormalized text copies — survive even if FK user is deleted
  ADD COLUMN IF NOT EXISTS customer_confirmed_by_email  text,
  ADD COLUMN IF NOT EXISTS customer_confirmed_by_name   text,
  -- Optional note the customer writes when confirming
  ADD COLUMN IF NOT EXISTS customer_confirmation_note   text,
  -- Workflow status mirror — some views filter on this field separately
  ADD COLUMN IF NOT EXISTS workflow_status              text;

-- Also add delivery_confirmed_by on secured_jobs if missing
-- (delivery_confirmed_by already exists on delivery_confirmations; this is the secured_jobs copy)
ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for common admin query: find all jobs confirmed by a specific customer user
CREATE INDEX IF NOT EXISTS idx_secured_jobs_customer_confirmed_by
  ON public.secured_jobs (customer_confirmed_by)
  WHERE customer_confirmed_by IS NOT NULL;
