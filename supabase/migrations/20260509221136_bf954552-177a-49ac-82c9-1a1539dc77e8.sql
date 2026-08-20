CREATE OR REPLACE FUNCTION public.is_user_approved(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _uid AND is_approved = true
  );
$$;

DROP POLICY IF EXISTS "Users can view profiles from same school" ON public.profiles;

CREATE POLICY "Users can view profiles from same school"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    school_id = public.get_user_school_id(auth.uid())
    AND public.is_user_approved(auth.uid())
  )
);