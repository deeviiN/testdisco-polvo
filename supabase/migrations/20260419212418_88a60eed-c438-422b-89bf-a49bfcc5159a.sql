-- Public RPCs to list states and cities by network for the "Status de Outra Escola" public flow
CREATE OR REPLACE FUNCTION public.list_school_states_public(_network text DEFAULT NULL)
RETURNS TABLE(state text, school_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.state, COUNT(*)::bigint
  FROM public.schools s
  WHERE s.is_active = true
    AND (_network IS NULL OR s.network = _network)
  GROUP BY s.state
  ORDER BY s.state;
$$;

CREATE OR REPLACE FUNCTION public.list_school_cities_public(_state text, _network text DEFAULT NULL)
RETURNS TABLE(city text, school_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.city, COUNT(*)::bigint
  FROM public.schools s
  WHERE s.is_active = true
    AND s.state = _state
    AND (_network IS NULL OR s.network = _network)
  GROUP BY s.city
  ORDER BY s.city;
$$;

GRANT EXECUTE ON FUNCTION public.list_school_states_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_school_cities_public(text, text) TO anon, authenticated;