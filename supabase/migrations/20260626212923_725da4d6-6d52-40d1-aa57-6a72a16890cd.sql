
CREATE OR REPLACE FUNCTION public.coord_reassign_assistant_rosters(
  _from_user uuid,
  _to_user uuid,
  _roster_ids uuid[],
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_caller_role text;
  v_caller_uid uuid := auth.uid();
  v_target_school uuid;
  v_updated int;
  v_is_assistant boolean;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT role, school_id INTO v_caller_role, v_school
    FROM public.profiles
    WHERE user_id = v_caller_uid AND is_approved = true
    LIMIT 1;

  IF v_school IS NULL THEN RAISE EXCEPTION 'no_school'; END IF;

  v_is_assistant := v_caller_role = ANY (ARRAY['assistente','assistente_alunos','secretario_escolar']);

  IF NOT (v_is_assistant OR v_caller_role = ANY (ARRAY['coord_pedagogico','gestor_pedagogico','chef_projeto_vida'])) THEN
    RAISE EXCEPTION 'forbidden_role';
  END IF;

  IF v_is_assistant AND (_from_user IS DISTINCT FROM v_caller_uid) THEN
    RAISE EXCEPTION 'assistant_can_only_transfer_own_rosters';
  END IF;

  SELECT school_id INTO v_target_school
    FROM public.profiles
    WHERE user_id = _to_user
      AND is_approved = true
      AND role = ANY (ARRAY['assistente','assistente_alunos','secretario_escolar'])
    LIMIT 1;
  IF v_target_school IS NULL OR v_target_school <> v_school THEN
    RAISE EXCEPTION 'target_not_assistant_in_school';
  END IF;

  UPDATE public.teacher_roster
    SET assistant_user_id = _to_user, updated_at = now()
    WHERE id = ANY (_roster_ids)
      AND school_id = v_school
      AND (_from_user IS NULL OR assistant_user_id = _from_user)
      AND (NOT v_is_assistant OR assistant_user_id = v_caller_uid);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.assistant_transfer_logs (school_id, from_user_id, to_user_id, roster_ids, note)
    VALUES (v_school, COALESCE(_from_user, v_caller_uid), _to_user, _roster_ids, _note);
  END IF;

  RETURN jsonb_build_object('ok', true, 'transferred', v_updated);
END;
$$;
