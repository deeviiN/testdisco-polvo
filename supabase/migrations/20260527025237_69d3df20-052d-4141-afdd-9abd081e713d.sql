
CREATE OR REPLACE FUNCTION public.register_booking_checkpoint(_booking_id uuid, _kind text)
RETURNS public.booking_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_today_br date := (v_now AT TIME ZONE 'America/Sao_Paulo')::date;
  v_row public.booking_usage;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _kind NOT IN ('start','end') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  IF v_booking.user_id <> v_user THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  IF v_booking.booking_date <> v_today_br THEN
    RAISE EXCEPTION 'not_today';
  END IF;
  IF v_booking.school_id <> private_api.get_user_school_id(v_user) THEN
    RAISE EXCEPTION 'wrong_school';
  END IF;

  SELECT * INTO v_row FROM public.booking_usage WHERE booking_id = _booking_id;

  IF _kind = 'start' THEN
    IF FOUND AND v_row.started_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_started';
    END IF;
    IF FOUND THEN
      UPDATE public.booking_usage
        SET started_at = v_now, start_source = 'qr', updated_at = v_now
        WHERE id = v_row.id
        RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.booking_usage (booking_id, school_id, user_id, started_at, start_source)
        VALUES (_booking_id, v_booking.school_id, v_user, v_now, 'qr')
        RETURNING * INTO v_row;
    END IF;
  ELSE
    IF NOT FOUND OR v_row.started_at IS NULL THEN
      RAISE EXCEPTION 'not_started';
    END IF;
    IF v_row.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_ended';
    END IF;
    UPDATE public.booking_usage
      SET ended_at = v_now,
          end_source = 'qr',
          duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_row.started_at))::int / 60),
          updated_at = v_now
      WHERE id = v_row.id
      RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
