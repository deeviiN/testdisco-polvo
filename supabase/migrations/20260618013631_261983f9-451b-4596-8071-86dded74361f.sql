
-- 1) Mudar fases: trial < 10d, restricted 10-15d, blocked >= 15d
CREATE OR REPLACE FUNCTION public.get_school_trial_phase(_school_id uuid)
 RETURNS TABLE(phase text, days_since_approval integer, trial_start timestamptz, subscription_active boolean, allowed_sector text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_trial_start timestamptz;
  v_sub_status text;
  v_sub_end date;
  v_days int;
  v_active boolean;
  v_phase text;
BEGIN
  IF _school_id IS NULL THEN RETURN; END IF;

  SELECT s.subscription_status, s.subscription_end_date
    INTO v_sub_status, v_sub_end
    FROM public.schools s WHERE s.id = _school_id;

  v_active := (v_sub_status = 'active' AND (v_sub_end IS NULL OR v_sub_end >= current_date));

  SELECT min(coalesce(p.approved_until - interval '10 days', p.created_at))
    INTO v_trial_start
    FROM public.profiles p
   WHERE p.school_id = _school_id
     AND p.role IN ('gestor_pedagogico','chef_projeto_vida');

  IF v_active THEN
    v_phase := 'active'; v_days := 0;
  ELSIF v_trial_start IS NULL THEN
    v_phase := 'trial'; v_days := 0;
  ELSE
    v_days := GREATEST(0, floor(extract(epoch FROM (now() - v_trial_start)) / 86400)::int);
    IF v_days < 10 THEN v_phase := 'trial';
    ELSIF v_days < 15 THEN v_phase := 'restricted';
    ELSE v_phase := 'blocked';
    END IF;
  END IF;

  RETURN QUERY SELECT v_phase, coalesce(v_days,0), v_trial_start, v_active, 'informatica'::text;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_school_trial_phase(uuid) TO anon, authenticated;

-- 2) Mensagem do trigger de booking refletindo 15 dias
CREATE OR REPLACE FUNCTION public.enforce_trial_phase_on_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_phase text; v_allowed text; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL AND public.has_role(v_uid, 'admin'::app_role) THEN RETURN NEW; END IF;
  SELECT phase, allowed_sector INTO v_phase, v_allowed
    FROM public.get_school_trial_phase(NEW.school_id);
  IF v_phase = 'blocked' THEN
    RAISE EXCEPTION 'trial_phase_blocked'
      USING HINT = 'Assinatura vencida há mais de 15 dias. Regularize em /subscription.';
  END IF;
  IF v_phase = 'restricted' AND NEW.sector IS DISTINCT FROM v_allowed THEN
    RAISE EXCEPTION 'trial_phase_restricted_sector'
      USING HINT = 'Período de carência: apenas o setor "' || v_allowed || '" pode ser agendado.';
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Trigger: bloquear novos cadastros (profiles) quando escola está em restricted/blocked
CREATE OR REPLACE FUNCTION public.enforce_trial_phase_on_profile_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_phase text;
BEGIN
  IF NEW.school_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.role = 'admin' THEN RETURN NEW; END IF;

  SELECT phase INTO v_phase FROM public.get_school_trial_phase(NEW.school_id);

  IF v_phase IN ('restricted','blocked') THEN
    RAISE EXCEPTION 'school_registrations_blocked'
      USING HINT = 'Esta escola está com assinatura pendente. Novos cadastros estão bloqueados até a regularização.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_trial_phase_on_profile_insert ON public.profiles;
CREATE TRIGGER enforce_trial_phase_on_profile_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trial_phase_on_profile_insert();

-- 4) verify_contract: expira em 5 anos
CREATE OR REPLACE FUNCTION public.verify_contract(_token uuid)
 RETURNS TABLE(school_name text, school_inep text, signer_name text, signer_cpf_masked text, accepted_at timestamptz, accepted_ip text, contract_version text, document_hash text, status text, is_reacceptance boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.name,
    s.inep_code,
    sc.accepted_full_name,
    CASE WHEN sc.gestor_cpf IS NOT NULL AND length(sc.gestor_cpf) >= 11
         THEN '***.***.' || substring(regexp_replace(sc.gestor_cpf,'\D','','g'),7,3) || '-**'
         ELSE NULL END,
    sc.accepted_at,
    host(sc.accepted_ip),
    sc.contract_version,
    sc.document_hash,
    CASE
      WHEN sc.status = 'revoked' THEN 'revoked'
      WHEN sc.accepted_at IS NOT NULL AND sc.accepted_at < (now() - interval '5 years') THEN 'expired'
      ELSE sc.status
    END,
    sc.reacceptance
  FROM public.signed_contracts sc
  JOIN public.schools s ON s.id = sc.school_id
  WHERE sc.verification_token = _token
  LIMIT 1;
END;
$function$;
