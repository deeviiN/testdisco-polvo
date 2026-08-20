-- Drop existing function to change return type
DROP FUNCTION IF EXISTS public.get_my_trial_status();

-- Recreate with source column and logging
CREATE OR REPLACE FUNCTION public.get_my_trial_status()
 RETURNS TABLE(
    is_approved boolean, 
    approved_until timestamp with time zone, 
    trial_expired boolean, 
    school_subscription_status text, 
    school_subscription_end_date date,
    subscription_source text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    _user_id UUID := auth.uid();
    _is_approved boolean;
    _approved_until timestamp with time zone;
    _trial_expired boolean;
    _status text;
    _end_date date;
    _source text;
BEGIN
    -- Get data and determine source
    SELECT
        p.is_approved,
        p.approved_until,
        (p.approved_until IS NOT NULL AND p.approved_until < now()),
        CASE 
            WHEN a.status = 'ativo' THEN 'active'
            ELSE COALESCE(s.subscription_status, 'inactive')
        END,
        CASE 
            WHEN a.validade IS NOT NULL THEN a.validade::date
            ELSE s.subscription_end_date
        END,
        CASE 
            WHEN a.status = 'ativo' THEN 'assinatura_individual'
            WHEN s.subscription_status IS NOT NULL THEN 'assinatura_escola'
            ELSE 'sem_assinatura'
        END
    INTO 
        _is_approved, _approved_until, _trial_expired, _status, _end_date, _source
    FROM public.profiles p
    LEFT JOIN public.schools s ON s.id = p.school_id
    LEFT JOIN public.assinaturas a ON a.user_id = p.user_id AND a.status = 'ativo'
    WHERE p.user_id = _user_id
    LIMIT 1;

    -- Log the check in audit_logs
    INSERT INTO public.audit_logs (
        performed_by,
        action,
        table_name,
        payload
    ) VALUES (
        _user_id,
        'subscription_check',
        'assinaturas',
        jsonb_build_object(
            'status', _status,
            'end_date', _end_date,
            'source', _source,
            'is_approved', _is_approved,
            'server_timestamp', now()
        )
    );

    RETURN QUERY SELECT _is_approved, _approved_until, _trial_expired, _status, _end_date, _source;
END;
$function$;