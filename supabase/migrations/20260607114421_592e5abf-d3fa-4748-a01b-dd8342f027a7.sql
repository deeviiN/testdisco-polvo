CREATE OR REPLACE FUNCTION private_api.list_subscribed_schools_admin(_limit integer DEFAULT 1000, _offset integer DEFAULT 0)
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
  WITH latest AS (
    SELECT DISTINCT ON (a.school_id)
           a.school_id, a.status, a.validade
    FROM public.assinaturas a
    ORDER BY a.school_id, a.validade DESC NULLS LAST
  )
  SELECT
    s.id,
    s.name::text,
    s.city::text,
    s.state::text,
    s.inep_code::text,
    s.network::text,
    s.is_active,
    CASE
      WHEN l.status = 'ativo' AND l.validade >= now() THEN 'active'
      WHEN l.status = 'ativo' AND l.validade < now()
           AND l.validade + (COALESCE(s.grace_period_days, 15) || ' days')::interval >= now()
        THEN 'grace_period'
      WHEN s.subscription_status IN ('grace_period','paid','trialing') THEN s.subscription_status::text
      ELSE 'inactive'
    END AS subscription_status,
    COALESCE(l.validade, s.subscription_end_date::timestamptz) AS subscription_end_date,
    COALESCE(s.grace_period_days, 15)::integer
  FROM latest l
  JOIN public.schools s ON s.id = l.school_id
  ORDER BY s.name ASC
  LIMIT _limit OFFSET _offset;
END;
$function$;