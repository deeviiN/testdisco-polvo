CREATE OR REPLACE FUNCTION public.search_schools_public(search_query text)
 RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, logo_url text, address text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.logo_url, s.address
  FROM public.schools s
  WHERE s.is_active = true
  AND (
    coalesce(search_query,'') = ''
    OR s.name ILIKE '%' || search_query || '%'
    OR s.city ILIKE '%' || search_query || '%'
    OR s.state ILIKE '%' || search_query || '%'
    OR coalesce(s.inep_code,'') ILIKE '%' || search_query || '%'
  )
  ORDER BY s.name
  LIMIT 30;
$function$;