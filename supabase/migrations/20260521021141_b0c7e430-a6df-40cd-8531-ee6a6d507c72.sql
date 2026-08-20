DROP FUNCTION IF EXISTS public.list_school_states_admin();

CREATE OR REPLACE FUNCTION public.list_school_states_admin()
RETURNS TABLE (state text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT state
  FROM public.schools
  WHERE state IS NOT NULL
  ORDER BY state;
$$;

GRANT EXECUTE ON FUNCTION public.list_school_states_admin() TO authenticated;