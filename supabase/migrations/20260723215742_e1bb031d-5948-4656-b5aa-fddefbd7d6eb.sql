
-- Atualiza função audit_role_changes para incluir UPDATE
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by)
    VALUES ('role_granted', 'user_roles', NEW.id::text,
            jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role),
            auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, old_data, new_data, performed_by)
    VALUES ('role_changed', 'user_roles', NEW.id::text,
            jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role),
            jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role),
            auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, old_data, performed_by)
    VALUES ('role_revoked', 'user_roles', OLD.id::text,
            jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role),
            auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Recria trigger cobrindo INSERT/UPDATE/DELETE
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();

-- RPC para registrar eventos sensíveis manualmente (apenas admin)
CREATE OR REPLACE FUNCTION public.log_sensitive_event(
  _action text,
  _table_name text,
  _record_id text DEFAULT NULL,
  _details jsonb DEFAULT NULL,
  _school_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT private_api.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (_action, _table_name, _record_id, _details, auth.uid(), _school_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_sensitive_event(text,text,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_sensitive_event(text,text,text,jsonb,uuid) TO authenticated, service_role;
