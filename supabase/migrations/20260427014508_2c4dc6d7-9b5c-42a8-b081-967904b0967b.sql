-- 1) Coluna de trial
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_until timestamptz;

-- 2) Admin aprova gestor com trial de 7 dias
CREATE OR REPLACE FUNCTION public.admin_approve_gestor_trial(_profile_id uuid)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve gestor trial';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF _profile.role NOT IN ('gestor_pedagogico','chef_projeto_vida')
     AND COALESCE(_profile.intended_role,'') NOT IN ('gestor_pedagogico','chef_projeto_vida') THEN
    RAISE EXCEPTION 'Only manager-level profiles can receive trial approval';
  END IF;

  UPDATE public.profiles
  SET is_approved = true,
      role = COALESCE(NULLIF(_profile.intended_role,''), _profile.role),
      intended_role = NULL,
      approved_until = now() + interval '7 days',
      updated_at = now()
  WHERE id = _profile_id
  RETURNING * INTO _profile;

  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'admin_approve_gestor_trial',
    'profiles',
    _profile.id::text,
    jsonb_build_object(
      'user_id', _profile.user_id,
      'full_name', _profile.full_name,
      'role', _profile.role,
      'approved_until', _profile.approved_until
    ),
    auth.uid(),
    _profile.school_id
  );

  RETURN _profile;
END;
$$;

-- 3) Ao confirmar pagamento, ativa escola e remove limite dos gestores
CREATE OR REPLACE FUNCTION public.activate_school_subscription(_school_id uuid, _new_end_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.schools
  SET subscription_status = 'active',
      subscription_end_date = _new_end_date
  WHERE id = _school_id;

  -- Gestores aprovados perdem o limite (acesso permanente enquanto escola ativa)
  UPDATE public.profiles
  SET approved_until = NULL,
      is_approved = true,
      updated_at = now()
  WHERE school_id = _school_id
    AND role IN ('gestor_pedagogico','chef_projeto_vida');

  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'school_subscription_activated',
    'schools',
    _school_id::text,
    jsonb_build_object('subscription_end_date', _new_end_date),
    NULL,
    _school_id
  );
END;
$$;

-- 4) Status do trial para o usuário logado
CREATE OR REPLACE FUNCTION public.get_my_trial_status()
RETURNS TABLE(
  is_approved boolean,
  approved_until timestamptz,
  trial_expired boolean,
  school_subscription_status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.is_approved,
    p.approved_until,
    (p.approved_until IS NOT NULL AND p.approved_until < now()) AS trial_expired,
    s.subscription_status
  FROM public.profiles p
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;