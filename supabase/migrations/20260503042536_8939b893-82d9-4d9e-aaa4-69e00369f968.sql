
-- Allow gestor and chef to upload/update/delete logos for their own school
CREATE POLICY "Gestor chef can upload school logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'school-logos'
  AND (storage.foldername(name))[1] = (get_user_school_id(auth.uid()))::text
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
);

CREATE POLICY "Gestor chef can update school logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'school-logos'
  AND (storage.foldername(name))[1] = (get_user_school_id(auth.uid()))::text
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
);

CREATE POLICY "Gestor chef can delete school logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'school-logos'
  AND (storage.foldername(name))[1] = (get_user_school_id(auth.uid()))::text
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
);

-- Allow gestor to update logo_url field on their own school (chef already can)
CREATE POLICY "Gestor can update own school logo url"
ON public.schools
FOR UPDATE
TO authenticated
USING (
  id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'gestor_pedagogico'
      AND p.is_approved = true
  )
)
WITH CHECK (
  id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'gestor_pedagogico'
      AND p.is_approved = true
  )
);
