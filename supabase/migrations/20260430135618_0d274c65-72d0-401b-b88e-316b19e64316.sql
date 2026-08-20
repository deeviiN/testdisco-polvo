-- Dropar funções que precisam mudar o tipo de retorno antes de recriar
DROP FUNCTION IF EXISTS public.list_schools_admin_paginated(text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.list_prospect_schools_admin(integer,integer);
DROP FUNCTION IF EXISTS public.list_expiring_schools_admin(integer,integer);
DROP FUNCTION IF EXISTS public.list_subscribed_schools_admin(integer,integer);

-- Recriar list_schools_admin_paginated
CREATE OR REPLACE FUNCTION public.list_schools_admin_paginated(
  _state TEXT DEFAULT NULL,
  _city TEXT DEFAULT NULL,
  _network TEXT DEFAULT NULL,
  _search TEXT DEFAULT NULL,
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
  logo_url TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  subscription_status TEXT,
  subscription_end_date TIMESTAMP WITH TIME ZONE,
  grace_period_days INTEGER,
  total_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id, s.name, s.city, s.state, s.inep_code, s.network,
    s.is_active, s.logo_url, s.address, s.created_at,
    s.subscription_status, s.subscription_end_date, s.grace_period_days,
    COUNT(*) OVER() as total_count
  FROM public.schools s
  WHERE (_state IS NULL OR s.state = _state)
    AND (_city IS NULL OR s.city = _city)
    AND (_network IS NULL OR s.network = _network)
    AND (
      _search IS NULL OR _search = ''
      OR s.name ILIKE '%' || _search || '%'
      OR s.city ILIKE '%' || _search || '%'
      OR COALESCE(s.inep_code, '') ILIKE '%' || _search || '%'
    )
  ORDER BY s.name ASC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

-- Recriar list_prospect_schools_admin
CREATE OR REPLACE FUNCTION public.list_prospect_schools_admin(
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
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.subscription_status, s.created_at
    FROM schools s
    WHERE s.subscription_status IS NULL 
       OR s.subscription_status IN ('inactive', 'trial')
       OR (s.subscription_status = 'active' AND s.subscription_end_date IS NULL)
    ORDER BY s.created_at DESC
    LIMIT _limit OFFSET _offset;
END;
$$;

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
    RETURN QUERY
    SELECT 
        s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.subscription_status, s.subscription_end_date,
        get_school_subscription_countdown(s.id) as days_left
    FROM schools s
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
  RETURN QUERY
  SELECT 
    s.id, s.name, s.city, s.state, s.inep_code, s.network,
    s.is_active, s.subscription_status, s.subscription_end_date, s.grace_period_days
  FROM public.schools s
  WHERE s.subscription_status IN ('active', 'grace_period', 'paid')
  ORDER BY s.name ASC
  LIMIT _limit
  OFFSET _offset;
END;
$$;
