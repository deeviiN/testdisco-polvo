CREATE OR REPLACE FUNCTION public.list_schools_simple(_search text DEFAULT NULL, _limit int DEFAULT 100, _offset int DEFAULT 0)
RETURNS TABLE (
  id uuid,
  nome text,
  cidade text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name AS nome, s.city AS cidade
  FROM public.schools s
  WHERE has_role(auth.uid(), 'admin')
    AND (
      _search IS NULL
      OR s.name ILIKE '%' || _search || '%'
      OR s.city ILIKE '%' || _search || '%'
      OR s.inep_code ILIKE '%' || _search || '%'
    )
  ORDER BY s.name ASC
  LIMIT _limit OFFSET _offset;
$$;

REVOKE ALL ON FUNCTION public.list_schools_simple(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_schools_simple(text, int, int) TO authenticated;