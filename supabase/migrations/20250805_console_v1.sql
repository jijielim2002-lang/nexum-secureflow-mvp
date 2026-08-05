-- ============================================================
-- Nexum Console Transport MVP v1
-- Warehouse-to-warehouse parcel coordination, Peninsular Malaysia
-- ============================================================

-- ── Sequences ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.console_tracking_seq START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS public.console_slot_ref_seq  START 1 INCREMENT 1;

-- ── 1. Warehouses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_warehouses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code   text        UNIQUE NOT NULL,
  warehouse_name   text        NOT NULL,
  city             text        NOT NULL,
  state            text        NOT NULL,
  country          text        NOT NULL DEFAULT 'Malaysia',
  full_address     text,
  postcode         text,
  operating_days   text[]      DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  open_time        time        DEFAULT '10:00',
  close_time       time        DEFAULT '19:00',
  contact_name     text,
  contact_phone    text,
  status           text        CHECK (status IN ('Active','Inactive')) DEFAULT 'Active',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ── 2. Routes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_routes (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code                  text        UNIQUE NOT NULL,
  origin_warehouse_id         uuid        REFERENCES public.console_warehouses(id),
  destination_warehouse_id    uuid        REFERENCES public.console_warehouses(id),
  origin_city                 text        NOT NULL,
  destination_city            text        NOT NULL,
  max_transit_hours           numeric     NOT NULL,
  base_customer_price         numeric     NOT NULL DEFAULT 50,
  supplier_parcel_payout      numeric     NOT NULL DEFAULT 45,
  nexum_commission_rate       numeric     NOT NULL DEFAULT 10,
  minimum_supplier_trip_payout numeric    NOT NULL DEFAULT 200,
  status                      text        CHECK (status IN ('Active','Inactive')) DEFAULT 'Active',
  created_at                  timestamptz DEFAULT now()
);

-- ── 3. Route Slots ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_route_slots (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_reference       text        UNIQUE NOT NULL,
  route_id             uuid        NOT NULL REFERENCES public.console_routes(id),
  departure_time       time        NOT NULL,
  expected_arrival_time time,
  same_day_arrival     boolean     DEFAULT true,
  slot_date            date        NOT NULL,
  supplier_company_id  uuid        REFERENCES public.companies(id),
  driver_user_id       uuid        REFERENCES auth.users(id),
  vehicle_number       text,
  slot_status          text        CHECK (slot_status IN (
                          'Open','Booked','Assigned','In Progress',
                          'Completed','Cancelled','Missed'
                        )) DEFAULT 'Open',
  booked_at            timestamptz,
  actual_departure_at  timestamptz,
  actual_arrival_at    timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- ── 4. Parcels ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_parcels (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number             text        UNIQUE NOT NULL,
  customer_company_id         uuid        REFERENCES public.companies(id),
  customer_user_id            uuid        REFERENCES auth.users(id),
  route_id                    uuid        REFERENCES public.console_routes(id),
  slot_id                     uuid        REFERENCES public.console_route_slots(id),
  origin_warehouse_id         uuid        REFERENCES public.console_warehouses(id),
  destination_warehouse_id    uuid        REFERENCES public.console_warehouses(id),
  sender_name                 text,
  sender_contact              text,
  sender_id_number_encrypted  text,
  sender_id_number_masked     text,
  receiver_name               text,
  receiver_contact            text,
  receiver_id_number_encrypted text,
  receiver_id_number_masked   text,
  commodity_content           text,
  contains_liquid             boolean     DEFAULT false,
  fragile                     boolean     DEFAULT false,
  parcel_length_cm            numeric,
  parcel_width_cm             numeric,
  parcel_height_cm            numeric,
  parcel_weight_kg            numeric,
  parcel_price                numeric     DEFAULT 50,
  currency                    text        DEFAULT 'MYR',
  payment_status              text        CHECK (payment_status IN (
                                'Pending','Paid','Refunded','Cancelled'
                              )) DEFAULT 'Pending',
  parcel_status               text        CHECK (parcel_status IN (
                                'Created','Label Generated',
                                'Received at Origin Warehouse','Loaded to Driver',
                                'In Transit','Arrived at Destination Warehouse',
                                'Ready for Collection','Completed',
                                'Exception','Cancelled'
                              )) DEFAULT 'Created',
  label_printed               boolean     DEFAULT false,
  qr_code_value               text,
  barcode_value               text,
  nexum_commission            numeric     DEFAULT 0,
  supplier_earning            numeric     DEFAULT 0,
  manual_acceptance_required  boolean     DEFAULT false,
  manual_acceptance_granted   boolean     DEFAULT false,
  manual_acceptance_note      text,
  whatsapp_phone              text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

-- ── 5. Parcel Events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_parcel_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number   text        NOT NULL,
  event_type        text        CHECK (event_type IN (
                      'Created','Label Printed','Origin Scan In',
                      'Driver Pickup Scan','Driver Departed','GPS Update',
                      'Destination Scan In','POD Uploaded',
                      'Ready for Collection','Completed',
                      'Exception','WhatsApp Sent'
                    )) NOT NULL,
  event_description text,
  event_location    text,
  latitude          numeric,
  longitude         numeric,
  photo_url         text,
  scanned_by        uuid        REFERENCES auth.users(id),
  event_source      text        CHECK (event_source IN (
                      'Customer','Warehouse','Driver','Admin','System'
                    )) DEFAULT 'System',
  raw_payload       jsonb       DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now()
);

-- ── 6. Wallets ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_wallets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES public.companies(id),
  wallet_type       text        CHECK (wallet_type IN ('Customer','Supplier')) NOT NULL,
  currency          text        DEFAULT 'MYR',
  available_balance numeric     DEFAULT 0,
  reserved_balance  numeric     DEFAULT 0,
  pending_balance   numeric     DEFAULT 0,
  total_earned      numeric     DEFAULT 0,
  wallet_status     text        DEFAULT 'Active',
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (company_id, wallet_type)
);

CREATE TABLE IF NOT EXISTS public.console_wallet_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        uuid        NOT NULL REFERENCES public.console_wallets(id),
  company_id       uuid        REFERENCES public.companies(id),
  transaction_type text        CHECK (transaction_type IN (
                     'Top Up','Parcel Payment','Refund',
                     'Supplier Earning Pending','Supplier Earning Released',
                     'Withdrawal Request','Withdrawal Paid','Withdrawal Surcharge',
                     'Processing Fee','Commission','Adjustment'
                   )) NOT NULL,
  amount           numeric     NOT NULL,
  currency         text        DEFAULT 'MYR',
  reference_type   text,
  reference_id     text,
  status           text        CHECK (status IN (
                     'Pending','Completed','Failed','Cancelled','On Hold'
                   )) DEFAULT 'Pending',
  description      text,
  created_at       timestamptz DEFAULT now()
);

-- ── 7. Supplier Ratings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.console_supplier_ratings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_company_id     uuid        UNIQUE NOT NULL REFERENCES public.companies(id),
  total_completed_trips   integer     DEFAULT 0,
  total_completed_parcels integer     DEFAULT 0,
  pickup_on_time_rate     numeric     DEFAULT 0,
  delivery_on_time_rate   numeric     DEFAULT 0,
  scan_compliance_rate    numeric     DEFAULT 0,
  pod_quality_score       numeric     DEFAULT 0,
  customer_rating         numeric     DEFAULT 5.0,
  overall_rating          numeric     DEFAULT 0,
  last_calculated_at      timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_console_parcels_tracking    ON public.console_parcels(tracking_number);
CREATE INDEX IF NOT EXISTS idx_console_parcels_customer    ON public.console_parcels(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_console_parcels_slot        ON public.console_parcels(slot_id);
CREATE INDEX IF NOT EXISTS idx_console_parcel_events_tn    ON public.console_parcel_events(tracking_number);
CREATE INDEX IF NOT EXISTS idx_console_slots_route_date    ON public.console_route_slots(route_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_console_slots_supplier      ON public.console_route_slots(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_console_wallet_txns_wallet  ON public.console_wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_console_wallet_txns_company ON public.console_wallet_transactions(company_id);

-- ── Functions ────────────────────────────────────────────────────────────────

-- Generate tracking number: NX-YYYYMMDD-XXXXX
CREATE OR REPLACE FUNCTION public.generate_console_tracking_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_date text := to_char(now(), 'YYYYMMDD');
  v_seq  int  := nextval('public.console_tracking_seq');
BEGIN
  RETURN 'NX-' || v_date || '-' || lpad(v_seq::text, 5, '0');
END; $$;

-- Generate slot reference: SL-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION public.generate_console_slot_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_date text := to_char(now(), 'YYYYMMDD');
  v_seq  int  := nextval('public.console_slot_ref_seq');
BEGIN
  RETURN 'SL-' || v_date || '-' || lpad(v_seq::text, 4, '0');
END; $$;

-- Mask IC: show only last 4 chars
CREATE OR REPLACE FUNCTION public.console_mask_ic(p_ic text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_ic IS NULL OR length(p_ic) < 4 THEN RETURN '****'; END IF;
  RETURN repeat('*', length(p_ic) - 4) || right(p_ic, 4);
END; $$;

-- Compute supplier rating (upsert)
CREATE OR REPLACE FUNCTION public.compute_console_supplier_rating(p_supplier_company_id uuid)
RETURNS void SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_total_trips   integer := 0;
  v_total_parcels integer := 0;
  v_pickup_rate   numeric := 0;
  v_delivery_rate numeric := 0;
  v_scan_rate     numeric := 0;
  v_pod_score     numeric := 0;
  v_cust_rating   numeric := 5.0;
  v_overall       numeric := 0;
BEGIN
  -- Completed trips
  SELECT COUNT(*) INTO v_total_trips
  FROM public.console_route_slots
  WHERE supplier_company_id = p_supplier_company_id AND slot_status = 'Completed';

  -- Completed parcels
  SELECT COUNT(*) INTO v_total_parcels
  FROM public.console_parcels p
  JOIN public.console_route_slots s ON s.id = p.slot_id
  WHERE s.supplier_company_id = p_supplier_company_id
    AND p.parcel_status = 'Completed';

  -- Pickup on time (within 5 min of departure_time)
  SELECT ROUND(
    CASE WHEN COUNT(*) = 0 THEN 0
    ELSE COUNT(*) FILTER (
      WHERE actual_departure_at IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (actual_departure_at::timetz - departure_time)) / 60) <= 5
    )::numeric * 100.0 / COUNT(*) END, 1)
  INTO v_pickup_rate
  FROM public.console_route_slots
  WHERE supplier_company_id = p_supplier_company_id
    AND slot_status = 'Completed';

  -- Delivery on time
  SELECT ROUND(
    CASE WHEN COUNT(*) = 0 THEN 0
    ELSE COUNT(*) FILTER (
      WHERE actual_arrival_at IS NOT NULL AND actual_departure_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (actual_arrival_at - actual_departure_at)) / 3600 <=
            (SELECT max_transit_hours FROM public.console_routes WHERE id = s.route_id)
    )::numeric * 100.0 / COUNT(*) END, 1)
  INTO v_delivery_rate
  FROM public.console_route_slots s
  WHERE supplier_company_id = p_supplier_company_id AND slot_status = 'Completed';

  -- Scan compliance: parcels with BOTH origin + destination scan
  IF v_total_parcels > 0 THEN
    SELECT ROUND(
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (SELECT 1 FROM public.console_parcel_events e
                      WHERE e.tracking_number = p.tracking_number AND e.event_type = 'Origin Scan In')
          AND EXISTS (SELECT 1 FROM public.console_parcel_events e
                      WHERE e.tracking_number = p.tracking_number AND e.event_type = 'Destination Scan In')
      )::numeric * 100.0 / NULLIF(COUNT(DISTINCT p.id), 0), 1)
    INTO v_scan_rate
    FROM public.console_parcels p
    JOIN public.console_route_slots s ON s.id = p.slot_id
    WHERE s.supplier_company_id = p_supplier_company_id
      AND p.parcel_status NOT IN ('Cancelled');

    -- POD quality: parcels with POD photo
    SELECT ROUND(
      COUNT(DISTINCT e.tracking_number)::numeric * 100.0 / NULLIF(v_total_parcels, 0), 1)
    INTO v_pod_score
    FROM public.console_parcel_events e
    JOIN public.console_parcels p ON p.tracking_number = e.tracking_number
    JOIN public.console_route_slots s ON s.id = p.slot_id
    WHERE s.supplier_company_id = p_supplier_company_id
      AND e.event_type = 'POD Uploaded' AND e.photo_url IS NOT NULL;
  END IF;

  -- Weighted overall (rating weights from spec)
  v_overall := ROUND(
    COALESCE(v_pickup_rate,   0) * 0.30 +
    COALESCE(v_delivery_rate, 0) * 0.35 +
    COALESCE(v_scan_rate,     0) * 0.15 +
    COALESCE(v_pod_score,     0) * 0.10 +
    (COALESCE(v_cust_rating, 5.0) * 20)  * 0.10, 1);

  INSERT INTO public.console_supplier_ratings (
    supplier_company_id, total_completed_trips, total_completed_parcels,
    pickup_on_time_rate, delivery_on_time_rate, scan_compliance_rate,
    pod_quality_score, customer_rating, overall_rating, last_calculated_at
  ) VALUES (
    p_supplier_company_id, v_total_trips, v_total_parcels,
    COALESCE(v_pickup_rate,0), COALESCE(v_delivery_rate,0),
    COALESCE(v_scan_rate,0), COALESCE(v_pod_score,0),
    v_cust_rating, COALESCE(v_overall,0), now()
  )
  ON CONFLICT (supplier_company_id) DO UPDATE SET
    total_completed_trips   = EXCLUDED.total_completed_trips,
    total_completed_parcels = EXCLUDED.total_completed_parcels,
    pickup_on_time_rate     = EXCLUDED.pickup_on_time_rate,
    delivery_on_time_rate   = EXCLUDED.delivery_on_time_rate,
    scan_compliance_rate    = EXCLUDED.scan_compliance_rate,
    pod_quality_score       = EXCLUDED.pod_quality_score,
    customer_rating         = EXCLUDED.customer_rating,
    overall_rating          = EXCLUDED.overall_rating,
    last_calculated_at      = now();
END; $$;

-- Release supplier earnings when slot is completed
CREATE OR REPLACE FUNCTION public.release_console_supplier_earnings(p_slot_id uuid)
RETURNS void SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_slot         public.console_route_slots%ROWTYPE;
  v_route        public.console_routes%ROWTYPE;
  v_parcel_count integer;
  v_raw_earning  numeric;
  v_final_earn   numeric;
  v_commission   numeric;
  v_wallet_id    uuid;
BEGIN
  SELECT * INTO v_slot  FROM public.console_route_slots WHERE id = p_slot_id;
  SELECT * INTO v_route FROM public.console_routes WHERE id = v_slot.route_id;

  SELECT COUNT(*) INTO v_parcel_count
  FROM public.console_parcels
  WHERE slot_id = p_slot_id AND parcel_status NOT IN ('Cancelled','Exception');

  IF v_parcel_count = 0 OR v_slot.supplier_company_id IS NULL THEN RETURN; END IF;

  v_raw_earning := v_parcel_count * v_route.supplier_parcel_payout;  -- RM45 × n
  v_final_earn  := GREATEST(v_raw_earning, v_route.minimum_supplier_trip_payout);  -- min RM200
  v_commission  := v_parcel_count * v_route.base_customer_price
                   * (v_route.nexum_commission_rate / 100.0);  -- 10% × RM50 × n

  -- Get or create supplier wallet
  SELECT id INTO v_wallet_id
  FROM public.console_wallets
  WHERE company_id = v_slot.supplier_company_id AND wallet_type = 'Supplier';

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.console_wallets (company_id, wallet_type)
    VALUES (v_slot.supplier_company_id, 'Supplier')
    RETURNING id INTO v_wallet_id;
  END IF;

  -- Move pending → available
  UPDATE public.console_wallets
  SET pending_balance   = GREATEST(pending_balance - v_final_earn, 0),
      available_balance = available_balance + v_final_earn,
      total_earned      = total_earned + v_final_earn,
      updated_at        = now()
  WHERE id = v_wallet_id;

  -- Record earning released
  INSERT INTO public.console_wallet_transactions
    (wallet_id, company_id, transaction_type, amount, reference_type, reference_id, status, description)
  VALUES
    (v_wallet_id, v_slot.supplier_company_id,
     'Supplier Earning Released', v_final_earn,
     'slot', p_slot_id::text, 'Completed',
     'Earnings released — slot ' || v_slot.slot_reference
       || ', ' || v_parcel_count || ' parcel(s), min. trip guarantee applied');

  -- Record Nexum commission (deducted from gross before supplier gets payout)
  INSERT INTO public.console_wallet_transactions
    (wallet_id, company_id, transaction_type, amount, reference_type, reference_id, status, description)
  VALUES
    (v_wallet_id, v_slot.supplier_company_id,
     'Commission', v_commission,
     'slot', p_slot_id::text, 'Completed',
     'Nexum 10% commission — slot ' || v_slot.slot_reference);

  -- Update per-parcel split
  UPDATE public.console_parcels
  SET supplier_earning = ROUND(v_final_earn / v_parcel_count, 2),
      nexum_commission = ROUND(v_route.base_customer_price * (v_route.nexum_commission_rate / 100.0), 2),
      parcel_status    = 'Completed',
      updated_at       = now()
  WHERE slot_id = p_slot_id AND parcel_status = 'Arrived at Destination Warehouse';

  -- Recompute rating
  PERFORM public.compute_console_supplier_rating(v_slot.supplier_company_id);
END; $$;

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_console_warehouses_upd  ON public.console_warehouses;
DROP TRIGGER IF EXISTS trg_console_slots_upd        ON public.console_route_slots;
DROP TRIGGER IF EXISTS trg_console_parcels_upd      ON public.console_parcels;
DROP TRIGGER IF EXISTS trg_console_wallets_upd      ON public.console_wallets;

CREATE TRIGGER trg_console_warehouses_upd
  BEFORE UPDATE ON public.console_warehouses
  FOR EACH ROW EXECUTE FUNCTION public.console_set_updated_at();

CREATE TRIGGER trg_console_slots_upd
  BEFORE UPDATE ON public.console_route_slots
  FOR EACH ROW EXECUTE FUNCTION public.console_set_updated_at();

CREATE TRIGGER trg_console_parcels_upd
  BEFORE UPDATE ON public.console_parcels
  FOR EACH ROW EXECUTE FUNCTION public.console_set_updated_at();

CREATE TRIGGER trg_console_wallets_upd
  BEFORE UPDATE ON public.console_wallets
  FOR EACH ROW EXECUTE FUNCTION public.console_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.console_warehouses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_routes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_route_slots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_parcels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_parcel_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_wallets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.console_supplier_ratings   ENABLE ROW LEVEL SECURITY;

-- warehouses: read all auth users; write admin only
DROP POLICY IF EXISTS "cw_read"      ON public.console_warehouses;
DROP POLICY IF EXISTS "cw_admin_all" ON public.console_warehouses;
CREATE POLICY "cw_read"      ON public.console_warehouses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cw_admin_all" ON public.console_warehouses FOR ALL    USING (nexum_is_admin());

-- routes: read all auth; write admin
DROP POLICY IF EXISTS "cr_read"      ON public.console_routes;
DROP POLICY IF EXISTS "cr_admin_all" ON public.console_routes;
CREATE POLICY "cr_read"      ON public.console_routes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cr_admin_all" ON public.console_routes FOR ALL    USING (nexum_is_admin());

-- slots: open slots visible to all auth; supplier sees own slots; admin all
DROP POLICY IF EXISTS "cs_read"           ON public.console_route_slots;
DROP POLICY IF EXISTS "cs_supplier_update" ON public.console_route_slots;
DROP POLICY IF EXISTS "cs_admin_all"      ON public.console_route_slots;
CREATE POLICY "cs_read" ON public.console_route_slots FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    slot_status = 'Open'
    OR nexum_is_admin()
    OR supplier_company_id = nexum_my_company_id()
    OR EXISTS (
      SELECT 1 FROM public.console_parcels p
      WHERE p.slot_id = console_route_slots.id
        AND p.customer_company_id = nexum_my_company_id()
    )
  )
);
CREATE POLICY "cs_supplier_update" ON public.console_route_slots FOR UPDATE
  USING (supplier_company_id = nexum_my_company_id());
CREATE POLICY "cs_admin_all" ON public.console_route_slots FOR ALL USING (nexum_is_admin());

-- parcels: customer sees own; supplier/driver sees assigned slot parcels; admin all
DROP POLICY IF EXISTS "cp_select"  ON public.console_parcels;
DROP POLICY IF EXISTS "cp_insert"  ON public.console_parcels;
DROP POLICY IF EXISTS "cp_update"  ON public.console_parcels;
DROP POLICY IF EXISTS "cp_admin"   ON public.console_parcels;
CREATE POLICY "cp_select" ON public.console_parcels FOR SELECT USING (
  nexum_is_admin()
  OR customer_company_id = nexum_my_company_id()
  OR EXISTS (
    SELECT 1 FROM public.console_route_slots s
    WHERE s.id = slot_id AND s.supplier_company_id = nexum_my_company_id()
  )
);
CREATE POLICY "cp_insert" ON public.console_parcels FOR INSERT
  WITH CHECK (customer_company_id = nexum_my_company_id() OR nexum_is_admin());
CREATE POLICY "cp_update" ON public.console_parcels FOR UPDATE USING (
  nexum_is_admin()
  OR customer_company_id = nexum_my_company_id()
  OR EXISTS (
    SELECT 1 FROM public.console_route_slots s
    WHERE s.id = slot_id AND s.supplier_company_id = nexum_my_company_id()
  )
);
CREATE POLICY "cp_admin" ON public.console_parcels FOR ALL USING (nexum_is_admin());

-- parcel events: same visibility as parcels + any auth can insert
DROP POLICY IF EXISTS "cpe_select" ON public.console_parcel_events;
DROP POLICY IF EXISTS "cpe_insert" ON public.console_parcel_events;
DROP POLICY IF EXISTS "cpe_admin"  ON public.console_parcel_events;
CREATE POLICY "cpe_select" ON public.console_parcel_events FOR SELECT USING (
  nexum_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.console_parcels p
    WHERE p.tracking_number = console_parcel_events.tracking_number AND (
      p.customer_company_id = nexum_my_company_id()
      OR EXISTS (
        SELECT 1 FROM public.console_route_slots s
        WHERE s.id = p.slot_id AND s.supplier_company_id = nexum_my_company_id()
      )
    )
  )
);
CREATE POLICY "cpe_insert" ON public.console_parcel_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cpe_admin"  ON public.console_parcel_events FOR ALL USING (nexum_is_admin());

-- wallets: own company; admin all
DROP POLICY IF EXISTS "cwall_own"   ON public.console_wallets;
DROP POLICY IF EXISTS "cwall_admin" ON public.console_wallets;
CREATE POLICY "cwall_own"   ON public.console_wallets FOR SELECT
  USING (company_id = nexum_my_company_id() OR nexum_is_admin());
CREATE POLICY "cwall_admin" ON public.console_wallets FOR ALL USING (nexum_is_admin());

-- wallet transactions: own company; admin all
DROP POLICY IF EXISTS "cwtx_own"   ON public.console_wallet_transactions;
DROP POLICY IF EXISTS "cwtx_admin" ON public.console_wallet_transactions;
CREATE POLICY "cwtx_own"   ON public.console_wallet_transactions FOR SELECT
  USING (company_id = nexum_my_company_id() OR nexum_is_admin());
CREATE POLICY "cwtx_admin" ON public.console_wallet_transactions FOR ALL USING (nexum_is_admin());

-- supplier ratings: read all auth
DROP POLICY IF EXISTS "csr_read"  ON public.console_supplier_ratings;
DROP POLICY IF EXISTS "csr_admin" ON public.console_supplier_ratings;
CREATE POLICY "csr_read"  ON public.console_supplier_ratings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "csr_admin" ON public.console_supplier_ratings FOR ALL    USING (nexum_is_admin());

-- ── Seed: Warehouses ─────────────────────────────────────────────────────────
INSERT INTO public.console_warehouses
  (warehouse_code, warehouse_name, city, state, full_address, postcode, contact_name, contact_phone)
VALUES
  ('WH-PG',  'Nexum Penang Warehouse',        'Penang',           'Penang',        'Nexum Logistics Hub, Bayan Lepas FIZ, 11900 Bayan Lepas, Penang', '11900', 'Warehouse Manager', '+604-0000000'),
  ('WH-KL',  'Nexum Kuala Lumpur Warehouse',  'Kuala Lumpur',     'Kuala Lumpur',  'Nexum Logistics Hub, Taman Perindustrian Puchong, 47100 Puchong, Selangor', '47100', 'Warehouse Manager', '+603-0000000'),
  ('WH-JB',  'Nexum Johor Bahru Warehouse',   'Johor Bahru',      'Johor',         'Nexum Logistics Hub, Kawasan Perindustrian Tebrau, 81100 Johor Bahru, Johor', '81100', 'Warehouse Manager', '+607-0000000')
ON CONFLICT (warehouse_code) DO NOTHING;

-- ── Seed: Routes ─────────────────────────────────────────────────────────────
WITH wh AS (
  SELECT id, warehouse_code FROM public.console_warehouses
  WHERE warehouse_code IN ('WH-PG','WH-KL','WH-JB')
)
INSERT INTO public.console_routes
  (route_code, origin_warehouse_id, destination_warehouse_id,
   origin_city, destination_city, max_transit_hours)
SELECT route_code, o.id, d.id, origin_city, destination_city, max_hours
FROM (VALUES
  ('PG-KL', 'WH-PG', 'WH-KL', 'Penang',       'Kuala Lumpur', 6),
  ('KL-PG', 'WH-KL', 'WH-PG', 'Kuala Lumpur', 'Penang',       6),
  ('KL-JB', 'WH-KL', 'WH-JB', 'Kuala Lumpur', 'Johor Bahru',  5),
  ('JB-KL', 'WH-JB', 'WH-KL', 'Johor Bahru',  'Kuala Lumpur', 5)
) AS t(route_code, origin_code, dest_code, origin_city, destination_city, max_hours)
JOIN wh o ON o.warehouse_code = t.origin_code
JOIN wh d ON d.warehouse_code = t.dest_code
ON CONFLICT (route_code) DO NOTHING;
