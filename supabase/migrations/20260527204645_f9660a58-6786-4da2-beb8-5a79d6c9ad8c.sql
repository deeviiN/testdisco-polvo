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
  v_taker_name text;
  v_start_dt timestamptz;
  v_end_dt timestamptz;
  v_effective_end timestamptz;
  v_effective_start timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _kind NOT IN ('start','end') THEN RAISE EXCEPTION 'invalid_kind'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF v_booking.status = 'cancelled' AND v_booking.cancelled_by_role = 'sistema_ausencia' THEN
    SELECT full_name INTO v_taker_name FROM public.profiles
      WHERE user_id = v_booking.cancelled_by_id LIMIT 1;
    RAISE EXCEPTION 'booking_taken:%', coalesce(v_taker_name, 'outro usuário');
  END IF;

  IF v_booking.user_id <> v_user THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_booking.booking_date <> v_today_br THEN RAISE EXCEPTION 'not_today'; END IF;
  IF v_booking.school_id <> private_api.get_user_school_id(v_user) THEN RAISE EXCEPTION 'wrong_school'; END IF;

  v_start_dt := (v_booking.booking_date::timestamp + v_booking.start_time) AT TIME ZONE 'America/Sao_Paulo';
  v_end_dt := (v_booking.booking_date::timestamp + v_booking.end_time) AT TIME ZONE 'America/Sao_Paulo';

  SELECT * INTO v_row FROM public.booking_usage WHERE booking_id = _booking_id;

  IF _kind = 'start' THEN
    IF v_now >= v_end_dt THEN RAISE EXCEPTION 'booking_ended'; END IF;
    IF FOUND AND v_row.started_at IS NOT NULL THEN RAISE EXCEPTION 'already_started'; END IF;
    IF FOUND THEN
      UPDATE public.booking_usage
        SET started_at = v_now, start_source = 'qr', updated_at = v_now
        WHERE id = v_row.id RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.booking_usage (booking_id, school_id, user_id, started_at, start_source)
        VALUES (_booking_id, v_booking.school_id, v_user, v_now, 'qr')
        RETURNING * INTO v_row;
    END IF;
  ELSE
    IF NOT FOUND OR v_row.started_at IS NULL THEN RAISE EXCEPTION 'not_started'; END IF;
    IF v_row.ended_at IS NOT NULL THEN RAISE EXCEPTION 'already_ended'; END IF;

    v_effective_start := GREATEST(v_row.started_at, v_start_dt);
    v_effective_end := LEAST(v_now, v_end_dt);

    UPDATE public.booking_usage
      SET ended_at = v_effective_end,
          end_source = CASE WHEN v_now > v_end_dt THEN 'qr_auto_limite' ELSE 'qr' END,
          duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (v_effective_end - v_effective_start))::int / 60),
          updated_at = v_now
      WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.register_booking_checkpoint(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_booking_checkpoint(uuid, text) TO authenticated;