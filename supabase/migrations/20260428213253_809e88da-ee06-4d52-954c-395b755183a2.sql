CREATE OR REPLACE FUNCTION public.get_admin_dashboard_counts()
RETURNS TABLE(
  total_users bigint,
  approved_users bigint,
  pending_users bigint,
  total_schools bigint,
  total_bookings bigint,
  subscribed_schools bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM public.profiles WHERE public.has_role(auth.uid(), 'admin')),
    (SELECT COUNT(*)::bigint FROM public.profiles WHERE public.has_role(auth.uid(), 'admin') AND is_approved = true),
    (SELECT COUNT(*)::bigint FROM public.profiles WHERE public.has_role(auth.uid(), 'admin') AND is_approved = false AND (role = 'gestor_pedagogico' OR intended_role = 'gestor_pedagogico')),
    (SELECT COUNT(*)::bigint FROM public.schools WHERE public.has_role(auth.uid(), 'admin')),
    (SELECT COUNT(*)::bigint FROM public.bookings WHERE public.has_role(auth.uid(), 'admin') AND status = 'confirmed'),
    (SELECT COUNT(*)::bigint FROM public.schools WHERE public.has_role(auth.uid(), 'admin') AND subscription_end_date IS NOT NULL AND subscription_status IN ('active', 'grace_period'));
$$;

CREATE OR REPLACE FUNCTION public.list_subscribed_schools_admin(
  _limit integer DEFAULT 1000,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  city text,
  state text,
  inep_code text,
  network text,
  is_active boolean,
  subscription_status text,
  subscription_end_date date,
  grace_period_days integer,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH filtered AS (
    SELECT s.*
    FROM public.schools s
    WHERE public.has_role(auth.uid(), 'admin')
      AND s.subscription_end_date IS NOT NULL
      AND s.subscription_status IN ('active', 'grace_period')
  ), counted AS (
    SELECT COUNT(*)::bigint AS total_count FROM filtered
  )
  SELECT f.id, f.name, f.city, f.state, f.inep_code, f.network,
         f.is_active, f.subscription_status, f.subscription_end_date,
         f.grace_period_days, (SELECT counted.total_count FROM counted)
  FROM filtered f
  ORDER BY f.state, f.city, f.name
  LIMIT LEAST(GREATEST(_limit, 1), 1000)
  OFFSET GREATEST(_offset, 0);
$$;

CREATE INDEX IF NOT EXISTS idx_schools_subscription_admin
ON public.schools (subscription_status, subscription_end_date)
WHERE subscription_end_date IS NOT NULL;