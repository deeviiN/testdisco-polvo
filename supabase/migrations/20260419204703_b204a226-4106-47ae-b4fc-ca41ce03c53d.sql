
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.list_school_states_admin()
RETURNS TABLE(state text, school_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.state, COUNT(*)::bigint
  FROM public.schools s
  WHERE has_role(auth.uid(), 'admin')
  GROUP BY s.state
  ORDER BY s.state;
$$;

CREATE OR REPLACE FUNCTION public.list_school_cities_admin(_state text)
RETURNS TABLE(city text, school_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.city, COUNT(*)::bigint
  FROM public.schools s
  WHERE has_role(auth.uid(), 'admin') AND s.state = _state
  GROUP BY s.city
  ORDER BY s.city;
$$;

CREATE OR REPLACE FUNCTION public.list_schools_admin_paginated(
  _state text DEFAULT NULL,
  _city text DEFAULT NULL,
  _network text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, city text, state text, inep_code text, network text,
  is_active boolean, logo_url text, address text, created_at timestamptz,
  subscription_status text, subscription_end_date date, grace_period_days int,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH filtered AS (
    SELECT s.*
    FROM public.schools s
    WHERE has_role(auth.uid(), 'admin')
      AND (_state IS NULL OR s.state = _state)
      AND (_city IS NULL OR s.city = _city)
      AND (_network IS NULL OR s.network = _network)
      AND (
        _search IS NULL OR _search = ''
        OR s.name ILIKE '%' || _search || '%'
        OR s.city ILIKE '%' || _search || '%'
        OR COALESCE(s.inep_code, '') ILIKE '%' || _search || '%'
      )
  ), counted AS (
    SELECT COUNT(*)::bigint AS total_count FROM filtered
  )
  SELECT f.id, f.name, f.city, f.state, f.inep_code, f.network,
         f.is_active, f.logo_url, f.address, f.created_at,
         f.subscription_status, f.subscription_end_date, f.grace_period_days,
         (SELECT total_count FROM counted)
  FROM filtered f
  ORDER BY f.name
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
$$;

CREATE INDEX IF NOT EXISTS idx_schools_state ON public.schools(state);
CREATE INDEX IF NOT EXISTS idx_schools_state_city ON public.schools(state, city);
CREATE INDEX IF NOT EXISTS idx_schools_network ON public.schools(network);
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm ON public.schools USING gin (name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_schools_city_trgm ON public.schools USING gin (city public.gin_trgm_ops);
