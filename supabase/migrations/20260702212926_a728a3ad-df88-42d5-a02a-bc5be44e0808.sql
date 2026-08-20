CREATE OR REPLACE FUNCTION public.enforce_trial_phase_on_profile_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- O cadastro do usuário não deve ser impedido pela fase financeira da escola.
  -- Bloqueios/restrições de uso continuam em funções específicas, como agendamentos.
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_trial_phase_on_profile_insert() IS
  'Permite criar perfis de novos usuários mesmo quando a escola está em carência/bloqueio; restrições financeiras são aplicadas no uso do sistema, não no cadastro.';