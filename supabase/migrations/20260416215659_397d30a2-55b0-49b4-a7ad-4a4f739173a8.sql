-- 1) Strengthen chef escalation prevention: include is_approved guard
CREATE OR REPLACE FUNCTION public.prevent_chef_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Admins bypass
  IF has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- If acting user is a chef of the target profile's school, lock sensitive columns
  IF is_chef_of_school(auth.uid(), OLD.school_id) THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Chef users cannot change profile roles';
    END IF;
    IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
      RAISE EXCEPTION 'Chef users cannot change profile school';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Chef users cannot change profile user_id';
    END IF;
    -- Chef MAY toggle is_approved (intended for approving teachers), but cannot self-approve as gestor etc.
    -- Block promoting any profile to chef_projeto_vida or gestor_pedagogico via approval path
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved
       AND NEW.role IN ('chef_projeto_vida','gestor_pedagogico') THEN
      RAISE EXCEPTION 'Chef cannot approve manager-level roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Attach trigger to profiles (was missing)
DROP TRIGGER IF EXISTS trg_prevent_chef_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_chef_profile_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_chef_profile_escalation();

-- 3) Tighten user_roles: also prevent any non-admin from inserting/updating/deleting via FORCE RLS
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- 4) Realtime authorization hardening: force RLS on bookings so realtime stream respects policies even for table owner
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;

-- 5) Ensure replica identity FULL so realtime payloads are complete and filtered server-side
ALTER TABLE public.bookings REPLICA IDENTITY FULL;