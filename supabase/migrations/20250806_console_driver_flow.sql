-- ============================================================
-- Console Transport — Driver Flow v1
-- Driver sessions, GPS pings, POD fields
-- ============================================================

-- 1. Driver sessions (token-based, no Supabase auth needed)
CREATE TABLE IF NOT EXISTS public.console_driver_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id  uuid NOT NULL REFERENCES public.console_supplier_drivers(id) ON DELETE CASCADE,
  token      text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  vehicle_number text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz DEFAULT now()
);

-- 2. GPS location pings
CREATE TABLE IF NOT EXISTS public.console_slot_location_pings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id        uuid NOT NULL REFERENCES public.console_route_slots(id) ON DELETE CASCADE,
  driver_id      uuid REFERENCES public.console_supplier_drivers(id),
  latitude       numeric(10,7) NOT NULL,
  longitude      numeric(10,7) NOT NULL,
  accuracy_m     numeric,
  recorded_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_location_pings_slot ON public.console_slot_location_pings(slot_id, recorded_at DESC);

-- 3. POD fields on parcels
ALTER TABLE public.console_parcels
  ADD COLUMN IF NOT EXISTS pod_recipient_name text,
  ADD COLUMN IF NOT EXISTS pod_recipient_ic   text,
  ADD COLUMN IF NOT EXISTS pod_signature_url  text,
  ADD COLUMN IF NOT EXISTS pod_photo_url      text,
  ADD COLUMN IF NOT EXISTS pod_collected_at   timestamptz,
  ADD COLUMN IF NOT EXISTS scan_photo_url     text,   -- photo taken by driver at origin scan
  ADD COLUMN IF NOT EXISTS scanned_at_origin  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS scanned_at_dest    boolean DEFAULT false;

-- 4. Extend parcel_status for POD
DO $$
BEGIN
  ALTER TABLE public.console_parcels
    DROP CONSTRAINT IF EXISTS console_parcels_parcel_status_check;
  ALTER TABLE public.console_parcels
    ADD CONSTRAINT console_parcels_parcel_status_check
    CHECK (parcel_status IN (
      'Booking Created','Payment Verified','Label Generated',
      'Received at Origin Warehouse','Loaded to Driver','In Transit',
      'Arrived at Destination Warehouse','Ready for Collection','Completed',
      'Exception','Cancelled'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 5. RLS: driver sessions are service-role only
ALTER TABLE public.console_driver_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_slot_location_pings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_driver_sessions" ON public.console_driver_sessions USING (false);
CREATE POLICY "service_only_location_pings"  ON public.console_slot_location_pings USING (false);
