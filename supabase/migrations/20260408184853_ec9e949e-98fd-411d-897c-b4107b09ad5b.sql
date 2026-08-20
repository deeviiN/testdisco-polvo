
-- Fix: Restrict Chef update policy to also pin school_id
DROP POLICY IF EXISTS "Chef can update profiles from same school" ON public.profiles;

CREATE POLICY "Chef can update profiles from same school"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_chef_of_school(auth.uid(), school_id))
WITH CHECK (
  is_chef_of_school(auth.uid(), school_id)
  AND role = (SELECT p.role FROM profiles p WHERE p.id = profiles.id LIMIT 1)
  AND is_approved = (SELECT p.is_approved FROM profiles p WHERE p.id = profiles.id LIMIT 1)
  AND school_id = (SELECT p.school_id FROM profiles p WHERE p.id = profiles.id LIMIT 1)
);
