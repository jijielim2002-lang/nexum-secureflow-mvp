-- ─────────────────────────────────────────────────────────────────────────────
-- CREATE shipment_trackings + shipment_events
-- Run this in Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. shipment_trackings
CREATE TABLE IF NOT EXISTS shipment_trackings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference         TEXT NOT NULL,

  -- Transport
  transport_mode        TEXT,
  tracking_status       TEXT DEFAULT 'Pending',

  -- Sea freight fields
  bl_number             TEXT,
  booking_number        TEXT,
  container_number      TEXT,
  seal_number           TEXT,
  shipping_line         TEXT,
  vessel_name           TEXT,
  voyage_number         TEXT,
  port_of_loading       TEXT,
  port_of_discharge     TEXT,
  transshipment_port    TEXT,

  -- Air freight fields
  awb_number            TEXT,
  mawb_number           TEXT,
  hawb_number           TEXT,
  airline               TEXT,
  flight_number         TEXT,
  origin_airport        TEXT,
  destination_airport   TEXT,

  -- Road fields
  trucker_name          TEXT,
  vehicle_plate         TEXT,
  driver_name           TEXT,
  pickup_location       TEXT,
  delivery_location     TEXT,

  -- Timing
  etd                   TEXT,
  eta                   TEXT,
  actual_departure      TEXT,
  actual_arrival        TEXT,
  last_event_time       TEXT,
  delay_days            INTEGER DEFAULT 0,
  delay_impact_level    TEXT,

  -- Visibility
  latest_event          TEXT,
  latest_location       TEXT,
  next_expected_event   TEXT,
  data_source           TEXT,
  api_reference         TEXT,
  confidence_score      NUMERIC,
  remarks               TEXT,

  -- Audit
  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- 2. shipment_events
CREATE TABLE IF NOT EXISTS shipment_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_tracking_id  UUID REFERENCES shipment_trackings(id) ON DELETE CASCADE,
  job_reference         TEXT NOT NULL,
  event_type            TEXT,
  event_status          TEXT,
  event_location        TEXT,
  event_time            TEXT,
  source                TEXT,
  description           TEXT,
  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for fast job lookups
CREATE INDEX IF NOT EXISTS idx_shipment_trackings_job ON shipment_trackings(job_reference);
CREATE INDEX IF NOT EXISTS idx_shipment_events_job    ON shipment_events(job_reference);
CREATE INDEX IF NOT EXISTS idx_shipment_events_tid    ON shipment_events(shipment_tracking_id);

-- 4. RLS — enable and allow anon role full access
--    (workaround until SUPABASE_SERVICE_ROLE_KEY is set correctly in .env.local)
ALTER TABLE shipment_trackings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_service_anon_writes" ON shipment_trackings;
DROP POLICY IF EXISTS "allow_service_anon_writes" ON shipment_events;

CREATE POLICY "allow_service_anon_writes" ON shipment_trackings
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_service_anon_writes" ON shipment_events
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Also allow authenticated users (for admin/provider panels)
DROP POLICY IF EXISTS "allow_authenticated_writes" ON shipment_trackings;
DROP POLICY IF EXISTS "allow_authenticated_writes" ON shipment_events;

CREATE POLICY "allow_authenticated_writes" ON shipment_trackings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_authenticated_writes" ON shipment_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Confirm
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('shipment_trackings', 'shipment_events');
