-- Habilita extensão de busca por trigramas (acelera ILIKE %texto%)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices trigram para busca textual parcial (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm
  ON public.schools USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_schools_city_trgm
  ON public.schools USING gin (city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_schools_inep_trgm
  ON public.schools USING gin (inep_code gin_trgm_ops);

-- Índice para ordenação alfabética eficiente (LOWER(name))
CREATE INDEX IF NOT EXISTS idx_schools_lower_name
  ON public.schools ((lower(name)));

-- Índices btree para filtros exatos do painel admin
CREATE INDEX IF NOT EXISTS idx_schools_state ON public.schools (state);
CREATE INDEX IF NOT EXISTS idx_schools_network ON public.schools (network);
CREATE INDEX IF NOT EXISTS idx_schools_city ON public.schools (city);

-- Recria a função usando LOWER(name) para casar com o índice de ordenação
CREATE OR REPLACE FUNCTION public.list_schools_admin_paginated(
  _state text DEFAULT NULL,
  _city text DEFAULT NULL,
  _network text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
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
  grace_period_days integer,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT s.*
    FROM public.schools s
    WHERE (_state IS NULL OR s.state = _state)
      AND (_network IS NULL OR s.network = _network)
      AND (_city IS NULL OR s.city = _city)
      AND (
        _search IS NULL
        OR _search = ''
        OR s.name ILIKE '%' || _search || '%'
        OR s.city ILIKE '%' || _search || '%'
        OR COALESCE(s.inep_code, '') ILIKE '%' || _search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS total FROM filtered
  )
  SELECT
    f.id, f.name, f.city, f.state, f.inep_code, f.network,
    f.is_active, f.logo_url, f.address, f.created_at,
    f.subscription_status, f.subscription_end_date, f.grace_period_days,
    (SELECT total FROM counted) AS total_count
  FROM filtered f
  ORDER BY lower(f.name) ASC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

-- Atualiza estatísticas para o planner usar os novos índices
ANALYZE public.schools;