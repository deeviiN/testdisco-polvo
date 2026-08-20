
-- 1) Novos campos em signed_contracts
ALTER TABLE public.signed_contracts
  ADD COLUMN IF NOT EXISTS accepted_full_name text,
  ADD COLUMN IF NOT EXISTS accepted_geo_lat numeric,
  ADD COLUMN IF NOT EXISTS accepted_geo_lng numeric,
  ADD COLUMN IF NOT EXISTS document_hash text,
  ADD COLUMN IF NOT EXISTS verification_token uuid UNIQUE DEFAULT gen_random_uuid();

UPDATE public.signed_contracts SET verification_token = gen_random_uuid() WHERE verification_token IS NULL;

-- 2) Assinatura do admin em company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS admin_signature_path text;

-- 3) Substitui RPC de aceite — agora aceita nome digitado, geo, hash e retorna o token
DROP FUNCTION IF EXISTS public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean);

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
  _document_hash text DEFAULT NULL
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

  _token := gen_random_uuid();
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

REVOKE ALL ON FUNCTION public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean,text,numeric,numeric,text) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean,text,numeric,numeric,text) TO authenticated;

-- 4) RPC pública de verificação — anyone com o token vê quem assinou
CREATE OR REPLACE FUNCTION public.verify_contract(_token uuid)
RETURNS TABLE (
  school_name text,
  school_inep text,
  signer_name text,
  signer_cpf_masked text,
  accepted_at timestamptz,
  accepted_ip text,
  contract_version text,
  document_hash text,
  status text,
  is_reacceptance boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.name,
    s.inep_code,
    sc.accepted_full_name,
    CASE WHEN sc.gestor_cpf IS NOT NULL AND length(sc.gestor_cpf) >= 11
         THEN '***.***.' || substring(regexp_replace(sc.gestor_cpf,'\D','','g'),7,3) || '-**'
         ELSE NULL END,
    sc.accepted_at,
    host(sc.accepted_ip),
    sc.contract_version,
    sc.document_hash,
    sc.status,
    sc.reacceptance
  FROM public.signed_contracts sc
  JOIN public.schools s ON s.id = sc.school_id
  WHERE sc.verification_token = _token
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_contract(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_contract(uuid) TO anon, authenticated;

-- 5) Storage policies para admin-signatures
DROP POLICY IF EXISTS "admin signatures read" ON storage.objects;
CREATE POLICY "admin signatures read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'admin-signatures');

DROP POLICY IF EXISTS "admin signatures write" ON storage.objects;
CREATE POLICY "admin signatures write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'admin-signatures' AND private_api.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'admin-signatures' AND private_api.has_role(auth.uid(), 'admin'::app_role));
