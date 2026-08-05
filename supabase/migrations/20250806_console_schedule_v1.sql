-- ============================================================
-- Console Transport — Schedule & Revenue Gate (v1)
-- Run after 20250805_console_v2.sql
-- ============================================================
-- Slot lifecycle:
--   Open → (revenue >= threshold) → Released → Booked → In Progress → Completed
--   Open → (T-30min, revenue < threshold) → Rescheduled (parcels moved to next day)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Add revenue gate columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.console_routes
  ADD COLUMN IF NOT EXISTS minimum_slot_revenue  numeric  DEFAULT 500,
  ADD COLUMN IF NOT EXISTS departure_time_fixed  time     DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS cutoff_minutes_before integer  DEFAULT 30,
  ADD COLUMN IF NOT EXISTS operating_days        text[]   DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'];

ALTER TABLE public.console_route_slots
  ADD COLUMN IF NOT EXISTS total_slot_revenue    numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cutoff_at             timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_to_slot   uuid     REFERENCES public.console_route_slots(id);

-- ─────────────────────────────────────────────────────────────
-- 2. Extend slot_status to include Released and Rescheduled
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.console_route_slots
    DROP CONSTRAINT IF EXISTS console_route_slots_slot_status_check;
  ALTER TABLE public.console_route_slots
    ADD CONSTRAINT console_route_slots_slot_status_check
    CHECK (slot_status IN (
      'Open','Released','Booked','Assigned','In Progress','Completed','Cancelled','Rescheduled'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Update routes with correct schedule (Mon–Fri, 12:00)
-- ─────────────────────────────────────────────────────────────
UPDATE public.console_routes SET
  minimum_slot_revenue  = 500,
  departure_time_fixed  = '12:00',
  cutoff_minutes_before = 30,
  operating_days        = ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']
WHERE route_code IN ('PG-KL','KL-PG','KL-JB','JB-KL');

-- ─────────────────────────────────────────────────────────────
-- 4. Generate Mon–Fri 12:00 slots for next 60 days
--    One slot per route per operating day
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_route    public.console_routes%rowtype;
  v_day      date;
  v_ref      text;
  v_dow_name text;
  v_arrival  time;
BEGIN
  FOR v_route IN
    SELECT * FROM public.console_routes
    WHERE route_code IN ('PG-KL','KL-PG','KL-JB','JB-KL') AND status = 'Active'
  LOOP
    FOR v_day IN
      SELECT generate_series(
        CURRENT_DATE,
        CURRENT_DATE + 60,
        '1 day'::interval
      )::date
    LOOP
      -- Day-of-week name
      v_dow_name := to_char(v_day, 'Day');
      v_dow_name := trim(v_dow_name);

      -- Skip weekends
      CONTINUE WHEN EXTRACT(DOW FROM v_day) IN (0, 6); -- 0=Sun, 6=Sat

      v_ref := 'SDE-' || v_route.route_code || '-' || to_char(v_day, 'YYYYMMDD') || '-1200';

      -- Compute ETA
      v_arrival := ('12:00'::time + (v_route.max_transit_hours || ' hours')::interval)::time;

      INSERT INTO public.console_route_slots (
        slot_reference, route_id, service_type,
        slot_date, departure_time, expected_arrival_time,
        same_day_arrival, slot_status,
        total_slot_revenue,
        cutoff_at
      ) VALUES (
        v_ref, v_route.id, 'Same-Day Express',
        v_day, '12:00'::time, v_arrival,
        true, 'Open',
        0,
        (v_day::text || ' 11:30:00')::timestamptz
      )
      ON CONFLICT (slot_reference) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Function: recalculate slot revenue + auto-release
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_recalculate_slot_revenue(
  p_slot_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_revenue        numeric;
  v_threshold      numeric;
  v_current_status text;
BEGIN
  -- Sum parcel prices for active parcels on this slot
  SELECT COALESCE(SUM(parcel_price), 0)
  INTO v_revenue
  FROM public.console_parcels
  WHERE slot_id = p_slot_id
    AND parcel_status NOT IN ('Cancelled');

  -- Get route threshold and current slot status
  SELECT r.minimum_slot_revenue, s.slot_status
  INTO v_threshold, v_current_status
  FROM public.console_route_slots s
  JOIN public.console_routes r ON r.id = s.route_id
  WHERE s.id = p_slot_id;

  -- Update slot revenue
  UPDATE public.console_route_slots
  SET total_slot_revenue = v_revenue
  WHERE id = p_slot_id;

  -- Auto-release if threshold met and still Open
  IF v_revenue >= v_threshold AND v_current_status = 'Open' THEN
    UPDATE public.console_route_slots
    SET slot_status = 'Released'
    WHERE id = p_slot_id;
  END IF;
END; $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Function: cutoff check — reschedule under-threshold slots
--    Call this daily at 11:30 (via cron or admin API)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.console_run_cutoff_check()
RETURNS TABLE(
  slot_reference text, route_code text,
  slot_date date, revenue numeric, threshold numeric,
  action text, new_slot_reference text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slot       public.console_route_slots%rowtype;
  v_route      public.console_routes%rowtype;
  v_new_date   date;
  v_new_ref    text;
  v_new_id     uuid;
  v_arrival    time;
BEGIN
  -- Find today's Open (not yet released) slots past their cutoff
  FOR v_slot IN
    SELECT s.*
    FROM public.console_route_slots s
    WHERE s.slot_date = CURRENT_DATE
      AND s.slot_status = 'Open'
      AND s.service_type = 'Same-Day Express'
      AND now() >= s.cutoff_at
  LOOP
    SELECT * INTO v_route FROM public.console_routes WHERE id = v_slot.route_id;

    -- Revenue below threshold: reschedule to next business day
    IF v_slot.total_slot_revenue < v_route.minimum_slot_revenue THEN

      -- Find next business day (skip weekends)
      v_new_date := v_slot.slot_date + 1;
      WHILE EXTRACT(DOW FROM v_new_date) IN (0, 6) LOOP
        v_new_date := v_new_date + 1;
      END LOOP;

      v_new_ref  := 'SDE-' || v_route.route_code || '-' || to_char(v_new_date, 'YYYYMMDD') || '-1200';
      v_arrival  := ('12:00'::time + (v_route.max_transit_hours || ' hours')::interval)::time;

      -- Get or create tomorrow's slot
      SELECT id INTO v_new_id FROM public.console_route_slots WHERE slot_reference = v_new_ref;
      IF v_new_id IS NULL THEN
        INSERT INTO public.console_route_slots (
          slot_reference, route_id, service_type, slot_date,
          departure_time, expected_arrival_time, same_day_arrival,
          slot_status, total_slot_revenue, cutoff_at
        ) VALUES (
          v_new_ref, v_route.id, 'Same-Day Express', v_new_date,
          '12:00'::time, v_arrival, true,
          'Open', 0, (v_new_date::text || ' 11:30:00')::timestamptz
        )
        RETURNING id INTO v_new_id;
      END IF;

      -- Move all active parcels to new slot
      UPDATE public.console_parcels
      SET slot_id = v_new_id,
          parcel_status = 'Booking Created'
      WHERE slot_id = v_slot.id
        AND parcel_status NOT IN ('Cancelled','Exception');

      -- Log reschedule events
      INSERT INTO public.console_parcel_events (tracking_number, event_type, event_description, event_source)
      SELECT p.tracking_number,
             'Rescheduled',
             'Slot rescheduled to ' || v_new_date::text || ' (revenue threshold not met). Your parcel will depart ' || v_new_date::text || ' at 12:00.',
             'System'
      FROM public.console_parcels p
      WHERE p.slot_id = v_new_id
        AND p.parcel_status = 'Booking Created';

      -- Recalculate new slot revenue
      PERFORM public.console_recalculate_slot_revenue(v_new_id);

      -- Mark old slot rescheduled
      UPDATE public.console_route_slots
      SET slot_status = 'Rescheduled', rescheduled_to_slot = v_new_id
      WHERE id = v_slot.id;

      -- Return row
      slot_reference    := v_slot.slot_reference;
      route_code        := v_route.route_code;
      slot_date         := v_slot.slot_date;
      revenue           := v_slot.total_slot_revenue;
      threshold         := v_route.minimum_slot_revenue;
      action            := 'Rescheduled to ' || v_new_date::text;
      new_slot_reference := v_new_ref;
      RETURN NEXT;

    END IF;
  END LOOP;
END; $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Add event_type for Rescheduled
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE public.console_parcel_events
    DROP CONSTRAINT IF EXISTS console_parcel_events_event_type_check;
  ALTER TABLE public.console_parcel_events
    ADD CONSTRAINT console_parcel_events_event_type_check
    CHECK (event_type IN (
      'Booking Created','Payment Proof Uploaded','Payment Verified','Label Printed',
      'Received at Origin Warehouse','Assigned to Slot','Loaded to Driver',
      'Departed Origin','Arrived at Destination Warehouse','Ready for Collection',
      'Collected','Completed','Exception','Cancelled','Rescheduled','WhatsApp Sent'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;
