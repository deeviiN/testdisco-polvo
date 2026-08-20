
-- 1) Trava: assistente só altera presença das salas atribuídas a ele.
--    Remove a política antiga que permitia qualquer assistente da escola marcar qualquer sala.
DROP POLICY IF EXISTS "Assistant marks presence school-wide" ON public.teacher_roster_presence;

-- 2) Coordenação passa a gerenciar assistant_classes (mesmas regras do gestor).
DROP POLICY IF EXISTS "Gestor manages assistant_classes" ON public.assistant_classes;
CREATE POLICY "Gestor or coord manages assistant_classes"
ON public.assistant_classes
FOR ALL
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida','coord_pedagogico'])
  )
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida','coord_pedagogico'])
  )
);

-- 3) RPC para Coordenação/Gestor redistribuir salas entre assistentes
--    (sem exigir que o caller seja o dono atual da sala — diferente de transfer_assistant_responsibility).
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
  v_target_school uuid;
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT role, school_id INTO v_caller_role, v_school
    FROM public.profiles
    WHERE user_id = auth.uid() AND is_approved = true
    LIMIT 1;

  IF v_school IS NULL THEN RAISE EXCEPTION 'no_school'; END IF;
  IF v_caller_role NOT IN ('coord_pedagogico','gestor_pedagogico','chef_projeto_vida') THEN
    RAISE EXCEPTION 'forbidden_role';
  END IF;

  -- Valida que o destino é assistente aprovado da mesma escola
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
      AND (_from_user IS NULL OR assistant_user_id = _from_user);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.assistant_transfer_logs (school_id, from_user_id, to_user_id, roster_ids, note)
    VALUES (v_school, COALESCE(_from_user, auth.uid()), _to_user, _roster_ids, _note);
  END IF;

  RETURN jsonb_build_object('ok', true, 'transferred', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.coord_reassign_assistant_rosters(uuid, uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coord_reassign_assistant_rosters(uuid, uuid, uuid[], text) TO authenticated;
