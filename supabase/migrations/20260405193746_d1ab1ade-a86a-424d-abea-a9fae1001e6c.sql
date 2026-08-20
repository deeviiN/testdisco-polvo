-- Drop the existing chef update policy that lacks WITH CHECK
DROP POLICY IF EXISTS "Chef can update profiles from same school" ON public.profiles;

-- Recreate with WITH CHECK preventing role/approval changes
CREATE POLICY "Chef can update profiles from same school"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_chef_of_school(auth.uid(), school_id))
WITH CHECK (
  is_chef_of_school(auth.uid(), school_id)
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id LIMIT 1)
  AND is_approved = (SELECT p.is_approved FROM public.profiles p WHERE p.id = profiles.id LIMIT 1)
);