CREATE OR REPLACE FUNCTION public.ensure_admin_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _profile public.profiles;
  _school_id uuid;
  _email text;
  _name text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only allow if caller is admin
  IF NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Only admins can use this function';
  END IF;

  -- Return existing profile if any
  SELECT * INTO _profile FROM public.profiles WHERE user_id = _uid LIMIT 1;
  IF FOUND THEN
    RETURN _profile;
  END IF;

  -- Pick any active school as placeholder
  SELECT id INTO _school_id FROM public.schools WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
  IF _school_id IS NULL THEN
    SELECT id INTO _school_id FROM public.schools ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'No school available to attach admin profile';
  END IF;

  -- Get email/name from auth.users for default full_name
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
  INTO _email, _name
  FROM auth.users WHERE id = _uid;

  INSERT INTO public.profiles (user_id, full_name, school_id, role, is_approved)
  VALUES (_uid, COALESCE(_name, 'Administrador'), _school_id, 'gestor_pedagogico', true)
  RETURNING * INTO _profile;

  RETURN _profile;
END;
$$;