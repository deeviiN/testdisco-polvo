
-- 1) app_remote_commands: restringir SELECT a usuários aprovados
DROP POLICY IF EXISTS "Authenticated can read remote commands" ON public.app_remote_commands;
CREATE POLICY "Approved users can read remote commands"
ON public.app_remote_commands
FOR SELECT
TO authenticated
USING (private_api.is_user_approved(auth.uid()));

-- 2) app_version_manifest: UPDATE exige is_approved = true
DROP POLICY IF EXISTS "Admins and managers can update app version manifest" ON public.app_version_manifest;
CREATE POLICY "Admins and approved managers can update app version manifest"
ON public.app_version_manifest
FOR UPDATE
TO authenticated
USING (
  private_api.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico'::text, 'chef_projeto_vida'::text])
  )
)
WITH CHECK (
  private_api.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico'::text, 'chef_projeto_vida'::text])
  )
);

-- 3) direct_messages: SELECT exige mesma escola
DROP POLICY IF EXISTS "DM participants can read" ON public.direct_messages;
CREATE POLICY "DM participants in same school can read"
ON public.direct_messages
FOR SELECT
TO authenticated
USING (
  ((auth.uid() = sender_id) OR (auth.uid() = recipient_id))
  AND school_id = private_api.get_user_school_id(auth.uid())
);

-- 4) gov-logos storage upload: caminho deve conter o school_id do gestor
DROP POLICY IF EXISTS "gov-logos gestor upload own school" ON storage.objects;
CREATE POLICY "gov-logos gestor upload own school"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gov-logos'::text
  AND (storage.foldername(name))[1] = 'schools'::text
  AND (storage.foldername(name))[2] = private_api.get_user_school_id(auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico'::text, 'chef_projeto_vida'::text])
  )
);
