-- Atualiza o trigger de auditoria de profiles para não duplicar eventos quando o admin global age via RPCs dedicadas

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_admin boolean;
BEGIN
  _is_admin := public.has_role(auth.uid(), 'admin');

  IF TG_OP = 'UPDATE' THEN
    -- Aprovação/revogação: só registra quando NÃO for admin global
    -- (admin global usa admin_revoke_profile_access que grava 'admin_revoke_access')
    IF OLD.is_approved IS DISTINCT FROM NEW.is_approved AND NOT _is_admin THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, old_data, new_data, performed_by, school_id)
      VALUES (
        CASE WHEN NEW.is_approved THEN 'profile_approved' ELSE 'profile_rejected' END,
        'profiles',
        NEW.id::text,
        jsonb_build_object('full_name', OLD.full_name, 'role', OLD.role, 'is_approved', OLD.is_approved),
        jsonb_build_object('full_name', NEW.full_name, 'role', NEW.role, 'is_approved', NEW.is_approved),
        auth.uid(),
        NEW.school_id
      );
    END IF;

    -- Mudanças de cargo continuam registradas para qualquer ator
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, old_data, new_data, performed_by, school_id)
      VALUES (
        'profile_role_changed',
        'profiles',
        NEW.id::text,
        jsonb_build_object('full_name', OLD.full_name, 'role', OLD.role),
        jsonb_build_object('full_name', NEW.full_name, 'role', NEW.role),
        auth.uid(),
        NEW.school_id
      );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    -- Exclusão: só registra quando NÃO for admin global
    -- (admin global usa admin_log_profile_deletion que grava 'admin_delete_user')
    IF NOT _is_admin THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, old_data, performed_by, school_id)
      VALUES (
        'profile_deleted',
        'profiles',
        OLD.id::text,
        jsonb_build_object('full_name', OLD.full_name, 'role', OLD.role, 'user_id', OLD.user_id),
        auth.uid(),
        OLD.school_id
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;