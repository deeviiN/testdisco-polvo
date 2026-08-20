-- Função para listar escolas prospecto (sem plano ativo)
CREATE OR REPLACE FUNCTION public.list_prospect_schools_admin(_limit INTEGER, _offset INTEGER)
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
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.subscription_status, s.created_at
    FROM schools s
    WHERE s.subscription_status IS NULL 
       OR s.subscription_status = 'inactive'
       OR s.subscription_status = 'trial'
    ORDER BY s.created_at DESC
    LIMIT _limit OFFSET _offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para listar escolas com expiração próxima
CREATE OR REPLACE FUNCTION public.list_expiring_schools_admin(_limit INTEGER, _offset INTEGER)
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
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.subscription_status, s.subscription_end_date,
        public.get_school_subscription_countdown(s.id) as days_left
    FROM schools s
    WHERE s.subscription_status IN ('active', 'paid', 'trialing', 'grace_period')
      AND s.subscription_end_date IS NOT NULL
      AND s.subscription_end_date > now()
      AND s.subscription_end_date <= (now() + interval '14 days')
    ORDER BY s.subscription_end_date ASC
    LIMIT _limit OFFSET _offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
