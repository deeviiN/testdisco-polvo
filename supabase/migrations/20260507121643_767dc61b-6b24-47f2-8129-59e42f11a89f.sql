CREATE OR REPLACE FUNCTION public.list_subscribed_schools_admin(_limit integer DEFAULT 1000, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, subscription_status text, subscription_end_date timestamp with time zone, grace_period_days integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Acesso negado: Requer privilégios de administrador.';
    END IF;

    RETURN QUERY
    SELECT 
      s.id, 
      s.name::TEXT, 
      s.city::TEXT, 
      s.state::TEXT, 
      s.inep_code::TEXT, 
      s.network::TEXT,
      s.is_active,
      CASE
        WHEN a.status = 'ativo' AND a.validade >= now() THEN 'active'
        WHEN a.status = 'ativo' AND a.validade < now() AND a.validade + (COALESCE(s.grace_period_days, 15) || ' days')::interval >= now() THEN 'grace_period'
        WHEN s.subscription_status IN ('grace_period','paid','trialing') THEN s.subscription_status::TEXT
        ELSE 'inactive'
      END AS subscription_status,
      COALESCE(a.validade, s.subscription_end_date::timestamptz) AS subscription_end_date,
      COALESCE(s.grace_period_days, 15)::INTEGER
    FROM public.schools s
    INNER JOIN LATERAL (
      SELECT a2.status, a2.validade
      FROM public.assinaturas a2
      WHERE a2.school_id = s.id
      ORDER BY a2.validade DESC NULLS LAST
      LIMIT 1
    ) a ON TRUE
    ORDER BY s.name ASC
    LIMIT _limit
    OFFSET _offset;
END;
$function$;