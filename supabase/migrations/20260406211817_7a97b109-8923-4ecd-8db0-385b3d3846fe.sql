ALTER TABLE public.bookings DROP CONSTRAINT no_overlap;

ALTER TABLE public.bookings ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    school_id WITH =,
    sector WITH =,
    daterange(booking_date, booking_date, '[]') WITH &&,
    tsrange((booking_date + start_time), (booking_date + end_time), '[)') WITH &&
  ) WHERE (status = 'confirmed');