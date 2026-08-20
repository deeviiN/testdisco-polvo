-- Habilitar realtime em notifications
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

-- Trigger function: notifica gestores quando admin assina o contrato
CREATE OR REPLACE FUNCTION public.notify_gestores_admin_contract_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link TEXT;
BEGIN
  IF NEW.signer_role = 'admin' AND NEW.status = 'awaiting_gestor' THEN
    link := '/subscription?step=contract&school=' || NEW.school_id::text;

    INSERT INTO public.notifications (user_id, title, body, data)
    SELECT
      p.user_id,
      '📄 Contrato assinado pelo administrador',
      'O administrador já assinou e devolveu o contrato. Toque para baixar, assinar e finalizar a assinatura.',
      jsonb_build_object(
        'type', 'contract_admin_signed',
        'school_id', NEW.school_id,
        'contract_id', NEW.id,
        'url', link
      )
    FROM public.profiles p
    WHERE p.school_id = NEW.school_id
      AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico', 'chef_projeto_vida');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_gestores_admin_contract_signed ON public.signed_contracts;
CREATE TRIGGER trg_notify_gestores_admin_contract_signed
AFTER INSERT ON public.signed_contracts
FOR EACH ROW
EXECUTE FUNCTION public.notify_gestores_admin_contract_signed();