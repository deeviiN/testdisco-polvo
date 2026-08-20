-- 1) Restrict SELECT on app_remote_commands to admins only
DROP POLICY IF EXISTS "Authenticated can read remote commands" ON public.app_remote_commands;
CREATE POLICY "Admins can read remote commands"
ON public.app_remote_commands
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Require is_approved on signed-contracts storage upload
DROP POLICY IF EXISTS "Users can upload signed contracts for their school" ON storage.objects;
CREATE POLICY "Users can upload signed contracts for their school"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signed-contracts'
  AND (storage.foldername(name))[1] = (get_user_school_id(auth.uid()))::text
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.school_id = get_user_school_id(auth.uid())
  )
);