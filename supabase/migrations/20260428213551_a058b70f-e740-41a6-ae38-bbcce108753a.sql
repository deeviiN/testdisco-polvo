CREATE OR REPLACE FUNCTION public.get_admin_dashboard_counts()
RETURNS TABLE(
  total_users bigint,
  approved_users bigint,
  pending_users bigint,
  total_schools bigint,
  total_bookings bigint,
  subscribed_schools bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _school_id uuid;
  _is_admin boolean;
  _is_manager boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  _is_admin := public.has_role(_uid, 'admin'::app_role);

  SELECT p.school_id,
         p.role IN ('gestor_pedagogico', 'coord_pedagogico', 'chef_projeto_vida') AND p.is_approved = true
  INTO _school_id, _is_manager
  FROM public.profiles p
  WHERE p.user_id = _uid
  LIMIT 1;

  IF _is_admin THEN
    RETURN QUERY
    SELECT
      (SELECT COUNT(*)::bigint FROM public.profiles),
      (SELECT COUNT(*)::bigint FROM public.profiles WHERE is_approved = true),
      (SELECT COUNT(*)::bigint FROM public.profiles WHERE is_approved = false AND (role = 'gestor_pedagogico' OR intended_role = 'gestor_pedagogico')),
      (SELECT COUNT(*)::bigint FROM public.schools),
      (SELECT COUNT(*)::bigint FROM public.bookings WHERE status = 'confirmed'),
      (SELECT COUNT(*)::bigint FROM public.schools WHERE subscription_end_date IS NOT NULL AND subscription_status IN ('active', 'grace_period'));
    RETURN;
  END IF;

  IF COALESCE(_is_manager, false) AND _school_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      (SELECT COUNT(*)::bigint FROM public.profiles WHERE school_id = _school_id),
      (SELECT COUNT(*)::bigint FROM public.profiles WHERE school_id = _school_id AND is_approved = true),
      (SELECT COUNT(*)::bigint FROM public.profiles WHERE school_id = _school_id AND is_approved = false),
      1::bigint,
      (SELECT COUNT(*)::bigint FROM public.bookings WHERE school_id = _school_id AND status = 'confirmed'),
      (SELECT COUNT(*)::bigint FROM public.schools WHERE id = _school_id AND subscription_end_date IS NOT NULL AND subscription_status IN ('active', 'grace_period'));
    RETURN;
  END IF;

  RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_counts() TO authenticated;