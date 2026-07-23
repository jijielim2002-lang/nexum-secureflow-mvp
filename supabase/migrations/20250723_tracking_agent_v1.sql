-- =============================================================================
-- Nexum Tracking Intelligence Agent v1 — SQL Migration
-- Run in Supabase SQL Editor
-- =============================================================================

-- ── 1. tracking_records ───────────────────────────────────────────────────────
-- One record per job per tracking type (a job may have both transport + customs).

CREATE TABLE IF NOT EXISTS public.tracking_records (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference       text        NOT NULL,
  tracking_type       text        NOT NULL CHECK (tracking_type IN (
    'Local Transport','Customs Clearance','Courier',
    'Sea Freight','Air Freight','Warehouse','Manual','Other'
  )),
  tracking_number     text,
  carrier_name        text,
  carrier_code        text,
  bl_number           text,
  awb_number          text,
  container_number    text,
  do_number           text,
  customs_form_number text,
  vehicle_number      text,
  driver_name         text,
  provider_company_id uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_company_id uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  current_status      text,
  current_milestone   text,
  status_category     text        NOT NULL DEFAULT 'Pending' CHECK (status_category IN (
    'Pending','Accepted','Pickup Scheduled','Picked Up',
    'In Transit','Customs Processing','Customs Cleared',
    'Out for Delivery','Delivered','POD Uploaded',
    'Completed','Exception','Delayed','Cancelled','Unknown'
  )),
  eta                 timestamptz,
  etd                 timestamptz,
  actual_pickup_at    timestamptz,
  actual_delivery_at  timestamptz,
  last_location       text,
  last_status_at      timestamptz,
  last_synced_at      timestamptz,
  next_sync_at        timestamptz DEFAULT (now() + interval '24 hours'),
  sync_frequency      text        NOT NULL DEFAULT 'Daily',
  tracking_source     text        NOT NULL DEFAULT 'Provider Manual' CHECK (tracking_source IN (
    'Provider Manual','Admin Manual','Document Extraction',
    'External API','Webhook','System'
  )),
  source_confidence   numeric     DEFAULT 1.0,
  remarks             text,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_records_job      ON public.tracking_records(job_reference);
CREATE INDEX IF NOT EXISTS idx_tracking_records_company  ON public.tracking_records(provider_company_id);
CREATE INDEX IF NOT EXISTS idx_tracking_records_customer ON public.tracking_records(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_tracking_records_sync     ON public.tracking_records(next_sync_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tracking_records_category ON public.tracking_records(status_category);

-- ── 2. tracking_events ────────────────────────────────────────────────────────
-- Append-only log of every status change from any source.

CREATE TABLE IF NOT EXISTS public.tracking_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_record_id  uuid        REFERENCES public.tracking_records(id) ON DELETE CASCADE,
  job_reference       text        NOT NULL,
  event_time          timestamptz NOT NULL DEFAULT now(),
  event_status        text        NOT NULL,
  event_description   text,
  event_location      text,
  event_source        text        NOT NULL DEFAULT 'Provider Manual',
  milestone           text,
  raw_payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_record ON public.tracking_events(tracking_record_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_job    ON public.tracking_events(job_reference);
CREATE INDEX IF NOT EXISTS idx_tracking_events_time   ON public.tracking_events(event_time DESC);

-- ── 3. tracking_sync_runs ─────────────────────────────────────────────────────
-- Audit log of every sync attempt (scheduled, webhook, manual).

CREATE TABLE IF NOT EXISTS public.tracking_sync_runs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_record_id  uuid        REFERENCES public.tracking_records(id) ON DELETE CASCADE,
  job_reference       text        NOT NULL,
  sync_type           text        NOT NULL CHECK (sync_type IN (
    'Scheduled Polling','Webhook','Manual Refresh',
    'Provider Reminder','Document Update'
  )),
  provider            text,
  sync_status         text        NOT NULL DEFAULT 'Queued' CHECK (sync_status IN (
    'Queued','Running','Success','Failed','Skipped'
  )),
  started_at          timestamptz,
  completed_at        timestamptz,
  error_message       text,
  raw_response        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_record ON public.tracking_sync_runs(tracking_record_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON public.tracking_sync_runs(sync_status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_created ON public.tracking_sync_runs(created_at DESC);

-- ── 4. tracking_exception_flags ───────────────────────────────────────────────
-- Flags for issues that need attention (delay, no update, POD missing).

CREATE TABLE IF NOT EXISTS public.tracking_exception_flags (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference       text        NOT NULL,
  tracking_record_id  uuid        REFERENCES public.tracking_records(id) ON DELETE CASCADE,
  exception_type      text        NOT NULL CHECK (exception_type IN (
    'No Update','ETA Delayed','Route Mismatch','Customs Delay',
    'Delivery Failed','POD Missing','Status Conflict',
    'Provider No Response','Manual Review Required'
  )),
  severity            text        NOT NULL DEFAULT 'Medium' CHECK (severity IN ('Low','Medium','High','Critical')),
  description         text,
  status              text        NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Review','Resolved','Waived')),
  assigned_to         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exceptions_job    ON public.tracking_exception_flags(job_reference);
CREATE INDEX IF NOT EXISTS idx_exceptions_record ON public.tracking_exception_flags(tracking_record_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON public.tracking_exception_flags(status) WHERE status = 'Open';
CREATE INDEX IF NOT EXISTS idx_exceptions_type   ON public.tracking_exception_flags(exception_type);

-- ── 5. tracking_provider_configs ─────────────────────────────────────────────
-- Config for external tracking API providers. Disabled by default.

CREATE TABLE IF NOT EXISTS public.tracking_provider_configs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name       text        NOT NULL UNIQUE,
  provider_type       text        NOT NULL CHECK (provider_type IN (
    'AfterShip','Ship24','TrackingMore','Carrier Direct','Manual','Other'
  )),
  is_enabled          boolean     NOT NULL DEFAULT false,
  api_key_secret_name text,       -- env var name (never the key itself)
  webhook_secret_name text,
  monthly_limit       integer,
  cost_per_tracking   numeric,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Seed placeholder provider rows (all disabled)
INSERT INTO public.tracking_provider_configs (provider_name, provider_type, is_enabled) VALUES
  ('AfterShip',     'AfterShip',   false),
  ('Ship24',        'Ship24',      false),
  ('TrackingMore',  'TrackingMore',false),
  ('Manual',        'Manual',      true)
ON CONFLICT (provider_name) DO NOTHING;

-- ── 6. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.tracking_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_sync_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_exception_flags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_provider_configs  ENABLE ROW LEVEL SECURITY;

-- tracking_records
CREATE POLICY "tracking_records_admin"
  ON public.tracking_records FOR ALL
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "tracking_records_provider_own"
  ON public.tracking_records FOR ALL
  USING (
    nexum_my_role() = 'service_provider'
    AND provider_company_id = nexum_my_company_id()
  )
  WITH CHECK (
    nexum_my_role() = 'service_provider'
    AND provider_company_id = nexum_my_company_id()
  );

CREATE POLICY "tracking_records_customer_read"
  ON public.tracking_records FOR SELECT
  USING (
    nexum_my_role() = 'customer'
    AND customer_company_id = nexum_my_company_id()
  );

-- tracking_events
CREATE POLICY "tracking_events_admin"
  ON public.tracking_events FOR ALL
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "tracking_events_provider_write"
  ON public.tracking_events FOR INSERT
  WITH CHECK (
    nexum_my_role() IN ('service_provider', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.tracking_records tr
      WHERE tr.id = tracking_record_id
        AND (nexum_is_admin() OR tr.provider_company_id = nexum_my_company_id())
    )
  );

CREATE POLICY "tracking_events_read"
  ON public.tracking_events FOR SELECT
  USING (
    nexum_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tracking_records tr
      WHERE tr.id = tracking_record_id
        AND (
          (nexum_my_role() = 'service_provider' AND tr.provider_company_id = nexum_my_company_id())
          OR (nexum_my_role() = 'customer' AND tr.customer_company_id = nexum_my_company_id())
        )
    )
  );

-- tracking_sync_runs (admin only for raw response; others see summary)
CREATE POLICY "sync_runs_admin"
  ON public.tracking_sync_runs FOR ALL
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "sync_runs_provider_read"
  ON public.tracking_sync_runs FOR SELECT
  USING (nexum_my_role() = 'service_provider');

-- tracking_exception_flags
CREATE POLICY "exceptions_admin"
  ON public.tracking_exception_flags FOR ALL
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "exceptions_provider_read"
  ON public.tracking_exception_flags FOR SELECT
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM public.tracking_records tr
      WHERE tr.id = tracking_record_id
        AND tr.provider_company_id = nexum_my_company_id()
    )
  );

-- tracking_provider_configs (admin only)
CREATE POLICY "provider_configs_admin"
  ON public.tracking_provider_configs FOR ALL
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- ── 7. Helpful view: jobs needing attention ───────────────────────────────────

CREATE OR REPLACE VIEW public.v_tracking_alerts AS
SELECT
  tr.id,
  tr.job_reference,
  tr.tracking_type,
  tr.status_category,
  tr.last_status_at,
  tr.eta,
  tr.next_sync_at,
  EXTRACT(EPOCH FROM (now() - tr.last_status_at)) / 3600 AS hours_since_update,
  CASE
    WHEN tr.last_status_at IS NULL                                    THEN 'Never updated'
    WHEN (now() - tr.last_status_at) > interval '48 hours'           THEN 'No update > 48h'
    WHEN (now() - tr.last_status_at) > interval '24 hours'           THEN 'No update > 24h'
    WHEN tr.eta < now() AND tr.status_category NOT IN
         ('Delivered','POD Uploaded','Completed')                     THEN 'ETA passed'
    WHEN tr.status_category = 'Customs Processing'
         AND (now() - tr.last_status_at) > interval '48 hours'       THEN 'Customs stalled'
    ELSE NULL
  END AS alert_reason,
  ef.open_exceptions,
  tr.provider_company_id,
  tr.customer_company_id
FROM public.tracking_records tr
LEFT JOIN (
  SELECT tracking_record_id, COUNT(*) AS open_exceptions
  FROM public.tracking_exception_flags
  WHERE status = 'Open'
  GROUP BY tracking_record_id
) ef ON ef.tracking_record_id = tr.id
WHERE tr.is_active = true
  AND tr.status_category NOT IN ('Completed','Cancelled');

-- =============================================================================
-- Done. Verify with:
--   SELECT * FROM public.tracking_records LIMIT 5;
--   SELECT * FROM public.v_tracking_alerts;
--   SELECT * FROM public.tracking_provider_configs;
-- =============================================================================
