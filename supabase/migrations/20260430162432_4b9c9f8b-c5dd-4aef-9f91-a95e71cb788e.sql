DROP FUNCTION IF EXISTS public.get_my_trial_status();

CREATE OR REPLACE FUNCTION public.get_my_trial_status()
RETURNS TABLE (
    is_approved boolean,
    approved_until timestamp with time zone,
    trial_expired boolean,
    school_subscription_status text,
    school_subscription_end_date date
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.is_approved,
        p.approved_until,
        (p.approved_until IS NOT NULL AND p.approved_until < now()) AS trial_expired,
        COALESCE(s.subscription_status, 'inactive') AS school_subscription_status,
        s.subscription_end_date AS school_subscription_end_date
    FROM public.profiles p
    LEFT JOIN public.schools s ON s.id = p.school_id
    WHERE p.user_id = auth.uid()
    LIMIT 1;
END;
$$;