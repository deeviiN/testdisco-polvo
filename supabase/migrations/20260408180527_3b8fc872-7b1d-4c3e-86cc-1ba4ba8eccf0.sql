-- Fix: Restrict profile INSERT to only allow role='teacher'
-- This prevents users from self-assigning privileged roles during registration
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_approved = false
  AND role = 'teacher'
);

-- Fix: Allow Chef to approve/reject users (update is_approved) but NOT change roles
DROP POLICY IF EXISTS "Chef can update profiles from same school" ON public.profiles;

CREATE POLICY "Chef can update profiles from same school"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_chef_of_school(auth.uid(), school_id))
WITH CHECK (
  is_chef_of_school(auth.uid(), school_id)
  AND role = (SELECT p.role FROM profiles p WHERE p.id = profiles.id LIMIT 1)
);