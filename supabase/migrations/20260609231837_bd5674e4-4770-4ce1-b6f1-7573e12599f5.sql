CREATE OR REPLACE FUNCTION public.get_painel_tv_data(_school_id uuid, _weekday_override smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _today date := (now() AT TIME ZONE 'America/Manaus')::date;
  _weekday smallint := COALESCE(_weekday_override, EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Manaus'))::smallint);
  _periods jsonb;
  _roster jsonb;
  _presence jsonb;
  _reduced jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.shift, p.period_number), '[]'::jsonb)
    INTO _periods
  FROM (
    SELECT id, school_id, shift, period_number, label,
           to_char(start_time,'HH24:MI:SS') AS start_time,
           to_char(end_time,'HH24:MI:SS') AS end_time
    FROM public.schedule_periods
    WHERE school_id = _school_id
  ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.start_time), '[]'::jsonb)
    INTO _roster
  FROM (
    SELECT id, school_id, teacher_name, nickname, discipline, class_name,
           weekday,
           to_char(start_time,'HH24:MI:SS') AS start_time,
           to_char(end_time,'HH24:MI:SS') AS end_time,
           shift, block_name, room_name, period_id
    FROM public.teacher_roster
    WHERE school_id = _school_id AND weekday = _weekday
  ) r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('roster_id', roster_id, 'status', status, 'period_number', period_number)), '[]'::jsonb)
    INTO _presence
  FROM public.teacher_roster_presence
  WHERE school_id = _school_id AND presence_date = _today;

  SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    INTO _reduced
  FROM (
    SELECT shift, period_number, label,
           to_char(start_time,'HH24:MI:SS') AS start_time,
           to_char(end_time,'HH24:MI:SS') AS end_time
    FROM public.schedule_reduced_days
    WHERE school_id = _school_id AND reduced_date = _today
  ) d;

  RETURN jsonb_build_object(
    'periods', _periods,
    'roster', _roster,
    'presence', _presence,
    'reduced', _reduced,
    'today', _today,
    'weekday', _weekday,
    'server_now', to_char(now() AT TIME ZONE 'America/Manaus', 'YYYY-MM-DD"T"HH24:MI:SS')
  );
END;
$function$