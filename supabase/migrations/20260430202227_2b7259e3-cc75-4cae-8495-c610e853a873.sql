DROP FUNCTION IF EXISTS public.list_schools_admin_paginated(text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.list_schools_admin_paginated(
  _state   text    DEFAULT NULL,
  _city    text    DEFAULT NULL,
  _network text    DEFAULT NULL,
  _search  text    DEFAULT NULL,
  _limit   integer DEFAULT 50,
  _offset  integer DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  city                  text,
  state                 text,
  inep_code             text,
  network               text,
  is_active             boolean,
  logo_url              text,
  address               text,
  created_at            timestamptz,
  subscription_status   text,
  subscription_end_date date,
  grace_period_days     integer,
  total_count           bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: requer privilégios de administrador.';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.name,
      s.city,
      s.state,
      s.inep_code,
      s.network,
      s.is_active,
      s.logo_url,
      s.address,
      s.created_at,
      s.subscription_status,
      s.subscription_end_date,
      s.grace_period_days
    FROM public.schools s
    WHERE (_state   IS NULL OR s.state   = _state)
      AND (_city    IS NULL OR s.city    = _city)
      AND (_network IS NULL OR s.network = _network)
      AND (
        _search IS NULL
        OR s.name      ILIKE '%' || _search || '%'
        OR s.city      ILIKE '%' || _search || '%'
        OR s.inep_code ILIKE '%' || _search || '%'
      )
  ),
  total AS (SELECT COUNT(*)::bigint AS c FROM filtered)
  SELECT f.*, t.c
  FROM filtered f, total t
  ORDER BY f.name ASC
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_schools_admin_paginated(text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_schools_admin_paginated(text, text, text, text, integer, integer) TO authenticated;