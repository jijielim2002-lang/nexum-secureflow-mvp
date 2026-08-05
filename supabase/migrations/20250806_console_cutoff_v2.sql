-- ============================================================
-- Console Transport — Cutoff logic v2
-- New flow: suppliers book Open slots immediately.
-- At T-1hr (11:00), if Booked slot revenue < RM500 → reschedule + notify supplier.
-- Run after 20250806_console_schedule_v1.sql
-- ============================================================

-- Update cutoff_at on all existing Open/Booked 12:00 slots to 11:00 (T-1hr)
UPDATE public.console_route_slots
SET cutoff_at = (slot_date::text || ' 11:00:00+08')::timestamptz
WHERE departure_time = '12:00:00'
  AND slot_status IN ('Open', 'Booked')
  AND slot_date >= CURRENT_DATE;

-- Replace the cutoff check function with v2 logic
CREATE OR REPLACE FUNCTION public.console_run_cutoff_check()
RETURNS TABLE(
  slot_reference  text,
  route_code      text,
  slot_date       date,
  revenue         numeric,
  threshold       numeric,
  action          text,
  new_slot_reference text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slot       public.console_route_slots%rowtype;
  v_route      public.console_routes%rowtype;
  v_new_date   date;
  v_new_ref    text;
  v_new_id     uuid;
  v_arrival    time;
BEGIN
  -- Find today's Booked slots past their cutoff (11:00)
  FOR v_slot IN
    SELECT s.*
    FROM public.console_route_slots s
    WHERE s.slot_date = CURRENT_DATE
      AND s.slot_status = 'Booked'
      AND s.service_type = 'Same-Day Express'
      AND now() >= s.cutoff_at
  LOOP
    SELECT * INTO v_route FROM public.console_routes WHERE id = v_slot.route_id;

    IF v_slot.total_slot_revenue < v_route.minimum_slot_revenue THEN

      -- Next business day
      v_new_date := v_slot.slot_date + 1;
      WHILE EXTRACT(DOW FROM v_new_date) IN (0, 6) LOOP
        v_new_date := v_new_date + 1;
      END LOOP;

      v_new_ref  := 'SDE-' || v_route.route_code || '-' || to_char(v_new_date, 'YYYYMMDD') || '-1200';
      v_arrival  := ('12:00'::time + (v_route.max_transit_hours || ' hours')::interval)::time;

      -- Get or create next-day slot
      SELECT id INTO v_new_id FROM public.console_route_slots WHERE slot_reference = v_new_ref;
      IF v_new_id IS NULL THEN
        INSERT INTO public.console_route_slots (
          slot_reference, route_id, service_type, slot_date,
          departure_time, expected_arrival_time, same_day_arrival,
          slot_status, total_slot_revenue, cutoff_at
        ) VALUES (
          v_new_ref, v_route.id, 'Same-Day Express', v_new_date,
          '12:00'::time, v_arrival, true,
          'Open', 0, (v_new_date::text || ' 11:00:00+08')::timestamptz
        )
        RETURNING id INTO v_new_id;
      END IF;

      -- Move parcels
      UPDATE public.console_parcels
      SET slot_id = v_new_id,
          parcel_status = 'Booking Created'
      WHERE slot_id = v_slot.id
        AND parcel_status NOT IN ('Cancelled', 'Exception');

      -- Notify customers (parcel event)
      INSERT INTO public.console_parcel_events (tracking_number, event_type, event_description, event_source)
      SELECT p.tracking_number,
             'Rescheduled',
             'Your parcel has been rescheduled to ' || v_new_date::text || ' (departure 12:00). Insufficient volume on today''s slot — we apologise for the inconvenience.',
             'System'
      FROM public.console_parcels p
      WHERE p.slot_id = v_new_id
        AND p.parcel_status = 'Booking Created';

      -- Notify supplier (slot event)
      INSERT INTO public.console_parcel_events (tracking_number, event_type, event_description, event_source)
      SELECT p.tracking_number,
             'Rescheduled',
             '[SUPPLIER NOTICE] Slot ' || v_slot.slot_reference || ' rescheduled — revenue RM' ||
             v_slot.total_slot_revenue::text || ' did not reach RM' || v_route.minimum_slot_revenue::text ||
             ' by 11:00 cutoff. All parcels moved to ' || v_new_date::text || '. Vehicle booking cancelled.',
             'System'
      FROM public.console_parcels p
      WHERE p.slot_id = v_new_id
      LIMIT 1;

      -- Recalculate new slot revenue
      PERFORM public.console_recalculate_slot_revenue(v_new_id);

      -- Mark old slot rescheduled
      UPDATE public.console_route_slots
      SET slot_status = 'Rescheduled',
          rescheduled_to_slot = v_new_id,
          supplier_company_id = NULL,
          driver_user_id = NULL,
          vehicle_number = NULL
      WHERE id = v_slot.id;

      slot_reference     := v_slot.slot_reference;
      route_code         := v_route.route_code;
      slot_date          := v_slot.slot_date;
      revenue            := v_slot.total_slot_revenue;
      threshold          := v_route.minimum_slot_revenue;
      action             := 'Rescheduled → ' || v_new_date::text;
      new_slot_reference := v_new_ref;
      RETURN NEXT;
    END IF;
  END LOOP;
END; $$;

-- Also re-seed any Open slots missing cutoff_at (from the first migration run)
DO $$
DECLARE
  v_route public.console_routes%rowtype;
  v_day   date;
  v_ref   text;
  v_arr   time;
BEGIN
  FOR v_route IN
    SELECT * FROM public.console_routes
    WHERE route_code IN ('PG-KL','KL-PG','KL-JB','JB-KL') AND status = 'Active'
  LOOP
    FOR v_day IN
      SELECT generate_series(CURRENT_DATE, CURRENT_DATE + 60, '1 day'::interval)::date
    LOOP
      CONTINUE WHEN EXTRACT(DOW FROM v_day) IN (0, 6);
      v_ref := 'SDE-' || v_route.route_code || '-' || to_char(v_day, 'YYYYMMDD') || '-1200';
      v_arr := ('12:00'::time + (v_route.max_transit_hours || ' hours')::interval)::time;
      INSERT INTO public.console_route_slots (
        slot_reference, route_id, service_type, slot_date,
        departure_time, expected_arrival_time, same_day_arrival,
        slot_status, total_slot_revenue, cutoff_at
      ) VALUES (
        v_ref, v_route.id, 'Same-Day Express', v_day,
        '12:00'::time, v_arr, true,
        'Open', 0, (v_day::text || ' 11:00:00+08')::timestamptz
      )
      ON CONFLICT (slot_reference) DO UPDATE
        SET cutoff_at = EXCLUDED.cutoff_at
        WHERE console_route_slots.cutoff_at IS NULL
          OR console_route_slots.cutoff_at != EXCLUDED.cutoff_at;
    END LOOP;
  END LOOP;
END $$;
