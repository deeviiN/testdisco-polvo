-- Atualizar a função get_my_trial_status para refletir o status da escola de forma global
-- independente se o usuário é gestor ou não, embora a lógica interna já fizesse o JOIN com schools.
-- A mudança principal é no frontend (ApprovedRouteGuard) para aplicar o bloqueio a todos.

CREATE OR REPLACE FUNCTION public.get_my_trial_status()
 RETURNS TABLE(is_approved boolean, approved_until timestamp with time zone, trial_expired boolean, school_subscription_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.is_approved,
    p.approved_until,
    (p.approved_until IS NOT NULL AND p.approved_until < now()) AS trial_expired,
    COALESCE(s.subscription_status, 'inactive')
  FROM public.profiles p
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$function$;
