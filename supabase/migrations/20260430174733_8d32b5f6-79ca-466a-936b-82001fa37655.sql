CREATE OR REPLACE FUNCTION public.get_my_trial_status()
 RETURNS TABLE(is_approved boolean, approved_until timestamp with time zone, trial_expired boolean, school_subscription_status text, school_subscription_end_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        p.is_approved,
        p.approved_until,
        (p.approved_until IS NOT NULL AND p.approved_until < now()) AS trial_expired,
        -- Prioritize 'active' status from assinaturas or schools
        CASE 
            WHEN a.status = 'ativo' THEN 'active'
            ELSE COALESCE(s.subscription_status, 'inactive')
        END AS school_subscription_status,
        -- Prioritize validity date from assinaturas or schools
        CASE 
            WHEN a.validade IS NOT NULL THEN a.validade::date
            ELSE s.subscription_end_date
        END AS school_subscription_end_date
    FROM public.profiles p
    LEFT JOIN public.schools s ON s.id = p.school_id
    LEFT JOIN public.assinaturas a ON a.user_id = p.user_id AND a.status = 'ativo'
    WHERE p.user_id = auth.uid()
    LIMIT 1;
END;
$function$;