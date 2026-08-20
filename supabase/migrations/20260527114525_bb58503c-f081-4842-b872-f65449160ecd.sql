
-- Tolerância de ausência (minutos)
CREATE OR REPLACE FUNCTION public.claim_absent_booking(_booking_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_today_br date := (v_now AT TIME ZONE 'America/Sao_Paulo')::date;
  v_b public.bookings;
  v_school_id uuid;
  v_start_dt timestamptz;
  v_end_dt timestamptz;
  v_minutes_late int;
  v_usage public.booking_usage;
  v_new public.bookings;
  v_claimer_name text;
  v_owner_name text;
  v_tolerance int := 15;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_b.status <> 'confirmed' THEN RAISE EXCEPTION 'booking_not_active'; END IF;
  IF v_b.user_id = v_user THEN RAISE EXCEPTION 'cannot_claim_own'; END IF;
  IF v_b.booking_date <> v_today_br THEN RAISE EXCEPTION 'not_today'; END IF;

  v_school_id := private_api.get_user_school_id(v_user);
  IF v_b.school_id <> v_school_id THEN RAISE EXCEPTION 'wrong_school'; END IF;
  IF NOT private_api.is_user_approved(v_user) THEN RAISE EXCEPTION 'not_approved'; END IF;

  v_start_dt := (v_b.booking_date::timestamp + v_b.start_time) AT TIME ZONE 'America/Sao_Paulo';
  v_end_dt := (v_b.booking_date::timestamp + v_b.end_time) AT TIME ZONE 'America/Sao_Paulo';

  IF v_now < v_start_dt + (v_tolerance || ' minutes')::interval THEN
    RAISE EXCEPTION 'within_tolerance';
  END IF;
  IF v_now >= v_end_dt THEN RAISE EXCEPTION 'booking_ended'; END IF;

  SELECT * INTO v_usage FROM public.booking_usage WHERE booking_id = _booking_id;
  IF FOUND AND v_usage.started_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_started';
  END IF;

  v_minutes_late := EXTRACT(EPOCH FROM (v_now - v_start_dt))::int / 60;

  SELECT full_name INTO v_claimer_name FROM public.profiles WHERE user_id = v_user LIMIT 1;
  SELECT full_name INTO v_owner_name FROM public.profiles WHERE user_id = v_b.user_id LIMIT 1;

  -- Cancela o original marcando o motivo
  UPDATE public.bookings
     SET status = 'cancelled',
         cancelled_by_id = v_user,
         cancelled_by_name = coalesce(v_claimer_name, 'Sistema'),
         cancelled_by_role = 'sistema_ausencia',
         updated_at = v_now
   WHERE id = v_b.id;

  -- Registra a ausência em booking_usage
  IF FOUND AND v_usage.id IS NOT NULL THEN
    UPDATE public.booking_usage
       SET ended_at = v_now, end_source = 'ausencia', duration_minutes = 0, updated_at = v_now
     WHERE id = v_usage.id;
  ELSE
    INSERT INTO public.booking_usage (booking_id, school_id, user_id, started_at, ended_at, start_source, end_source, duration_minutes)
    VALUES (v_b.id, v_b.school_id, v_b.user_id, NULL, v_now, 'ausencia', 'ausencia', 0);
  END IF;

  -- Cria o novo booking em nome de quem assumiu
  INSERT INTO public.bookings (
    booking_date, start_time, end_time, sector, status,
    topic, description, discipline, event_type,
    user_id, school_id, gestor_status, resources
  ) VALUES (
    v_b.booking_date, v_b.start_time, v_b.end_time, v_b.sector, 'confirmed',
    v_b.topic, '[Assumido por ausência - dono original: ' || coalesce(v_owner_name, 'desconhecido') || ']'
      || coalesce(' ' || v_b.description, ''),
    v_b.discipline, v_b.event_type,
    v_user, v_b.school_id, 'approved', v_b.resources
  ) RETURNING * INTO v_new;

  -- Inbox: dono original perde o horário
  INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
  VALUES (
    'user', 'horario_cedido_ausencia', 'info',
    v_b.school_id, v_user, v_b.user_id,
    'Seu horário foi cedido por ausência',
    coalesce(v_claimer_name,'Um colega') || ' assumiu seu horário das '
      || to_char(v_b.start_time,'HH24:MI') || ' às ' || to_char(v_b.end_time,'HH24:MI')
      || ' (' || v_minutes_late || ' min de atraso).',
    jsonb_build_object('original_booking_id', v_b.id, 'new_booking_id', v_new.id, 'minutes_late', v_minutes_late)
  );

  -- Inbox: gestor sabe da tomada
  INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
  VALUES (
    'gestor', 'horario_assumido_ausencia', 'info',
    v_b.school_id, v_user, NULL,
    'Horário assumido por ausência',
    coalesce(v_claimer_name,'Usuário') || ' assumiu o horário de ' || coalesce(v_owner_name,'colega')
      || ' (' || to_char(v_b.start_time,'HH24:MI') || '-' || to_char(v_b.end_time,'HH24:MI') || ', '
      || v_b.sector || ').',
    jsonb_build_object('original_booking_id', v_b.id, 'new_booking_id', v_new.id, 'minutes_late', v_minutes_late)
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_absent_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_absent_booking(uuid) TO authenticated;

-- Atualiza register_booking_checkpoint para reportar quando o booking foi tomado
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _kind NOT IN ('start','end') THEN RAISE EXCEPTION 'invalid_kind'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  -- Se o booking foi cancelado por ausência, sinaliza booking_taken
  IF v_booking.status = 'cancelled' AND v_booking.cancelled_by_role = 'sistema_ausencia' THEN
    SELECT full_name INTO v_taker_name FROM public.profiles
      WHERE user_id = v_booking.cancelled_by_id LIMIT 1;
    RAISE EXCEPTION 'booking_taken:%', coalesce(v_taker_name, 'outro usuário');
  END IF;

  IF v_booking.user_id <> v_user THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_booking.booking_date <> v_today_br THEN RAISE EXCEPTION 'not_today'; END IF;
  IF v_booking.school_id <> private_api.get_user_school_id(v_user) THEN RAISE EXCEPTION 'wrong_school'; END IF;

  SELECT * INTO v_row FROM public.booking_usage WHERE booking_id = _booking_id;

  IF _kind = 'start' THEN
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
    UPDATE public.booking_usage
      SET ended_at = v_now, end_source = 'qr',
          duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_row.started_at))::int / 60),
          updated_at = v_now
      WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
