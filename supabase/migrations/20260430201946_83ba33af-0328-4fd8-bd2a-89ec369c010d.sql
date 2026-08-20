CREATE OR REPLACE FUNCTION public.list_schools_simple_filtered(
  _state   text DEFAULT NULL,
  _city    text DEFAULT NULL,
  _network text DEFAULT NULL,
  _search  text DEFAULT NULL,
  _limit   int  DEFAULT 50,
  _offset  int  DEFAULT 0
)
RETURNS TABLE (
  id          uuid,
  nome        text,
  cidade      text,
  total_count bigint
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
    SELECT s.id, s.name AS nome, s.city AS cidade
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
  SELECT f.id, f.nome, f.cidade, t.c
  FROM filtered f, total t
  ORDER BY f.nome ASC
  LIMIT _limit OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_schools_simple_filtered(text, text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_schools_simple_filtered(text, text, text, text, int, int) TO authenticated;