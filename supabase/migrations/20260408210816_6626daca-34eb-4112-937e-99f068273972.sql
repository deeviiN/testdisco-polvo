
-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  performed_by uuid,
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view all audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Chef can view logs from their school
CREATE POLICY "Chef can view school audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (is_chef_of_school(auth.uid(), school_id));

-- No one can modify logs via client
-- (inserts only happen via triggers with SECURITY DEFINER)

-- Index for performance
CREATE INDEX idx_audit_logs_school ON public.audit_logs(school_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Function to log profile changes (approval, deletion)
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Log approval changes
    IF OLD.is_approved IS DISTINCT FROM NEW.is_approved THEN
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
    -- Log role changes
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
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on profiles
CREATE TRIGGER trg_audit_profiles
AFTER UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profile_changes();

-- Function to log booking cancellations
CREATE OR REPLACE FUNCTION public.audit_booking_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, old_data, new_data, performed_by, school_id)
    VALUES (
      'booking_cancelled',
      'bookings',
      NEW.id::text,
      jsonb_build_object('status', OLD.status, 'booking_date', OLD.booking_date, 'sector', OLD.sector),
      jsonb_build_object('status', NEW.status, 'cancelled_by_name', NEW.cancelled_by_name, 'cancelled_by_role', NEW.cancelled_by_role),
      auth.uid(),
      NEW.school_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on bookings
CREATE TRIGGER trg_audit_bookings
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.audit_booking_changes();

-- Function to log user_roles changes
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _school_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT school_id INTO _school_id FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
    INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
    VALUES ('role_granted', 'user_roles', NEW.id::text, jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role), auth.uid(), _school_id);
  ELSIF TG_OP = 'DELETE' THEN
    SELECT school_id INTO _school_id FROM public.profiles WHERE user_id = OLD.user_id LIMIT 1;
    INSERT INTO public.audit_logs (action, table_name, record_id, old_data, performed_by, school_id)
    VALUES ('role_revoked', 'user_roles', OLD.id::text, jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role), auth.uid(), _school_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on user_roles
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();
