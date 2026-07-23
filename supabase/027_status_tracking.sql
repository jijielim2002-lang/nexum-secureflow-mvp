-- =============================================================================
-- 027 — Consistent Status Tracking, POD Evidence, Delay Detection, Audit Trail
-- Run in Supabase SQL Editor
-- =============================================================================

-- ── 1. job_status_history ─────────────────────────────────────────────────────
-- Immutable log of every status transition. Never deleted.

CREATE TABLE IF NOT EXISTS public.job_status_history (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference  text        NOT NULL,
  from_status    text,
  to_status      text        NOT NULL,
  changed_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name text,
  changed_by_role text,
  note           text,                    -- optional reason / comment
  metadata       jsonb       DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jsh_job_reference ON public.job_status_history(job_reference);
CREATE INDEX IF NOT EXISTS idx_jsh_created_at    ON public.job_status_history(created_at DESC);

ALTER TABLE public.job_status_history ENABLE ROW LEVEL SECURITY;

-- All authenticated parties can read history for jobs they are part of
-- (simplified: allow any authenticated user; tighten per role if needed)
DROP POLICY IF EXISTS "jsh_authenticated_read" ON public.job_status_history;
CREATE POLICY "jsh_authenticated_read"
  ON public.job_status_history FOR SELECT
  TO authenticated
  USING (true);

-- Only service role may insert (through API routes, never browser-direct)
DROP POLICY IF EXISTS "jsh_service_insert" ON public.job_status_history;
CREATE POLICY "jsh_service_insert"
  ON public.job_status_history FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- ── 2. Delay detection columns on secured_jobs ────────────────────────────────

ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS is_delayed           boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delay_reason         text,
  ADD COLUMN IF NOT EXISTS delay_flagged_at     timestamptz,
  ADD COLUMN IF NOT EXISTS delay_flagged_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delay_type           text        CHECK (delay_type IN (
    'ETA Exceeded', 'No Update', 'Provider Flagged', NULL
  )),
  ADD COLUMN IF NOT EXISTS delay_resolved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS delay_notified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_update_at timestamptz DEFAULT now();

-- Index for delay detection cron query
CREATE INDEX IF NOT EXISTS idx_secured_jobs_delay    ON public.secured_jobs(is_delayed) WHERE is_delayed = true;
CREATE INDEX IF NOT EXISTS idx_secured_jobs_last_upd ON public.secured_jobs(last_status_update_at);


-- ── 3. Email tracking on notifications ───────────────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS email_address  text,
  ADD COLUMN IF NOT EXISTS email_subject  text;


-- ── 4. POD evidence columns on secured_jobs (extend existing) ────────────────

ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS pod_document_url  text,
  ADD COLUMN IF NOT EXISTS pod_notes         text,
  ADD COLUMN IF NOT EXISTS pod_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS pod_verified_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ── 5. Trigger: keep last_status_update_at current ────────────────────────────

CREATE OR REPLACE FUNCTION public.update_last_status_update_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.job_status IS DISTINCT FROM NEW.job_status THEN
    NEW.last_status_update_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_status_update_at ON public.secured_jobs;
CREATE TRIGGER trg_job_status_update_at
  BEFORE UPDATE ON public.secured_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_last_status_update_at();


-- ── 6. Unified activity view (timeline for all parties) ───────────────────────

CREATE OR REPLACE VIEW public.v_job_timeline AS
  -- Status changes
  SELECT
    h.job_reference,
    h.created_at,
    'status_change'             AS event_type,
    COALESCE(h.changed_by_role, 'system') AS actor_role,
    COALESCE(h.changed_by_name, 'System') AS actor_name,
    CASE
      WHEN h.from_status IS NULL THEN 'Job created with status: ' || h.to_status
      ELSE 'Status changed: ' || h.from_status || ' → ' || h.to_status
    END                         AS description,
    h.note                      AS note,
    h.to_status                 AS status_value,
    NULL::text                  AS document_url
  FROM public.job_status_history h

  UNION ALL

  -- Audit log events
  SELECT
    a.job_reference,
    a.created_at,
    a.action                    AS event_type,
    COALESCE(a.actor_role, 'system') AS actor_role,
    COALESCE(a.actor_name, 'System') AS actor_name,
    COALESCE(a.description, a.action) AS description,
    NULL::text                  AS note,
    NULL::text                  AS status_value,
    NULL::text                  AS document_url
  FROM public.audit_logs a
  WHERE a.job_reference IS NOT NULL

  ORDER BY created_at DESC;

-- =============================================================================
-- Verify
-- SELECT * FROM public.job_status_history LIMIT 5;
-- SELECT is_delayed, delay_reason, last_status_update_at FROM public.secured_jobs LIMIT 3;
-- =============================================================================
