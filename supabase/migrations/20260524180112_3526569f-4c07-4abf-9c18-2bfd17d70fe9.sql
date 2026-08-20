
CREATE OR REPLACE FUNCTION public.get_pending_booking_reminders()
RETURNS TABLE (
  booking_id uuid,
  user_id uuid,
  school_id uuid,
  sector text,
  topic text,
  booking_date date,
  start_time time,
  minutes_before integer,
  minutes_left integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH thresholds(m) AS (VALUES (60),(45),(30),(15),(10),(5))
  SELECT b.id, b.user_id, b.school_id, b.sector, b.topic,
         b.booking_date, b.start_time, t.m,
         GREATEST(0, EXTRACT(EPOCH FROM ((b.booking_date + b.start_time) - now()))/60)::int
  FROM public.bookings b
  CROSS JOIN (VALUES (60),(45),(30),(15),(10),(5)) AS t(m)
  WHERE b.user_id = auth.uid()
    AND b.status IN ('confirmed','approved','active')
    AND (b.gestor_status IS NULL OR b.gestor_status IN ('approved','auto_approved'))
    AND (b.booking_date + b.start_time) > now()
    AND (b.booking_date + b.start_time) <= now() + interval '65 minutes'
    AND abs(EXTRACT(EPOCH FROM ((b.booking_date + b.start_time) - now()))/60 - t.m) <= 1.5
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_booking_reminders() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_booking_reminders() TO authenticated;
