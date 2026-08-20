
CREATE OR REPLACE FUNCTION public.enforce_roster_presence_lock()
RETURNS TRIGGER
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
BEGIN
  -- Admins always allowed
  IF v_uid IS NOT NULL AND private_api.has_role(v_uid, 'admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Service role (no auth.uid) allowed
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  -- Assistant/secretary cannot UPDATE or DELETE an existing presence row
  IF v_role IN ('assistente','assistente_alunos','secretario_escolar') THEN
    RAISE EXCEPTION 'Apenas a coordenação pode alterar uma marcação já feita.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Coord/gestor: only after the period end_time has passed on presence_date
  IF v_role IN ('coord_pedagogico','gestor_pedagogico','chef_projeto_vida','supervisor') THEN
    SELECT r.end_time, COALESCE(NEW.presence_date, OLD.presence_date)
      INTO v_end_time, v_presence_date
      FROM public.teacher_roster r
     WHERE r.id = COALESCE(NEW.roster_id, OLD.roster_id);

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

  -- Other roles: block
  RAISE EXCEPTION 'Sem permissão para alterar marcação de presença.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_trp_lock_update ON public.teacher_roster_presence;
CREATE TRIGGER trg_trp_lock_update
BEFORE UPDATE ON public.teacher_roster_presence
FOR EACH ROW EXECUTE FUNCTION public.enforce_roster_presence_lock();

DROP TRIGGER IF EXISTS trg_trp_lock_delete ON public.teacher_roster_presence;
CREATE TRIGGER trg_trp_lock_delete
BEFORE DELETE ON public.teacher_roster_presence
FOR EACH ROW EXECUTE FUNCTION public.enforce_roster_presence_lock();
