
-- Fix 1: Restrict Chef update policy to prevent changing is_approved
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
);

-- Fix 2: Add RLS policies to webauthn_challenges
-- Only allow authenticated users to see their own challenges
CREATE POLICY "Users can view own challenges"
ON public.webauthn_challenges
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Only allow authenticated users to insert their own challenges
CREATE POLICY "Users can insert own challenges"
ON public.webauthn_challenges
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Only allow authenticated users to delete their own challenges
CREATE POLICY "Users can delete own challenges"
ON public.webauthn_challenges
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Revoke anon access explicitly
REVOKE ALL ON public.webauthn_challenges FROM anon;
