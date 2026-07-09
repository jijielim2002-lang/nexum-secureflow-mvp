-- =============================================================================
-- 011 Delivery Confirmation Automation
-- Adds auto-confirmation columns to secured_jobs and delivery_confirmation_events table.
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- ── secured_jobs additions ────────────────────────────────────────────────────
-- 010 already added: customer_confirmed_at, customer_confirmed_by,
--   customer_confirmation_status, release_blocked, customer_clarification_note

ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS pod_uploaded_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmation_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmation_method      text,
  ADD COLUMN IF NOT EXISTS auto_confirmation_eligible        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_confirmed_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_reminder_1_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_reminder_2_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_final_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_status                    text NOT NULL DEFAULT 'None';

-- Back-fill customer_confirmation_status default where null (from 010 which had no DEFAULT)
UPDATE public.secured_jobs
   SET customer_confirmation_status = 'Pending'
 WHERE customer_confirmation_status IS NULL
   AND current_milestone ILIKE '%pod uploaded%'
   AND current_milestone ILIKE '%awaiting customer confirmation%';

-- ── delivery_confirmation_events ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.delivery_confirmation_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference    text NOT NULL,
  event_type       text NOT NULL,
  -- event_type values:
  --   pod_uploaded | reminder_1_sent | reminder_2_sent | final_reminder_sent
  --   customer_confirmed | customer_disputed | customer_clarified
  --   auto_confirmed | admin_extended | admin_paused | admin_resumed
  actor_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name       text,
  actor_role       text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dce_job_reference
  ON public.delivery_confirmation_events (job_reference, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dce_event_type
  ON public.delivery_confirmation_events (event_type);

-- ── Indexes for auto-confirm sweep ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_secured_jobs_auto_confirm_sweep
  ON public.secured_jobs (customer_confirmation_status, auto_confirmation_eligible, customer_confirmation_deadline_at)
  WHERE customer_confirmation_status = 'Pending'
    AND auto_confirmation_eligible = true
    AND release_blocked = false;

CREATE INDEX IF NOT EXISTS idx_secured_jobs_dispute_status
  ON public.secured_jobs (dispute_status)
  WHERE dispute_status <> 'None';

-- ── RLS for delivery_confirmation_events ─────────────────────────────────────

ALTER TABLE public.delivery_confirmation_events ENABLE ROW LEVEL SECURITY;

-- Admin can read all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'delivery_confirmation_events'
      AND policyname = 'admin_read_dce'
  ) THEN
    EXECUTE $p$
      CREATE POLICY admin_read_dce ON public.delivery_confirmation_events
        FOR SELECT USING (nexum_is_admin())
    $p$;
  END IF;
END $$;

-- Service role bypass (API routes) — handled by createClient with service_role key

COMMENT ON TABLE public.delivery_confirmation_events IS
  'Audit trail for every delivery confirmation lifecycle event (POD upload, reminders, auto-confirm, disputes, admin overrides).';
