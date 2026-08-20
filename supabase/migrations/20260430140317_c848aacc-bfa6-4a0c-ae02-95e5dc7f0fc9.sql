-- Forçar recriação com tipos de dados mais flexíveis para evitar erro 400
DROP FUNCTION IF EXISTS public.list_expiring_schools_admin(integer,integer);
DROP FUNCTION IF EXISTS public.list_subscribed_schools_admin(integer,integer);

-- Recriar list_expiring_schools_admin
CREATE OR REPLACE FUNCTION public.list_expiring_schools_admin(
  _limit INTEGER DEFAULT 50,
  _offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  state TEXT,
  inep_code TEXT,
  network TEXT,
  is_active BOOLEAN,
  subscription_status TEXT,
  subscription_end_date TIMESTAMP WITH TIME ZONE,
  days_left INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        s.subscription_status::TEXT, 
        s.subscription_end_date,
        COALESCE(get_school_subscription_countdown(s.id), 0)::INTEGER as days_left
    FROM public.schools s
    WHERE s.subscription_status IN ('active', 'paid', 'trialing', 'grace_period')
      AND s.subscription_end_date IS NOT NULL
      AND s.subscription_end_date > now()
      AND s.subscription_end_date <= (now() + interval '14 days')
    ORDER BY s.subscription_end_date ASC
    LIMIT _limit OFFSET _offset;
END;
$$;

-- Recriar list_subscribed_schools_admin
CREATE OR REPLACE FUNCTION public.list_subscribed_schools_admin(
  _limit INTEGER DEFAULT 1000,
  _offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  state TEXT,
  inep_code TEXT,
  network TEXT,
  is_active BOOLEAN,
  subscription_status TEXT,
  subscription_end_date TIMESTAMP WITH TIME ZONE,
  grace_period_days INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      s.subscription_status::TEXT, 
      s.subscription_end_date, 
      COALESCE(s.grace_period_days, 0)::INTEGER
    FROM public.schools s
    WHERE s.subscription_status IN ('active', 'grace_period', 'paid')
    ORDER BY s.name ASC
    LIMIT _limit
    OFFSET _offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_expiring_schools_admin(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_expiring_schools_admin(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer,integer) TO service_role;
