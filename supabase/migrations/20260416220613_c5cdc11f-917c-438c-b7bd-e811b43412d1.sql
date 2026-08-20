
-- 1) Hide subscription fields from non-admin/non-chef users via column-level GRANT
REVOKE SELECT (subscription_status, subscription_end_date, grace_period_days) ON public.schools FROM authenticated, anon;

-- Re-grant explicitly all OTHER columns to authenticated so existing reads keep working
GRANT SELECT (id, name, city, state, inep_code, network, is_active, logo_url, address, created_at) ON public.schools TO authenticated, anon;

-- 2) RPC for any authenticated user of a school to read access level (no raw dates exposed unless they are chef/admin)
CREATE OR REPLACE FUNCTION public.get_school_access_info(_school_id uuid)
RETURNS TABLE(
  access_level text,
  subscription_status text,
  subscription_end_date date,
  grace_period_days int,
  days_remaining int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_priv boolean;
BEGIN
  -- Caller must belong to this school OR be admin/chef
  IF NOT (
    get_user_school_id(auth.uid()) = _school_id
    OR has_role(auth.uid(), 'admin')
    OR is_chef_of_school(auth.uid(), _school_id)
  ) THEN
    RETURN;
  END IF;

  _is_priv := has_role(auth.uid(), 'admin') OR is_chef_of_school(auth.uid(), _school_id);

  RETURN QUERY
  SELECT
    get_school_access_level(_school_id) AS access_level,
    CASE WHEN _is_priv THEN s.subscription_status ELSE NULL END AS subscription_status,
    CASE WHEN _is_priv THEN s.subscription_end_date ELSE NULL END AS subscription_end_date,
    CASE WHEN _is_priv THEN s.grace_period_days ELSE NULL END AS grace_period_days,
    CASE
      WHEN s.subscription_status = 'grace_period' AND s.subscription_end_date IS NOT NULL THEN
        GREATEST(0, (s.subscription_end_date + s.grace_period_days) - CURRENT_DATE)::int
      ELSE NULL
    END AS days_remaining
  FROM public.schools s
  WHERE s.id = _school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_access_info(uuid) TO authenticated;

-- 3) RPC for admin/chef to read full subscription details for management screens
CREATE OR REPLACE FUNCTION public.get_school_subscription_admin(_school_id uuid)
RETURNS TABLE(
  subscription_status text,
  subscription_end_date date,
  grace_period_days int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.subscription_status, s.subscription_end_date, s.grace_period_days
  FROM public.schools s
  WHERE s.id = _school_id
    AND (has_role(auth.uid(), 'admin') OR is_chef_of_school(auth.uid(), _school_id));
$$;

GRANT EXECUTE ON FUNCTION public.get_school_subscription_admin(uuid) TO authenticated;

-- 4) Explicit deny-all RLS policies on webauthn_challenges (only edge function with service role can access)
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all client access to webauthn_challenges select" ON public.webauthn_challenges;
DROP POLICY IF EXISTS "Deny all client access to webauthn_challenges insert" ON public.webauthn_challenges;
DROP POLICY IF EXISTS "Deny all client access to webauthn_challenges update" ON public.webauthn_challenges;
DROP POLICY IF EXISTS "Deny all client access to webauthn_challenges delete" ON public.webauthn_challenges;

CREATE POLICY "Deny all client access to webauthn_challenges select"
  ON public.webauthn_challenges FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "Deny all client access to webauthn_challenges insert"
  ON public.webauthn_challenges FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "Deny all client access to webauthn_challenges update"
  ON public.webauthn_challenges FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny all client access to webauthn_challenges delete"
  ON public.webauthn_challenges FOR DELETE TO authenticated, anon USING (false);

-- 5) Restrict listing of school-logos bucket: keep public read of individual objects, but block LIST
-- Public bucket already allows GET on known object paths. We block listing (object enumeration) by
-- removing any permissive SELECT policy that allows wildcard LIST and replacing it with object-by-id only.
-- Note: with public bucket, anon can still GET via public URL (getPublicUrl) since storage proxies that.
-- We add a policy to ensure only authenticated users can call storage.objects SELECT for listing.
DROP POLICY IF EXISTS "Public can list school-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list school-logos" ON storage.objects;

-- Allow only admins/chef to list/enumerate objects in school-logos
CREATE POLICY "Admins and chef can list school-logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND (has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'chef_projeto_vida'
    ))
  );
