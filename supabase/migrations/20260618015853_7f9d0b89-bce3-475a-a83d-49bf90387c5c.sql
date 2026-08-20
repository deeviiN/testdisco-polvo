-- Garante CPF obrigatório apenas para NOVOS cadastros de profissionais.
-- Perfis já existentes sem CPF continuam válidos (campo nullable).

CREATE OR REPLACE FUNCTION public.enforce_cpf_on_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');

  IF length(digits) <> 11 THEN
    RAISE EXCEPTION 'CPF é obrigatório no cadastro (11 dígitos).'
      USING HINT = 'Informe um CPF válido no formato 000.000.000-00';
  END IF;

  -- Rejeita sequências repetidas (00000000000, 11111111111, etc.)
  IF digits ~ '^(\d)\1{10}$' THEN
    RAISE EXCEPTION 'CPF inválido.';
  END IF;

  -- Normaliza armazenamento (somente dígitos)
  NEW.cpf := digits;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cpf_on_new_profile ON public.profiles;
CREATE TRIGGER trg_enforce_cpf_on_new_profile
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_cpf_on_new_profile();