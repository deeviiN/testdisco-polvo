-- Allow chef_projeto_vida (and gestor) to update their own school logo, plus storage policies for both
DROP POLICY IF EXISTS "Gestor can update own school logo url" ON public.schools;

CREATE POLICY "Gestor or chef can update own school"
ON public.schools
FOR UPDATE
TO authenticated
USING (
  id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
)
WITH CHECK (
  id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
);

-- Storage policies for school-logos bucket
DROP POLICY IF EXISTS "school-logos public read" ON storage.objects;
CREATE POLICY "school-logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'school-logos');

DROP POLICY IF EXISTS "school-logos gestor/chef/admin upload" ON storage.objects;
CREATE POLICY "school-logos gestor/chef/admin upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'school-logos'
  AND (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
        AND p.is_approved = true
        AND p.school_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "school-logos gestor/chef/admin update" ON storage.objects;
CREATE POLICY "school-logos gestor/chef/admin update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'school-logos'
  AND (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
        AND p.is_approved = true
        AND p.school_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "school-logos gestor/chef/admin delete" ON storage.objects;
CREATE POLICY "school-logos gestor/chef/admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'school-logos'
  AND (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
        AND p.is_approved = true
        AND p.school_id::text = (storage.foldername(name))[1]
    )
  )
);