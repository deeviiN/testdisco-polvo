-- Drop existing function if it exists to ensure a clean state
DROP FUNCTION IF EXISTS public.list_schools_admin_paginated(text, text, text, text, integer, integer);

-- Re-create the function with standardized parameter names and defaults
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
    created_at TIMESTAMPTZ,
    subscription_status TEXT,
    subscription_end_date TIMESTAMPTZ,
    grace_period_days INTEGER,
    total_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_schools AS (
        SELECT 
            s.id,
            s.name,
            s.city,
            s.state,
            s.inep_code,
            s.network,
            s.is_active,
            s.logo_url,
            s.address,
            s.created_at,
            s.subscription_status,
            s.subscription_end_date,
            s.grace_period_days
        FROM 
            public.schools s
        WHERE 
            (_state IS NULL OR s.state = _state)
            AND (_city IS NULL OR s.city = _city)
            AND (_network IS NULL OR s.network = _network)
            AND (
                _search IS NULL 
                OR s.name ILIKE '%' || _search || '%'
                OR s.city ILIKE '%' || _search || '%'
                OR s.inep_code ILIKE '%' || _search || '%'
            )
    ),
    total_count_cte AS (
        SELECT COUNT(*) as full_count FROM filtered_schools
    )
    SELECT 
        fs.*,
        tc.full_count
    FROM 
        filtered_schools fs,
        total_count_cte tc
    ORDER BY 
        fs.name ASC
    LIMIT _limit
    OFFSET _offset;
END;
$$;

-- Grant access to authenticated users (admins)
GRANT EXECUTE ON FUNCTION public.list_schools_admin_paginated(text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_schools_admin_paginated(text, text, text, text, integer, integer) TO service_role;
