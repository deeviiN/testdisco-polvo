-- Garante apenas UM contrato assinado de gestor por escola (ignorando placeholders de solicitação)
CREATE UNIQUE INDEX IF NOT EXISTS signed_contracts_one_gestor_per_school
  ON public.signed_contracts (school_id)
  WHERE signer_role = 'gestor' AND file_path NOT LIKE '\_\_request\_\_/%';