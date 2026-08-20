-- Remove duplicatas pendentes mantendo a mais recente
DELETE FROM public.inbox_requests a
USING public.inbox_requests b
WHERE a.audience = 'admin'
  AND a.type = 'contrato_assinado'
  AND a.status = 'pending'
  AND b.audience = 'admin'
  AND b.type = 'contrato_assinado'
  AND b.status = 'pending'
  AND a.school_id = b.school_id
  AND a.created_at < b.created_at;

-- Garante apenas UMA solicitação pendente de "contrato_assinado" por escola
CREATE UNIQUE INDEX IF NOT EXISTS inbox_requests_one_pending_contract_per_school
  ON public.inbox_requests (school_id)
  WHERE audience = 'admin' AND type = 'contrato_assinado' AND status = 'pending';

-- Atualiza o trigger para evitar criar duplicata silenciosamente
CREATE OR REPLACE FUNCTION public.inbox_on_signed_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_school text;
BEGIN
  -- Se já existe uma solicitação pendente para esta escola, não cria outra
  IF EXISTS (
    SELECT 1 FROM public.inbox_requests
    WHERE audience='admin' AND type='contrato_assinado'
      AND status='pending' AND school_id = NEW.school_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_school FROM public.schools WHERE id = NEW.school_id LIMIT 1;
  INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
  VALUES (
    'admin', 'contrato_assinado', 'pending',
    NEW.school_id, NEW.uploaded_by, NULL,
    'Contrato assinado pelo gestor',
    'Escola ' || coalesce(v_school,'(sem nome)') || ' enviou contrato assinado.',
    jsonb_build_object('contract_id', NEW.id, 'file_name', NEW.file_name)
  );
  RETURN NEW;
END;
$function$;