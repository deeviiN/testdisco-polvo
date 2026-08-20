
CREATE OR REPLACE FUNCTION public.request_contract_signing(_message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_api
AS $$
DECLARE
  _uid uuid := auth.uid();
  _school uuid;
  _name text;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT school_id, full_name INTO _school, _name
  FROM public.profiles
  WHERE user_id = _uid AND is_approved = true
  LIMIT 1;

  IF _school IS NULL THEN
    RAISE EXCEPTION 'no_school_or_not_approved';
  END IF;

  -- Evita duplicar pedido pendente recente (24h) do mesmo usuário
  SELECT id INTO _id
  FROM public.inbox_requests
  WHERE audience = 'gestor'
    AND school_id = _school
    AND type = 'contrato_solicitacao_assinatura'
    AND status = 'pending'
    AND requester_user_id = _uid
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  INSERT INTO public.inbox_requests (
    audience, type, status, school_id, requester_user_id, title, description, payload
  ) VALUES (
    'gestor',
    'contrato_solicitacao_assinatura',
    'pending',
    _school,
    _uid,
    'Solicitação para assinar o contrato',
    COALESCE(NULLIF(trim(_message), ''),
      _name || ' solicita que o(a) gestor(a) assine o contrato de assinatura da plataforma.'),
    jsonb_build_object('requested_by_name', _name)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_contract_signing(text) TO authenticated;
