CREATE OR REPLACE FUNCTION public.list_prospect_schools_admin(_limit integer, _offset integer)
 RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, subscription_status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.subscription_status, s.created_at
    FROM schools s
    WHERE s.subscription_status IS NULL 
       OR s.subscription_status = 'inactive'
       OR s.subscription_status = 'trial'
       OR (s.subscription_status = 'active' AND s.subscription_end_date IS NULL)
    ORDER BY s.created_at DESC
    LIMIT _limit OFFSET _offset;
END;
$function$;