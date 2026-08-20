CREATE OR REPLACE FUNCTION public.protect_approved_until()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  -- Permite NULL (estado inicial / reset pelo webhook de pagamento)
  IF NEW.approved_until IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só admin pode definir/alterar approved_until diretamente.
  -- A RPC admin_approve_gestor_trial roda como SECURITY DEFINER e
  -- valida has_role admin internamente, então passa por aqui também.
  _is_admin := public.has_role(auth.uid(), 'admin');

  IF TG_OP = 'INSERT' THEN
    IF NOT _is_admin THEN
      RAISE EXCEPTION 'Only admins can set approved_until';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.approved_until IS DISTINCT FROM OLD.approved_until AND NOT _is_admin THEN
      RAISE EXCEPTION 'Only admins can change approved_until';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_approved_until_trg ON public.profiles;
CREATE TRIGGER protect_approved_until_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_approved_until();