-- ============================================================
-- Console Transport — Clean up old non-12:00 slots
-- Run in Supabase SQL editor AFTER 20250806_console_schedule_v1.sql
-- ============================================================

-- Cancel all Open slots that depart at times other than 12:00
-- (these were seeded by the old generateDailySlots function: 10:00–18:00 hourly)
-- Only cancel Open ones — leave Booked/In Progress/Completed untouched.
UPDATE public.console_route_slots
SET slot_status = 'Cancelled'
WHERE slot_status = 'Open'
  AND departure_time != '12:00:00'
  AND service_type = 'Same-Day Express';

-- Also cancel future-dated 12:00 slots that have NO cutoff_at set
-- (they were seeded before the new migration added the cutoff_at column)
-- We'll re-seed them properly below.
UPDATE public.console_route_slots
SET slot_status = 'Cancelled'
WHERE slot_status = 'Open'
  AND departure_time = '12:00:00'
  AND cutoff_at IS NULL
  AND slot_date >= CURRENT_DATE;

-- Re-seed Mon–Fri 12:00 slots for next 60 days with correct cutoff_at
DO $$
DECLARE
  v_route   public.console_routes%rowtype;
  v_day     date;
  v_ref     text;
  v_arrival time;
BEGIN
  FOR v_route IN
    SELECT * FROM public.console_routes
    WHERE route_code IN ('PG-KL','KL-PG','KL-JB','JB-KL') AND status = 'Active'
  LOOP
    FOR v_day IN
      SELECT generate_series(CURRENT_DATE, CURRENT_DATE + 60, '1 day'::interval)::date
    LOOP
      -- Skip weekends
      CONTINUE WHEN EXTRACT(DOW FROM v_day) IN (0, 6);

      v_ref    := 'SDE-' || v_route.route_code || '-' || to_char(v_day, 'YYYYMMDD') || '-1200';
      v_arrival := ('12:00'::time + (v_route.max_transit_hours || ' hours')::interval)::time;

      INSERT INTO public.console_route_slots (
        slot_reference, route_id, service_type,
        slot_date, departure_time, expected_arrival_time,
        same_day_arrival, slot_status, total_slot_revenue, cutoff_at
      ) VALUES (
        v_ref, v_route.id, 'Same-Day Express',
        v_day, '12:00'::time, v_arrival,
        true, 'Open', 0,
        (v_day::text || ' 11:30:00+08')::timestamptz
      )
      ON CONFLICT (slot_reference) DO UPDATE
        SET cutoff_at = EXCLUDED.cutoff_at,
            total_slot_revenue = COALESCE(console_route_slots.total_slot_revenue, 0)
        WHERE console_route_slots.cutoff_at IS NULL;
    END LOOP;
  END LOOP;
END $$;
