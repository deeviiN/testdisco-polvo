CREATE OR REPLACE FUNCTION public.coord_reassign_assistant_rosters(
  _from_user  uuid,
  _to_user    uuid,
  _roster_ids uuid[],
  _note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_school     uuid;
  v_role       text;
  v_is_assistant boolean;
  v_transferred int := 0;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT school_id, role INTO v_school, v_role
    FROM public.profiles
    WHERE user_id = v_caller_uid
    LIMIT 1;

  IF v_school IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  v_is_assistant := v_role IN ('assistente', 'assistente_alunos', 'secretario_escolar');

  IF v_is_assistant AND _from_user IS DISTINCT FROM v_caller_uid THEN
    RAISE EXCEPTION 'assistant_can_only_transfer_own_rooms';
  END IF;

  IF _to_user IS NULL OR _to_user = _from_user THEN
    RAISE EXCEPTION 'invalid_destination';
  END IF;

  -- Grava o dono original quando ainda não foi gravado.
  -- Para assistente, considera "próprio" tanto o vínculo direto quanto o
  -- vínculo por turma em assistant_classes (class_label + shift).
  UPDATE public.teacher_roster tr
     SET original_assistant_user_id = COALESCE(tr.assistant_user_id, v_caller_uid)
   WHERE tr.id = ANY (_roster_ids)
     AND tr.school_id = v_school
     AND tr.original_assistant_user_id IS NULL
     AND (
       NOT v_is_assistant
       OR tr.assistant_user_id = v_caller_uid
       OR EXISTS (
         SELECT 1 FROM public.assistant_classes ac
         WHERE ac.school_id = v_school
           AND ac.assistant_user_id = v_caller_uid
           AND ac.class_label = tr.class_name
           AND (ac.shift IS NULL OR tr.shift IS NULL OR ac.shift = tr.shift)
       )
     );

  -- Reatribui para o novo assistente
  UPDATE public.teacher_roster tr
     SET assistant_user_id = _to_user,
         updated_at = now()
   WHERE tr.id = ANY (_roster_ids)
     AND tr.school_id = v_school
     AND (
       NOT v_is_assistant
       OR tr.assistant_user_id = v_caller_uid
       OR tr.original_assistant_user_id = v_caller_uid
       OR EXISTS (
         SELECT 1 FROM public.assistant_classes ac
         WHERE ac.school_id = v_school
           AND ac.assistant_user_id = v_caller_uid
           AND ac.class_label = tr.class_name
           AND (ac.shift IS NULL OR tr.shift IS NULL OR ac.shift = tr.shift)
       )
     );

  GET DIAGNOSTICS v_transferred = ROW_COUNT;

  -- Se a sala voltou para o dono original, limpa o campo
  UPDATE public.teacher_roster
     SET original_assistant_user_id = NULL
   WHERE id = ANY (_roster_ids)
     AND school_id = v_school
     AND original_assistant_user_id IS NOT NULL
     AND assistant_user_id = original_assistant_user_id;

  INSERT INTO public.assistant_transfer_logs
    (school_id, from_user_id, to_user_id, roster_ids, note, created_by)
  VALUES
    (v_school, _from_user, _to_user, _roster_ids, _note, v_caller_uid);

  RETURN jsonb_build_object('transferred', v_transferred);
END;
$$;

REVOKE ALL ON FUNCTION public.coord_reassign_assistant_rosters(uuid,uuid,uuid[],text) FROM public;
GRANT EXECUTE ON FUNCTION public.coord_reassign_assistant_rosters(uuid,uuid,uuid[],text) TO authenticated;