-- ============================================================
-- Nexum Console Transport v2 Migration
-- Extends v1 schema with:
--   • Next-Day Economy service type
--   • Supplier onboarding: profiles, vehicles, drivers
--   • Updated parcel statuses & payment flow
--   • Updated wallet transaction types
--   • Full RLS on new tables
--   • Seed data delta
-- Safe to run on top of v1 (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. UPDATE console_warehouses — add operating_days, open_time, close_time
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.console_warehouses
  ADD COLUMN IF NOT EXISTS open_time        time    DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS close_time       time    DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS operating_days   text[]  DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  ADD COLUMN IF NOT EXISTS contact_name     text,
  ADD COLUMN IF NOT EXISTS contact_phone    text,
  ADD COLUMN IF NOT EXISTS postcode         text,
  ADD COLUMN IF NOT EXISTS country          text    DEFAULT 'Malaysia',
  ADD COLUMN IF NOT EXISTS status           text    CHECK (status IN ('Active','Inactive')) DEFAULT 'Active';

-- Backfill open/close from old columns if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='console_warehouses'
      AND column_name='operating_hours_open'
  ) THEN
    UPDATE public.console_warehouses
    SET open_time  = operating_hours_open::time,
        close_time = operating_hours_close::time
    WHERE open_time IS NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. UPDATE console_routes — Next-Day Economy fields
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.console_routes
  ADD COLUMN IF NOT EXISTS same_day_enabled              boolean  DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_day_enabled              boolean  DEFAULT true,
  ADD COLUMN IF NOT EXISTS same_day_price_per_carton     numeric  DEFAULT 50,
  ADD COLUMN IF NOT EXISTS next_day_price_per_kg         numeric  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_day_minimum_charge       numeric  DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_pallet_weight_kg          numeric  DEFAULT 750,
  ADD COLUMN IF NOT EXISTS supplier_pallet_benchmark_cost numeric DEFAULT 450,
  ADD COLUMN IF NOT EXISTS status                        text     CHECK (status IN ('Active','Inactive')) DEFAULT 'Active';

-- ─────────────────────────────────────────────────────────────
-- 3. UPDATE console_route_slots — service type, vehicle/driver links
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.console_route_slots
  ADD COLUMN IF NOT EXISTS service_type       text CHECK (service_type IN ('Same-Day Express','Next-Day Economy')) DEFAULT 'Same-Day Express',
  ADD COLUMN IF NOT EXISTS vehicle_id         uuid,
  ADD COLUMN IF NOT EXISTS max_parcels        integer,
  ADD COLUMN IF NOT EXISTS max_weight_kg      numeric,
  ADD COLUMN IF NOT EXISTS booked_parcels     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booked_weight_kg   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_departure_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_arrival_at  timestamptz;

-- Extend slot_status check to include Missed
DO $$
BEGIN
  ALTER TABLE public.console_route_slots
    DROP CONSTRAINT IF EXISTS console_route_slots_slot_status_check;
  ALTER TABLE public.console_route_slots
    ADD CONSTRAINT console_route_slots_slot_status_check
    CHECK (slot_status IN ('Open','Booked','Assigned','In Progress','Completed','Cancelled','Missed'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. UPDATE console_parcels — full status set, Next-Day fields
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.console_parcels
  ADD COLUMN IF NOT EXISTS service_type           text CHECK (service_type IN ('Same-Day Express','Next-Day Economy')) DEFAULT 'Same-Day Express',
  ADD COLUMN IF NOT EXISTS pallet_count           integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pallet_weight_kg       numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chargeable_weight_kg   numeric,
  ADD COLUMN IF NOT EXISTS currency               text    DEFAULT 'MYR',
  ADD COLUMN IF NOT EXISTS label_printed          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_code_value          text,
  ADD COLUMN IF NOT EXISTS barcode_value          text,
  ADD COLUMN IF NOT EXISTS special_handling_note  text,
  ADD COLUMN IF NOT EXISTS whatsapp_number        text,
  ADD COLUMN IF NOT EXISTS payment_proof_url      text;

-- Extend parcel_status and payment_status enums
DO $$
BEGIN
  ALTER TABLE public.console_parcels
    DROP CONSTRAINT IF EXISTS console_parcels_parcel_status_check;
  ALTER TABLE public.console_parcels
    ADD CONSTRAINT console_parcels_parcel_status_check
    CHECK (parcel_status IN (
      'Booking Created','Payment Pending','Payment Verified','Label Generated',
      'Received at Origin Warehouse','Assigned to Slot','Loaded to Driver',
      'In Transit','Arrived at Destination Warehouse','Ready for Collection',
      'Completed','Exception','Cancelled'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.console_parcels
    DROP CONSTRAINT IF EXISTS console_parcels_payment_status_check;
  ALTER TABLE public.console_parcels
    ADD CONSTRAINT console_parcels_payment_status_check
    CHECK (payment_status IN ('Pending','Payment Proof Uploaded','Verified','Refunded','Cancelled'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. UPDATE console_parcel_events — new event types
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.console_parcel_events
    DROP CONSTRAINT IF EXISTS console_parcel_events_event_type_check;
  ALTER TABLE public.console_parcel_events
    ADD CONSTRAINT console_parcel_events_event_type_check
    CHECK (event_type IN (
      'Booking Created','Payment Proof Uploaded','Payment Verified','Label Printed',
      'Origin Scan In','Assigned to Slot','Driver Pickup Scan','Driver Departed',
      'GPS Update','Destination Scan In','POD Uploaded','Ready for Collection',
      'Completed','Exception','WhatsApp Message Created','WhatsApp Sent'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. UPDATE console_wallet_transactions — extended transaction types
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.console_wallet_transactions
    DROP CONSTRAINT IF EXISTS console_wallet_transactions_transaction_type_check;
  ALTER TABLE public.console_wallet_transactions
    ADD CONSTRAINT console_wallet_transactions_transaction_type_check
    CHECK (transaction_type IN (
      'Top Up','Parcel Payment','Refund',
      'Supplier Earning Pending','Supplier Earning Released',
      'Withdrawal Request','Withdrawal Paid','Withdrawal Surcharge',
      'Processing Fee','Commission','Adjustment'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 7. NEW TABLE: console_supplier_profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_supplier_profiles (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_type                 text CHECK (supplier_type IN ('Individual','Company')) DEFAULT 'Company',
  -- APAD
  apad_licence_number           text,
  apad_licence_document_url     text,
  apad_expiry_date              date,
  apad_status                   text CHECK (apad_status IN ('Pending','Submitted','Approved','Rejected','Expired')) DEFAULT 'Pending',
  -- SSM
  ssm_number                    text,
  ssm_document_url              text,
  -- Bank
  payout_bank_name              text,
  payout_bank_account_masked    text,
  payout_account_holder         text,
  -- Review
  approval_status               text CHECK (approval_status IN (
    'Registered','Documents Submitted','Under Review',
    'Approved','Active','Suspended','Rejected','Blacklisted'
  )) DEFAULT 'Registered',
  reviewed_by                   uuid REFERENCES auth.users(id),
  reviewed_at                   timestamptz,
  review_note                   text,
  -- Meta
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS console_supplier_profiles_company_idx
  ON public.console_supplier_profiles(company_id);

-- ─────────────────────────────────────────────────────────────
-- 8. NEW TABLE: console_supplier_vehicles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_supplier_vehicles (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_company_id              uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_number                   text NOT NULL,
  vehicle_type                     text,                -- Van, Lorry, etc.
  vehicle_size                     text,                -- 1-ton, 3-ton, etc.
  -- Permit
  vehicle_permit_number            text,
  vehicle_permit_document_url      text,
  permit_expiry_date               date,
  -- Registration / VOC
  vehicle_registration_document_url text,
  -- Road tax
  road_tax_document_url            text,
  road_tax_expiry_date             date,
  -- Insurance
  insurance_document_url           text,
  insurance_expiry_date            date,
  -- Photos
  vehicle_photo_url                text,
  -- Approval
  approval_status                  text CHECK (approval_status IN (
    'Submitted','Permit Review','Insurance Review',
    'Approved','Active','Expired','Suspended','Rejected'
  )) DEFAULT 'Submitted',
  reviewed_by                      uuid REFERENCES auth.users(id),
  reviewed_at                      timestamptz,
  review_note                      text,
  created_at                       timestamptz DEFAULT now(),
  updated_at                       timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 9. NEW TABLE: console_supplier_drivers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_supplier_drivers (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_company_id           uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id                       uuid REFERENCES auth.users(id),
  driver_name                   text NOT NULL,
  driver_phone                  text,
  driver_ic_masked              text,
  -- Driving licence
  driving_licence_number        text,
  driving_licence_document_url  text,
  driving_licence_expiry_date   date,
  -- Photo
  driver_photo_url              text,
  -- Approval
  approval_status               text CHECK (approval_status IN (
    'Submitted','Licence Review','Approved','Active','Suspended','Rejected'
  )) DEFAULT 'Submitted',
  reviewed_by                   uuid REFERENCES auth.users(id),
  reviewed_at                   timestamptz,
  review_note                   text,
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 10. UPDATE console_supplier_ratings
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.console_supplier_ratings
  ADD COLUMN IF NOT EXISTS pod_quality_score    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_rating      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_calculated_at   timestamptz DEFAULT now();

-- ─────────────────────────────────────────────────────────────
-- 11. UPDATED TRIGGERS
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'console_supplier_profiles','console_supplier_vehicles','console_supplier_drivers'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%s', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%s
       FOR EACH ROW EXECUTE FUNCTION public.console_set_updated_at()', t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 12. HELPER FUNCTIONS (pricing)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_calculate_price(
  p_service_type  text,
  p_parcel_count  integer,
  p_weight_kg     numeric,
  p_route_id      uuid
) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
  v_route  public.console_routes%rowtype;
  v_price  numeric;
BEGIN
  SELECT * INTO v_route FROM public.console_routes WHERE id = p_route_id;
  IF p_service_type = 'Same-Day Express' THEN
    v_price := COALESCE(v_route.same_day_price_per_carton, 50) * p_parcel_count;
  ELSE
    -- Next-Day Economy: max(weight × rate, min charge)
    v_price := GREATEST(
      p_weight_kg * COALESCE(v_route.next_day_price_per_kg, 1),
      COALESCE(v_route.next_day_minimum_charge, 50)
    );
  END IF;
  RETURN v_price;
END; $$;

-- ─────────────────────────────────────────────────────────────
-- 13. RLS on new tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.console_supplier_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_supplier_vehicles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_supplier_drivers   ENABLE ROW LEVEL SECURITY;

-- Supplier profiles ─ admin sees all; provider sees own
DROP POLICY IF EXISTS "console_supplier_profiles_admin_all"   ON public.console_supplier_profiles;
DROP POLICY IF EXISTS "console_supplier_profiles_provider_own" ON public.console_supplier_profiles;
DROP POLICY IF EXISTS "console_supplier_profiles_provider_insert" ON public.console_supplier_profiles;

CREATE POLICY "console_supplier_profiles_admin_all"
  ON public.console_supplier_profiles FOR ALL
  USING (public.nexum_is_admin());

CREATE POLICY "console_supplier_profiles_provider_own"
  ON public.console_supplier_profiles FOR SELECT
  USING (company_id = public.nexum_my_company_id());

CREATE POLICY "console_supplier_profiles_provider_insert"
  ON public.console_supplier_profiles FOR INSERT
  WITH CHECK (company_id = public.nexum_my_company_id());

CREATE POLICY "console_supplier_profiles_provider_update"
  ON public.console_supplier_profiles FOR UPDATE
  USING (
    company_id = public.nexum_my_company_id()
    AND approval_status IN ('Registered','Documents Submitted')
  );

-- Vehicles ─ same pattern
DROP POLICY IF EXISTS "console_supplier_vehicles_admin_all"   ON public.console_supplier_vehicles;
DROP POLICY IF EXISTS "console_supplier_vehicles_provider_own" ON public.console_supplier_vehicles;
DROP POLICY IF EXISTS "console_supplier_vehicles_provider_insert" ON public.console_supplier_vehicles;

CREATE POLICY "console_supplier_vehicles_admin_all"
  ON public.console_supplier_vehicles FOR ALL
  USING (public.nexum_is_admin());

CREATE POLICY "console_supplier_vehicles_provider_own"
  ON public.console_supplier_vehicles FOR SELECT
  USING (supplier_company_id = public.nexum_my_company_id());

CREATE POLICY "console_supplier_vehicles_provider_insert"
  ON public.console_supplier_vehicles FOR INSERT
  WITH CHECK (supplier_company_id = public.nexum_my_company_id());

CREATE POLICY "console_supplier_vehicles_provider_update"
  ON public.console_supplier_vehicles FOR UPDATE
  USING (
    supplier_company_id = public.nexum_my_company_id()
    AND approval_status = 'Submitted'
  );

-- Drivers ─ same pattern
DROP POLICY IF EXISTS "console_supplier_drivers_admin_all"    ON public.console_supplier_drivers;
DROP POLICY IF EXISTS "console_supplier_drivers_provider_own"  ON public.console_supplier_drivers;
DROP POLICY IF EXISTS "console_supplier_drivers_provider_insert" ON public.console_supplier_drivers;

CREATE POLICY "console_supplier_drivers_admin_all"
  ON public.console_supplier_drivers FOR ALL
  USING (public.nexum_is_admin());

CREATE POLICY "console_supplier_drivers_provider_own"
  ON public.console_supplier_drivers FOR SELECT
  USING (supplier_company_id = public.nexum_my_company_id());

CREATE POLICY "console_supplier_drivers_provider_insert"
  ON public.console_supplier_drivers FOR INSERT
  WITH CHECK (supplier_company_id = public.nexum_my_company_id());

CREATE POLICY "console_supplier_drivers_provider_update"
  ON public.console_supplier_drivers FOR UPDATE
  USING (
    supplier_company_id = public.nexum_my_company_id()
    AND approval_status = 'Submitted'
  );

-- ─────────────────────────────────────────────────────────────
-- 14. SEED DATA DELTA (idempotent)
-- ─────────────────────────────────────────────────────────────

-- Warehouses (upsert on warehouse_code)
INSERT INTO public.console_warehouses (
  warehouse_code, warehouse_name, city, state, full_address, postcode,
  open_time, close_time, status
)
VALUES
  ('WH-PG', 'Nexum Penang Warehouse',       'George Town', 'Penang',          '1 Jalan Bukit Gambir, 10350 George Town, Penang',       '10350', '10:00', '19:00', 'Active'),
  ('WH-KL', 'Nexum Kuala Lumpur Warehouse',  'Kuala Lumpur','Kuala Lumpur',    '12 Jalan Kelang Lama, 58000 Kuala Lumpur',              '58000', '10:00', '19:00', 'Active'),
  ('WH-JB', 'Nexum Johor Bahru Warehouse',   'Johor Bahru', 'Johor',           '5 Jalan Tun Abdul Razak, 80000 Johor Bahru, Johor',     '80000', '10:00', '19:00', 'Active')
ON CONFLICT (warehouse_code) DO UPDATE SET
  open_time  = EXCLUDED.open_time,
  close_time = EXCLUDED.close_time,
  status     = EXCLUDED.status;

-- Routes (upsert on route_code)
INSERT INTO public.console_routes (
  route_code, origin_city, destination_city,
  origin_warehouse_id, destination_warehouse_id,
  max_transit_hours,
  same_day_enabled, next_day_enabled,
  same_day_price_per_carton, next_day_price_per_kg, next_day_minimum_charge,
  max_pallet_weight_kg, supplier_pallet_benchmark_cost,
  minimum_supplier_trip_payout,
  status
)
SELECT
  r.route_code, r.origin_city, r.destination_city,
  o.id AS origin_warehouse_id,
  d.id AS destination_warehouse_id,
  r.max_transit_hours,
  true, true,
  50, 1, 50,
  750, 450,
  200,
  'Active'
FROM (VALUES
  ('PG-KL', 'Penang',       'Kuala Lumpur', 'WH-PG', 'WH-KL', 6),
  ('KL-PG', 'Kuala Lumpur', 'Penang',       'WH-KL', 'WH-PG', 6),
  ('KL-JB', 'Kuala Lumpur', 'Johor Bahru',  'WH-KL', 'WH-JB', 5),
  ('JB-KL', 'Johor Bahru',  'Kuala Lumpur', 'WH-JB', 'WH-KL', 5)
) AS r(route_code, origin_city, destination_city, origin_code, dest_code, max_transit_hours)
JOIN public.console_warehouses o ON o.warehouse_code = r.origin_code
JOIN public.console_warehouses d ON d.warehouse_code = r.dest_code
ON CONFLICT (route_code) DO UPDATE SET
  max_transit_hours           = EXCLUDED.max_transit_hours,
  same_day_enabled            = EXCLUDED.same_day_enabled,
  next_day_enabled            = EXCLUDED.next_day_enabled,
  same_day_price_per_carton        = EXCLUDED.same_day_price_per_carton,
  next_day_price_per_kg            = EXCLUDED.next_day_price_per_kg,
  next_day_minimum_charge          = EXCLUDED.next_day_minimum_charge,
  max_pallet_weight_kg             = EXCLUDED.max_pallet_weight_kg,
  supplier_pallet_benchmark_cost   = EXCLUDED.supplier_pallet_benchmark_cost,
  minimum_supplier_trip_payout     = EXCLUDED.minimum_supplier_trip_payout,
  status                           = EXCLUDED.status;

-- Same-Day Express slots for the next 7 days (idempotent via slot_reference)
-- Slot ref pattern: SDE-<ROUTECODE>-<YYYYMMDD>-<HHMM>
DO $$
DECLARE
  v_date      date;
  v_slot_date date;
  v_route     record;
  v_times     text[];
  v_t         text;
  v_ref       text;
  v_arr       time;
BEGIN
  FOR v_slot_date IN SELECT generate_series(current_date, current_date + 6, '1 day'::interval)::date LOOP
    -- Skip Sundays (dow = 0)
    IF EXTRACT(DOW FROM v_slot_date) = 0 THEN CONTINUE; END IF;

    FOR v_route IN
      SELECT r.*, o.close_time AS origin_close
      FROM public.console_routes r
      JOIN public.console_warehouses o ON o.id = r.origin_warehouse_id
      WHERE r.same_day_enabled = true AND r.status = 'Active'
    LOOP
      -- PG↔KL: 10,11,12  KL↔JB / JB↔KL: 10,11,12,13
      IF v_route.route_code IN ('PG-KL','KL-PG') THEN
        v_times := ARRAY['10:00','11:00','12:00'];
      ELSE
        v_times := ARRAY['10:00','11:00','12:00','13:00'];
      END IF;

      FOREACH v_t IN ARRAY v_times LOOP
        -- Ensure arrival before warehouse closes
        v_arr := (v_t::time + (v_route.max_transit_hours || ' hours')::interval)::time;
        IF v_arr > v_route.origin_close THEN CONTINUE; END IF;

        v_ref := 'SDE-' || v_route.route_code || '-'
                 || to_char(v_slot_date,'YYYYMMDD') || '-'
                 || replace(v_t,':','');

        INSERT INTO public.console_route_slots (
          slot_reference, route_id, service_type,
          slot_date, departure_time, expected_arrival_time,
          same_day_arrival, slot_status
        ) VALUES (
          v_ref, v_route.id, 'Same-Day Express',
          v_slot_date, v_t::time, v_arr,
          true, 'Open'
        )
        ON CONFLICT (slot_reference) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 15. FUNCTION: generate next 7 days Same-Day Express slots
--     (call daily via pg_cron or admin trigger)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_generate_weekly_slots()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count     integer := 0;
  v_slot_date date;
  v_route     record;
  v_times     text[];
  v_t         text;
  v_ref       text;
  v_arr       time;
BEGIN
  FOR v_slot_date IN SELECT generate_series(current_date, current_date + 6, '1 day'::interval)::date LOOP
    IF EXTRACT(DOW FROM v_slot_date) = 0 THEN CONTINUE; END IF;
    FOR v_route IN
      SELECT r.*, o.close_time AS origin_close
      FROM public.console_routes r
      JOIN public.console_warehouses o ON o.id = r.origin_warehouse_id
      WHERE r.same_day_enabled = true AND r.status = 'Active'
    LOOP
      IF v_route.route_code IN ('PG-KL','KL-PG') THEN
        v_times := ARRAY['10:00','11:00','12:00'];
      ELSE
        v_times := ARRAY['10:00','11:00','12:00','13:00'];
      END IF;
      FOREACH v_t IN ARRAY v_times LOOP
        v_arr := (v_t::time + (v_route.max_transit_hours || ' hours')::interval)::time;
        IF v_arr > v_route.origin_close THEN CONTINUE; END IF;
        v_ref := 'SDE-' || v_route.route_code || '-'
                 || to_char(v_slot_date,'YYYYMMDD') || '-'
                 || replace(v_t,':','');
        INSERT INTO public.console_route_slots (
          slot_reference, route_id, service_type,
          slot_date, departure_time, expected_arrival_time,
          same_day_arrival, slot_status
        ) VALUES (
          v_ref, v_route.id, 'Same-Day Express',
          v_slot_date, v_t::time, v_arr, true, 'Open'
        )
        ON CONFLICT (slot_reference) DO NOTHING;
        v_count := v_count + 1;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN v_count;
END; $$;

-- ─────────────────────────────────────────────────────────────
-- 16. FUNCTION: create Next-Day Economy consolidation slot
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_get_or_create_nde_slot(
  p_route_id  uuid,
  p_drop_date date   -- date customer drops off
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slot_date date;
  v_ref       text;
  v_slot_id   uuid;
  v_route     public.console_routes%rowtype;
BEGIN
  SELECT * INTO v_route FROM public.console_routes WHERE id = p_route_id;

  -- Next business day (skip Sunday)
  v_slot_date := p_drop_date + 1;
  WHILE EXTRACT(DOW FROM v_slot_date) = 0 LOOP
    v_slot_date := v_slot_date + 1;
  END LOOP;

  v_ref := 'NDE-' || v_route.route_code || '-' || to_char(v_slot_date,'YYYYMMDD');

  -- Try to find existing open/booked NDE slot for that date+route
  SELECT id INTO v_slot_id
  FROM public.console_route_slots
  WHERE route_id = p_route_id
    AND service_type = 'Next-Day Economy'
    AND slot_date = v_slot_date
    AND slot_status IN ('Open','Booked')
  LIMIT 1;

  IF v_slot_id IS NULL THEN
    INSERT INTO public.console_route_slots (
      slot_reference, route_id, service_type,
      slot_date, departure_time, expected_arrival_time,
      same_day_arrival, slot_status
    ) VALUES (
      v_ref, p_route_id, 'Next-Day Economy',
      v_slot_date, '08:00'::time,
      ('08:00'::time + (v_route.max_transit_hours || ' hours')::interval)::time,
      false, 'Open'
    )
    RETURNING id INTO v_slot_id;
  END IF;

  RETURN v_slot_id;
END; $$;

-- ─────────────────────────────────────────────────────────────
-- 17. FUNCTION: validate supplier can book (profile + vehicle + driver Active)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_supplier_can_book(
  p_company_id uuid,
  p_vehicle_id uuid DEFAULT NULL,
  p_driver_id  uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT (sp.approval_status IN ('Approved','Active')) INTO v_ok
  FROM public.console_supplier_profiles sp
  WHERE sp.company_id = p_company_id;
  IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;

  IF p_vehicle_id IS NOT NULL THEN
    SELECT (approval_status IN ('Approved','Active')) INTO v_ok
    FROM public.console_supplier_vehicles WHERE id = p_vehicle_id;
    IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  END IF;

  IF p_driver_id IS NOT NULL THEN
    SELECT (approval_status IN ('Approved','Active')) INTO v_ok
    FROM public.console_supplier_drivers WHERE id = p_driver_id;
    IF NOT COALESCE(v_ok, false) THEN RETURN false; END IF;
  END IF;

  RETURN true;
END; $$;
