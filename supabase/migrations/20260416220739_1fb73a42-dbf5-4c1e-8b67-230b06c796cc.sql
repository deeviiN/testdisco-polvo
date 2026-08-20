
CREATE OR REPLACE FUNCTION public.list_schools_admin()
RETURNS TABLE(
  id uuid,
  name text,
  city text,
  state text,
  inep_code text,
  network text,
  is_active boolean,
  logo_url text,
  address text,
  created_at timestamptz,
  subscription_status text,
  subscription_end_date date,
  grace_period_days int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.logo_url, s.address, s.created_at,
         s.subscription_status, s.subscription_end_date, s.grace_period_days
  FROM public.schools s
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY s.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_schools_admin() TO authenticated;
