ALTER TABLE public.bookings 
  ADD COLUMN cancelled_by_id uuid,
  ADD COLUMN cancelled_by_name text,
  ADD COLUMN cancelled_by_role text;