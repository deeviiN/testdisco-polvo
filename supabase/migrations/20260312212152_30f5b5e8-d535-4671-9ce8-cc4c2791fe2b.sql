ALTER TABLE public.bookings ADD COLUMN event_type text NOT NULL DEFAULT 'aula';
ALTER TABLE public.bookings ADD COLUMN visitor_name text DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN visitor_info text DEFAULT NULL;