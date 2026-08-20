-- Funções para o admin global revogar acesso e excluir perfil registrando motivo no audit log

CREATE OR REPLACE FUNCTION public.admin_revoke_profile_access(_profile_id uuid, _reason text DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _profile public.profiles;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can revoke profile access';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF _profile.is_approved = false THEN
    RAISE EXCEPTION 'Profile is already not approved';
  END IF;

  UPDATE public.profiles
  SET is_approved = false, updated_at = now()
  WHERE id = _profile_id
  RETURNING * INTO _profile;

  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'admin_revoke_access',
    'profiles',
    _profile.id::text,
    jsonb_build_object(
      'user_id', _profile.user_id,
      'full_name', _profile.full_name,
      'role', _profile.role,
      'reason', NULLIF(trim(coalesce(_reason, '')), '')
    ),
    auth.uid(),
    _profile.school_id
  );

  RETURN _profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_log_profile_deletion(_profile_id uuid, _user_id uuid, _full_name text, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _school_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can log profile deletions';
  END IF;

  SELECT school_id INTO _school_id FROM public.profiles WHERE id = _profile_id LIMIT 1;

  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'admin_delete_user',
    'profiles',
    _profile_id::text,
    jsonb_build_object(
      'user_id', _user_id,
      'full_name', _full_name,
      'reason', NULLIF(trim(coalesce(_reason, '')), '')
    ),
    auth.uid(),
    _school_id
  );
END;
$$;