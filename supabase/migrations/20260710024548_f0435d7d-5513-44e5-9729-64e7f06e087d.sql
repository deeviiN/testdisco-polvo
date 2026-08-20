
-- reassignment_invites: require approved user
DROP POLICY IF EXISTS "school members can read invites" ON public.reassignment_invites;
CREATE POLICY "school members can read invites"
ON public.reassignment_invites
FOR SELECT
TO authenticated
USING (
  school_id = public.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

-- settings: restrict to authenticated
DROP POLICY IF EXISTS "Settings are readable by everyone" ON public.settings;
CREATE POLICY "Settings are readable by authenticated users"
ON public.settings
FOR SELECT
TO authenticated
USING (true);
REVOKE SELECT ON public.settings FROM anon;

-- support_settings: restrict to authenticated
DROP POLICY IF EXISTS "Support settings are publicly readable" ON public.support_settings;
CREATE POLICY "Support settings are readable by authenticated users"
ON public.support_settings
FOR SELECT
TO authenticated
USING (true);
REVOKE SELECT ON public.support_settings FROM anon;
