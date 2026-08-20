
-- 1) Add period_number column
ALTER TABLE public.teacher_roster_presence
  ADD COLUMN IF NOT EXISTS period_number SMALLINT;

-- 2) Backfill
UPDATE public.teacher_roster_presence p
   SET period_number = sp.period_number
  FROM public.teacher_roster r
  LEFT JOIN public.schedule_periods sp
    ON sp.school_id = r.school_id
   AND sp.shift = r.shift
   AND sp.start_time = r.start_time
 WHERE p.roster_id = r.id
   AND p.period_number IS NULL
   AND sp.period_number IS NOT NULL;

-- fallback: any leftover → 1
UPDATE public.teacher_roster_presence SET period_number = 1 WHERE period_number IS NULL;

ALTER TABLE public.teacher_roster_presence
  ALTER COLUMN period_number SET NOT NULL;

-- 3) Swap unique constraint
ALTER TABLE public.teacher_roster_presence
  DROP CONSTRAINT IF EXISTS teacher_roster_presence_roster_id_presence_date_key;

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.teacher_roster_presence'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%(roster_id, presence_date)%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.teacher_roster_presence DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.teacher_roster_presence
  ADD CONSTRAINT teacher_roster_presence_roster_date_period_key
  UNIQUE (roster_id, presence_date, period_number);

-- 4) Update lock trigger to use period_number → schedule_periods.end_time
CREATE OR REPLACE FUNCTION public.enforce_roster_presence_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_end_time time;
  v_presence_date date;
  v_period_end timestamptz;
  v_school_id uuid;
  v_shift text;
  v_period_number smallint;
BEGIN
  IF v_uid IS NOT NULL AND private_api.has_role(v_uid, 'admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  IF v_role IN ('assistente','assistente_alunos','secretario_escolar') THEN
    RAISE EXCEPTION 'Apenas a coordenação pode alterar uma marcação já feita.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_role IN ('coord_pedagogico','gestor_pedagogico','chef_projeto_vida','supervisor') THEN
    v_presence_date := COALESCE(NEW.presence_date, OLD.presence_date);
    v_period_number := COALESCE(NEW.period_number, OLD.period_number);

    SELECT r.school_id, r.shift, r.end_time
      INTO v_school_id, v_shift, v_end_time
      FROM public.teacher_roster r
     WHERE r.id = COALESCE(NEW.roster_id, OLD.roster_id);

    -- prefer schedule_periods end_time for the specific period_number
    IF v_period_number IS NOT NULL AND v_school_id IS NOT NULL AND v_shift IS NOT NULL THEN
      SELECT sp.end_time INTO v_end_time
        FROM public.schedule_periods sp
       WHERE sp.school_id = v_school_id
         AND sp.shift = v_shift
         AND sp.period_number = v_period_number
       LIMIT 1;
    END IF;

    IF v_end_time IS NULL OR v_presence_date IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    v_period_end := (v_presence_date::timestamp + v_end_time)
                      AT TIME ZONE 'America/Manaus';

    IF now() < v_period_end THEN
      RAISE EXCEPTION 'A coordenação só pode alterar a marcação após o término do tempo (% %).',
        v_presence_date, v_end_time
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'Sem permissão para alterar marcação de presença.'
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

-- 5) Include period_number in painel_tv RPC
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
    'weekday', _weekday
  );
END;
$function$;
