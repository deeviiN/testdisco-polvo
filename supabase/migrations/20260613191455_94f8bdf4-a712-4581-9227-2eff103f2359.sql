CREATE OR REPLACE FUNCTION public.enforce_roster_presence_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Admins and service role can always proceed.
  IF v_uid IS NOT NULL AND private_api.has_role(v_uid, 'admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = v_uid
  LIMIT 1;

  v_presence_date := COALESCE(NEW.presence_date, OLD.presence_date);
  v_period_number := COALESCE(NEW.period_number, OLD.period_number);

  SELECT r.school_id, r.shift, r.end_time
    INTO v_school_id, v_shift, v_end_time
    FROM public.teacher_roster r
   WHERE r.id = COALESCE(NEW.roster_id, OLD.roster_id);

  -- Prefer the day's reduced schedule, then the normal period schedule, then roster end_time.
  IF v_period_number IS NOT NULL AND v_school_id IS NOT NULL AND v_shift IS NOT NULL AND v_presence_date IS NOT NULL THEN
    SELECT srd.end_time
      INTO v_end_time
      FROM public.schedule_reduced_days srd
     WHERE srd.school_id = v_school_id
       AND srd.reduced_date = v_presence_date
       AND srd.shift = v_shift
       AND srd.period_number = v_period_number
     LIMIT 1;

    IF v_end_time IS NULL THEN
      SELECT sp.end_time
        INTO v_end_time
        FROM public.schedule_periods sp
       WHERE sp.school_id = v_school_id
         AND sp.shift = v_shift
         AND sp.period_number = v_period_number
       LIMIT 1;
    END IF;
  END IF;

  IF v_end_time IS NULL OR v_presence_date IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_period_end := (v_presence_date::timestamp + v_end_time) AT TIME ZONE 'America/Manaus';

  -- Assistant roles can freely change the current period until its exact end time.
  IF v_role IN ('assistente','assistente_alunos','secretario_escolar') THEN
    IF now() < v_period_end THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION 'Tempo encerrado — o assistente só pode alterar durante o horário do tempo (% até %).',
      v_presence_date, v_end_time
      USING ERRCODE = 'check_violation';
  END IF;

  -- Coord/manager roles only adjust after the period has ended.
  IF v_role IN ('coord_pedagogico','gestor_pedagogico','chef_projeto_vida','supervisor') THEN
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
$$;