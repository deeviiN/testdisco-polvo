-- Replace the self-insert policy on profiles to block privilege escalation at signup
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