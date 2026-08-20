
-- 1. panel_settings: tighten WITH CHECK for Gestor policy
DROP POLICY IF EXISTS "Gestor manages panel_settings" ON public.panel_settings;
CREATE POLICY "Gestor manages panel_settings"
ON public.panel_settings
FOR ALL
USING (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida','coord_pedagogico'])
  )
)
WITH CHECK (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida','coord_pedagogico'])
  )
);

-- 2. roster_call_settings: tighten WITH CHECK for Gestor policy
DROP POLICY IF EXISTS "Gestor manages roster_call_settings" ON public.roster_call_settings;
CREATE POLICY "Gestor manages roster_call_settings"
ON public.roster_call_settings
FOR ALL
USING (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida'])
  )
)
WITH CHECK (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida'])
  )
);

-- 3. responsibility_transfers: prevent non-managers from mutating immutable fields.
--    RLS WITH CHECK cannot compare to OLD, so enforce via BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION public.responsibility_transfers_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_manager boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida'])
  ) INTO is_manager;

  IF NOT is_manager THEN
    IF NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
       OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
       OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.school_id IS DISTINCT FROM OLD.school_id THEN
      RAISE EXCEPTION 'Only managers can change from_user_id, to_user_id, booking_id or school_id on responsibility_transfers'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS responsibility_transfers_guard_immutable_trg ON public.responsibility_transfers;
CREATE TRIGGER responsibility_transfers_guard_immutable_trg
BEFORE UPDATE ON public.responsibility_transfers
FOR EACH ROW
EXECUTE FUNCTION public.responsibility_transfers_guard_immutable();

-- 4. settings: use user_roles-based role check instead of profiles.role
DROP POLICY IF EXISTS "Admins can manage settings" ON public.settings;
CREATE POLICY "Admins can manage settings"
ON public.settings
FOR ALL
USING (private_api.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

-- 5. Fix mutable search_path on set_updated_at_teacher_day_absence
CREATE OR REPLACE FUNCTION public.set_updated_at_teacher_day_absence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
