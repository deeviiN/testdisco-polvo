-- 1. Remove duplicate policies on signatures bucket
DROP POLICY IF EXISTS "Users can upload own signature" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own signature" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own signature" ON storage.objects;

-- 2. Remove misleading SELECT policy on school-logos (bucket is public)
DROP POLICY IF EXISTS "Admins and chefs can view school logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view school logos" ON storage.objects;
DROP POLICY IF EXISTS "Chefs can view school logos" ON storage.objects;

-- 3. Protect booking cancellation/gestor fields from owner manipulation
CREATE OR REPLACE FUNCTION public.protect_booking_gestor_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _is_gestor boolean;
BEGIN
  -- Admin bypass
  _is_admin := has_role(auth.uid(), 'admin');
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  -- Check if user is gestor/coord/chef of the same school
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND school_id = NEW.school_id
      AND role IN ('gestor_pedagogico', 'coord_pedagogico', 'chef_projeto_vida')
      AND is_approved = true
  ) INTO _is_gestor;

  -- If user is the booking owner but NOT a gestor, block changes to gestor/cancellation fields
  IF NEW.user_id = auth.uid() AND NOT _is_gestor THEN
    IF NEW.gestor_status IS DISTINCT FROM OLD.gestor_status THEN
      RAISE EXCEPTION 'Only managers can change gestor_status';
    END IF;
    IF NEW.gestor_response IS DISTINCT FROM OLD.gestor_response THEN
      RAISE EXCEPTION 'Only managers can change gestor_response';
    END IF;
    IF NEW.gestor_responded_by IS DISTINCT FROM OLD.gestor_responded_by THEN
      RAISE EXCEPTION 'Only managers can change gestor_responded_by';
    END IF;
    IF NEW.gestor_responded_at IS DISTINCT FROM OLD.gestor_responded_at THEN
      RAISE EXCEPTION 'Only managers can change gestor_responded_at';
    END IF;
    -- Owner CAN cancel their own booking, but cancelled_by fields must reflect themselves
    IF NEW.cancelled_by_id IS DISTINCT FROM OLD.cancelled_by_id
       AND NEW.cancelled_by_id IS NOT NULL
       AND NEW.cancelled_by_id <> auth.uid() THEN
      RAISE EXCEPTION 'cancelled_by_id must match the acting user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_booking_gestor_fields_trg ON public.bookings;
CREATE TRIGGER protect_booking_gestor_fields_trg
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_booking_gestor_fields();

-- 4. Move extensions out of public schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;