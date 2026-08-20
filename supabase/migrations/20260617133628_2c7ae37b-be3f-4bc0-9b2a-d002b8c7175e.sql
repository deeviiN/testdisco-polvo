
DROP FUNCTION IF EXISTS public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean,text,numeric,numeric,text);

CREATE OR REPLACE FUNCTION public.accept_contract_electronically(
  _school_id uuid,
  _file_name text,
  _file_path text,
  _file_size bigint,
  _gestor_cpf text,
  _accepted_ip inet,
  _accepted_user_agent text,
  _contract_version text,
  _reacceptance boolean DEFAULT false,
  _accepted_full_name text DEFAULT NULL,
  _accepted_geo_lat numeric DEFAULT NULL,
  _accepted_geo_lng numeric DEFAULT NULL,
  _document_hash text DEFAULT NULL,
  _verification_token uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, verification_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _is_school_manager boolean;
  _row_id uuid;
  _token uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT private_api.has_role(_uid, 'admin'::app_role) INTO _is_admin;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _uid AND p.school_id = _school_id AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
  ) INTO _is_school_manager;
  IF NOT (_is_admin OR _is_school_manager) THEN
    RAISE EXCEPTION 'not authorized to accept contract for this school';
  END IF;

  IF NOT _reacceptance THEN
    SELECT sc.id, sc.verification_token INTO _row_id, _token
      FROM public.signed_contracts sc
     WHERE sc.school_id = _school_id AND sc.signer_role = 'gestor'
       AND sc.reacceptance = false
       AND sc.file_path NOT LIKE '\_\_request\_\_/%' ESCAPE '\'
     LIMIT 1;
    IF _row_id IS NOT NULL THEN
      UPDATE public.schools SET contract_version = _contract_version WHERE id = _school_id;
      RETURN QUERY SELECT _row_id, _token;
      RETURN;
    END IF;
  END IF;

  -- Usa token fornecido pelo cliente (impresso no QR do PDF) se único; senão gera novo
  IF _verification_token IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.signed_contracts WHERE verification_token = _verification_token) THEN
    _token := _verification_token;
  ELSE
    _token := gen_random_uuid();
  END IF;

  INSERT INTO public.signed_contracts (
    school_id, uploaded_by, file_name, file_path, file_size, gestor_cpf,
    signer_role, status, accepted_at, accepted_ip, accepted_user_agent,
    contract_version, reacceptance, accepted_full_name, accepted_geo_lat,
    accepted_geo_lng, document_hash, verification_token
  ) VALUES (
    _school_id, _uid, _file_name, _file_path, _file_size, _gestor_cpf,
    'gestor', 'completed', now(), _accepted_ip, _accepted_user_agent,
    _contract_version, _reacceptance, _accepted_full_name, _accepted_geo_lat,
    _accepted_geo_lng, _document_hash, _token
  )
  RETURNING id INTO _row_id;

  UPDATE public.schools SET contract_version = _contract_version WHERE id = _school_id;
  RETURN QUERY SELECT _row_id, _token;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean,text,numeric,numeric,text,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean,text,numeric,numeric,text,uuid) TO authenticated;
