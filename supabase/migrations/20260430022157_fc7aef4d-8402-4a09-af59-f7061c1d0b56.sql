CREATE OR REPLACE FUNCTION public.manager_decide_profile(_profile_id uuid, _decision text, _reason text DEFAULT NULL::text, _approve_as_intended boolean DEFAULT false)
 RETURNS profile_approval_decisions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile public.profiles;
  _can boolean;
  _email text;
  _decider_name text;
  _target_role text;
  _decision_row public.profile_approval_decisions;
BEGIN
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid decision: must be approved or rejected';
  END IF;

  IF _decision = 'rejected' AND (_reason IS NULL OR length(trim(_reason)) < 5) THEN
    RAISE EXCEPTION 'Justificativa obrigatória ao rejeitar (mínimo 5 caracteres)';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Permissão: admin OU gestor/chef da escola do profile
  _can := has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = _profile.school_id
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  );
  IF NOT _can THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Captura email e nome do decisor
  SELECT email INTO _email FROM auth.users WHERE id = _profile.user_id;
  SELECT full_name INTO _decider_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF _decision = 'approved' THEN
    _target_role := CASE
      WHEN _approve_as_intended AND _profile.intended_role IS NOT NULL THEN _profile.intended_role
      ELSE _profile.role
    END;

    UPDATE public.profiles
    SET is_approved = true,
        role = _target_role,
        intended_role = NULL,
        rejection_reason = NULL, -- Limpa justificativa ao aprovar
        updated_at = now()
    WHERE id = _profile_id;
  ELSE
    -- Se for rejeição, salvamos o motivo no perfil mas mantemos o perfil
    -- para que o usuário veja a justificativa e o gestor possa revogar
    UPDATE public.profiles
    SET is_approved = false,
        rejection_reason = trim(_reason),
        updated_at = now()
    WHERE id = _profile_id;
  END IF;

  -- Grava histórico da decisão
  INSERT INTO public.profile_approval_decisions
    (user_id, school_id, full_name, email, phone, intended_role,
     decision, reason, decided_by, decided_by_name)
  VALUES
    (_profile.user_id, _profile.school_id, _profile.full_name, _email, _profile.phone,
     COALESCE(_profile.intended_role, _profile.role),
     _decision, NULLIF(trim(coalesce(_reason,'')),''),
     auth.uid(), _decider_name)
  RETURNING * INTO _decision_row;

  -- Auditoria
  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    CASE WHEN _decision = 'approved' THEN 'manager_approve_profile' ELSE 'manager_reject_profile' END,
    'profiles',
    _profile_id::text,
    jsonb_build_object(
      'user_id', _profile.user_id,
      'full_name', _profile.full_name,
      'reason', NULLIF(trim(coalesce(_reason,'')),''),
      'role', COALESCE(_target_role, _profile.role)
    ),
    auth.uid(),
    _profile.school_id
  );

  RETURN _decision_row;
END;
$function$;