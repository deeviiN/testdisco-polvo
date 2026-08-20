
-- Lista perfis atualmente bloqueados por vencimento
CREATE OR REPLACE FUNCTION public.admin_list_blocked_by_deadline()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  role text,
  phone text,
  school_id uuid,
  school_name text,
  city text,
  state text,
  network text,
  subscription_blocked_at timestamptz,
  subscription_deadline timestamptz,
  approved_until timestamptz,
  days_blocked integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.role,
    p.phone,
    p.school_id,
    s.name,
    s.city,
    s.state,
    s.network,
    p.subscription_blocked_at,
    p.subscription_deadline,
    p.approved_until,
    GREATEST(0, EXTRACT(DAY FROM (now() - p.subscription_blocked_at))::int) AS days_blocked
  FROM public.profiles p
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE p.subscription_blocked_at IS NOT NULL
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY p.subscription_blocked_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_blocked_by_deadline() TO authenticated;

-- Reativa acesso concedendo carência extra
CREATE OR REPLACE FUNCTION public.admin_reactivate_blocked_user(
  _user_id uuid,
  _grace_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_deadline timestamptz;
  v_profile record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores.';
  END IF;

  IF _grace_days IS NULL OR _grace_days < 1 OR _grace_days > 365 THEN
    _grace_days := 7;
  END IF;

  v_new_deadline := now() + (_grace_days || ' days')::interval;

  UPDATE public.profiles
  SET
    is_approved = true,
    subscription_blocked_at = NULL,
    approved_until = v_new_deadline,
    subscription_deadline = v_new_deadline,
    updated_at = now()
  WHERE id = _user_id
  RETURNING * INTO v_profile;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),
      'admin_reactivate_blocked_user',
      'profile',
      _user_id,
      jsonb_build_object('grace_days', _grace_days, 'new_deadline', v_new_deadline)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', _user_id,
    'new_deadline', v_new_deadline,
    'grace_days', _grace_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reactivate_blocked_user(uuid, integer) TO authenticated;
