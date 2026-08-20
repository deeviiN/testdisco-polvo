CREATE OR REPLACE FUNCTION public.log_client_error(
  _rpc text,
  _code text DEFAULT NULL,
  _message text DEFAULT NULL,
  _details text DEFAULT NULL,
  _hint text DEFAULT NULL,
  _context text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _school_id uuid;
  _log_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT school_id INTO _school_id FROM public.profiles WHERE user_id = _uid LIMIT 1;

  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'client_error_log',
    'client',
    NULL,
    jsonb_build_object(
      'rpc', _rpc,
      'code', _code,
      'message', _message,
      'details', _details,
      'hint', _hint,
      'context', _context,
      'logged_at', now()
    ),
    _uid,
    _school_id
  )
  RETURNING id INTO _log_id;

  RETURN _log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text) TO authenticated;