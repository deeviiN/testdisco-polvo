
-- 1) Campo de versão de contrato nas escolas
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS contract_version text;

-- 2) Restringe payment_plan aos planos atuais (Mensal / 1 ano / 2 anos)
ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_payment_plan_check;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_payment_plan_check
  CHECK (payment_plan IS NULL OR (payment_plan = ANY (ARRAY['mensal'::text, 'anual_12'::text, 'anual_24'::text])));

-- Normaliza escolas que ainda estão em planos extintos
UPDATE public.schools SET payment_plan = 'anual_24' WHERE payment_plan IN ('anual_36','anual_48');

-- 3) Colunas de aceite eletrônico em signed_contracts
ALTER TABLE public.signed_contracts
  ADD COLUMN IF NOT EXISTS accepted_ip inet,
  ADD COLUMN IF NOT EXISTS accepted_user_agent text,
  ADD COLUMN IF NOT EXISTS contract_version text,
  ADD COLUMN IF NOT EXISTS reacceptance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Remove índice único antigo (impedia múltiplos re-aceites) e recria permitindo re-aceites
DROP INDEX IF EXISTS public.signed_contracts_one_gestor_per_school;
CREATE UNIQUE INDEX IF NOT EXISTS signed_contracts_one_gestor_per_school
  ON public.signed_contracts (school_id)
  WHERE signer_role = 'gestor'
    AND file_path !~~ '\_\_request\_\_/%'
    AND reacceptance = false;

-- 4) RPC para registrar aceite eletrônico
CREATE OR REPLACE FUNCTION public.accept_contract_electronically(
  _school_id uuid,
  _file_name text,
  _file_path text,
  _file_size bigint,
  _gestor_cpf text,
  _accepted_ip inet,
  _accepted_user_agent text,
  _contract_version text,
  _reacceptance boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _is_school_manager boolean;
  _row_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT private_api.has_role(_uid, 'admin'::app_role) INTO _is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _uid
      AND p.school_id = _school_id
      AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
  ) INTO _is_school_manager;

  IF NOT (_is_admin OR _is_school_manager) THEN
    RAISE EXCEPTION 'not authorized to accept contract for this school';
  END IF;

  -- Se for re-aceite, mantém o registro original; se for primeiro aceite, garante unicidade
  IF NOT _reacceptance THEN
    -- Idempotência: se já existe primeiro aceite válido, devolve o existente
    SELECT id INTO _row_id
      FROM public.signed_contracts
     WHERE school_id = _school_id
       AND signer_role = 'gestor'
       AND reacceptance = false
       AND file_path NOT LIKE '\_\_request\_\_/%' ESCAPE '\'
     LIMIT 1;
    IF _row_id IS NOT NULL THEN
      UPDATE public.schools SET contract_version = _contract_version WHERE id = _school_id;
      RETURN _row_id;
    END IF;
  END IF;

  INSERT INTO public.signed_contracts (
    school_id, uploaded_by, file_name, file_path, file_size, gestor_cpf,
    signer_role, status, accepted_at, accepted_ip, accepted_user_agent,
    contract_version, reacceptance
  ) VALUES (
    _school_id, _uid, _file_name, _file_path, _file_size, _gestor_cpf,
    'gestor', 'completed', now(), _accepted_ip, _accepted_user_agent,
    _contract_version, _reacceptance
  )
  RETURNING id INTO _row_id;

  UPDATE public.schools SET contract_version = _contract_version WHERE id = _school_id;

  RETURN _row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_contract_electronically(uuid,text,text,bigint,text,inet,text,text,boolean) TO authenticated;
