-- Fix 1: Replace Chef update policy with trigger-based protection
DROP POLICY IF EXISTS "Chef can update profiles from same school" ON public.profiles;

CREATE OR REPLACE FUNCTION public.prevent_chef_profile_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    IF is_chef_of_school(auth.uid(), OLD.school_id) THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Chef users cannot change profile roles';
      END IF;
      IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
        RAISE EXCEPTION 'Chef users cannot change profile school';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_chef_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_chef_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_chef_profile_escalation();

CREATE POLICY "Chef can update profiles from same school"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (is_chef_of_school(auth.uid(), school_id))
  WITH CHECK (is_chef_of_school(auth.uid(), school_id));

-- Fix 2: Add missing UPDATE policy for webauthn_credentials
CREATE POLICY "Users can update own webauthn credentials"
  ON public.webauthn_credentials
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());