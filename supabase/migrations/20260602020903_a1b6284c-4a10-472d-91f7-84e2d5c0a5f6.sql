
-- bookings INSERT: require approval
DROP POLICY IF EXISTS "Users can create bookings for their school" ON public.bookings;
CREATE POLICY "Users can create bookings for their school" ON public.bookings
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

-- responsibility_transfers INSERT + SELECT: require approval
DROP POLICY IF EXISTS "Owner creates transfer" ON public.responsibility_transfers;
CREATE POLICY "Owner creates transfer" ON public.responsibility_transfers
FOR INSERT TO authenticated
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND from_user_id = auth.uid()
  AND to_user_id <> auth.uid()
  AND private_api.is_user_approved(auth.uid())
);

DROP POLICY IF EXISTS "View transfers same school" ON public.responsibility_transfers;
CREATE POLICY "View transfers same school" ON public.responsibility_transfers
FOR SELECT TO authenticated
USING (
  ((school_id = private_api.get_user_school_id(auth.uid())) AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- sector_labels SELECT
DROP POLICY IF EXISTS "Users can view sector labels from same school" ON public.sector_labels;
CREATE POLICY "Users can view sector labels from same school" ON public.sector_labels
FOR SELECT TO authenticated
USING (
  ((school_id = private_api.get_user_school_id(auth.uid())) AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- booking_gestor_history SELECT
DROP POLICY IF EXISTS "View gestor history from same school" ON public.booking_gestor_history;
CREATE POLICY "View gestor history from same school" ON public.booking_gestor_history
FOR SELECT TO authenticated
USING (
  ((school_id = private_api.get_user_school_id(auth.uid())) AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- assistant_classes SELECT
DROP POLICY IF EXISTS "View assistant_classes same school" ON public.assistant_classes;
CREATE POLICY "View assistant_classes same school" ON public.assistant_classes
FOR SELECT TO authenticated
USING (
  ((school_id = private_api.get_user_school_id(auth.uid())) AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- panel_settings SELECT
DROP POLICY IF EXISTS "View panel_settings same school" ON public.panel_settings;
CREATE POLICY "View panel_settings same school" ON public.panel_settings
FOR SELECT TO authenticated
USING (
  ((school_id = private_api.get_user_school_id(auth.uid())) AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- school_discipline_settings SELECT
DROP POLICY IF EXISTS "View discipline settings same school" ON public.school_discipline_settings;
CREATE POLICY "View discipline settings same school" ON public.school_discipline_settings
FOR SELECT TO authenticated
USING (
  ((school_id = private_api.get_user_school_id(auth.uid())) AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- storage signed-contracts SELECT: restrict to uploader or gestor/chef
DROP POLICY IF EXISTS "Users can view signed contracts from their school" ON storage.objects;
CREATE POLICY "Users can view signed contracts from their school" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-contracts'
  AND (storage.foldername(name))[1] = (private_api.get_user_school_id(auth.uid()))::text
  AND private_api.is_user_approved(auth.uid())
  AND (
    owner = auth.uid()
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  )
);
