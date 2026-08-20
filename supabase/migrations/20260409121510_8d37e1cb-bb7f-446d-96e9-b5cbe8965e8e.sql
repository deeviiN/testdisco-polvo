-- Fix: Prevent users from changing their own school_id via profile update
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  (auth.uid() = user_id)
  AND (role = (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
  AND (is_approved = (SELECT p.is_approved FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
  AND (school_id = (SELECT p.school_id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
);