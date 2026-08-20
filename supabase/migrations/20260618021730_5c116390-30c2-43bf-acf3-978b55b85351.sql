
-- bookings SELECT: require approved
DROP POLICY IF EXISTS "Users can view bookings from same school" ON public.bookings;
CREATE POLICY "Users can view bookings from same school"
ON public.bookings
FOR SELECT
USING (
  (school_id = private_api.get_user_school_id(auth.uid())
   AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- school_siren_settings SELECT: qualify function + approved
DROP POLICY IF EXISTS "school members read siren settings" ON public.school_siren_settings;
CREATE POLICY "school members read siren settings"
ON public.school_siren_settings
FOR SELECT
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

-- sector_labels writes: require approved manager
DROP POLICY IF EXISTS "Managers can insert sector labels" ON public.sector_labels;
CREATE POLICY "Managers can insert sector labels"
ON public.sector_labels
FOR INSERT
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida'])
  )
);

DROP POLICY IF EXISTS "Managers can update sector labels" ON public.sector_labels;
CREATE POLICY "Managers can update sector labels"
ON public.sector_labels
FOR UPDATE
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida'])
  )
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida'])
  )
);

DROP POLICY IF EXISTS "Managers can delete sector labels" ON public.sector_labels;
CREATE POLICY "Managers can delete sector labels"
ON public.sector_labels
FOR DELETE
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida'])
  )
);

-- realtime.messages: require approved
DROP POLICY IF EXISTS "Authenticated users can read same-school realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can read same-school realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'school:%'
  AND (SUBSTRING(realtime.topic() FROM 8))::uuid = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

DROP POLICY IF EXISTS "Authenticated users can broadcast same-school realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast same-school realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'school:%'
  AND (SUBSTRING(realtime.topic() FROM 8))::uuid = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);
