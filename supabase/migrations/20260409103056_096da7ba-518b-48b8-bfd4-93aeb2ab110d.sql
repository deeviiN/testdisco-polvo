
CREATE OR REPLACE FUNCTION public.get_school_bookings_public(_school_id uuid)
RETURNS TABLE(
  id uuid,
  booking_date date,
  start_time time,
  end_time time,
  sector text,
  event_type text,
  description text,
  topic text,
  discipline text,
  status text,
  user_full_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    b.id,
    b.booking_date,
    b.start_time,
    b.end_time,
    b.sector,
    b.event_type,
    b.description,
    b.topic,
    b.discipline,
    b.status,
    COALESCE(p.full_name, 'Usuário') as user_full_name
  FROM public.bookings b
  LEFT JOIN public.profiles p ON p.user_id = b.user_id
  WHERE b.school_id = _school_id
  AND b.status = 'confirmed'
  ORDER BY b.booking_date DESC, b.start_time ASC
  LIMIT 50;
$$;
