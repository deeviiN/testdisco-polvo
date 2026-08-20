CREATE OR REPLACE FUNCTION public.admin_unlink_self_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _profile public.profiles;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Only admins can unlink their own profile';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE user_id = _uid LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('removed', false, 'reason', 'no_profile');
  END IF;

  DELETE FROM public.profiles WHERE id = _profile.id;

  INSERT INTO public.audit_logs (action, table_name, record_id, old_data, performed_by, school_id)
  VALUES (
    'admin_unlink_self_profile',
    'profiles',
    _profile.id::text,
    jsonb_build_object(
      'user_id', _profile.user_id,
      'full_name', _profile.full_name,
      'role', _profile.role,
      'school_id', _profile.school_id,
      'removed_at', now()
    ),
    _uid,
    _profile.school_id
  );

  RETURN jsonb_build_object(
    'removed', true,
    'profile_id', _profile.id,
    'school_id', _profile.school_id,
    'removed_at', now()
  );
END;
$$;