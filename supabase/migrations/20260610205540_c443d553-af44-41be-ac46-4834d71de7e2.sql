
-- ============================================================================
-- Sistema de fases trial: 0-10d livre, 10-20d só 'informatica', 20+ bloqueado
-- ============================================================================

-- 1) Trial agora é de 10 dias (era 7)
CREATE OR REPLACE FUNCTION private_api.admin_approve_gestor_trial(_profile_id uuid)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;

  UPDATE public.profiles
     SET is_approved = true,
         approved_until = now() + interval '10 days',
         updated_at = now()
   WHERE id = _profile_id
     AND role IN ('gestor_pedagogico','chef_projeto_vida')
   RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found_or_not_gestor';
  END IF;

  RETURN v_profile;
END;
$$;

-- 2) RPC que retorna a fase de trial da escola
CREATE OR REPLACE FUNCTION public.get_school_trial_phase(_school_id uuid)
RETURNS TABLE(
  phase text,                  -- 'active' | 'trial' | 'restricted' | 'blocked'
  days_since_approval int,
  trial_start timestamptz,
  subscription_active boolean,
  allowed_sector text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trial_start timestamptz;
  v_sub_status text;
  v_sub_end date;
  v_days int;
  v_active boolean;
  v_phase text;
BEGIN
  IF _school_id IS NULL THEN
    RETURN;
  END IF;

  SELECT s.subscription_status, s.subscription_end_date
    INTO v_sub_status, v_sub_end
    FROM public.schools s
   WHERE s.id = _school_id;

  v_active := (v_sub_status = 'active' AND (v_sub_end IS NULL OR v_sub_end >= current_date));

  -- approved_until foi setado como now()+10d -> trial_start = approved_until - 10d
  SELECT min(coalesce(p.approved_until - interval '10 days', p.created_at))
    INTO v_trial_start
    FROM public.profiles p
   WHERE p.school_id = _school_id
     AND p.role IN ('gestor_pedagogico','chef_projeto_vida');

  IF v_active THEN
    v_phase := 'active';
    v_days := 0;
  ELSIF v_trial_start IS NULL THEN
    v_phase := 'trial';
    v_days := 0;
  ELSE
    v_days := GREATEST(0, floor(extract(epoch FROM (now() - v_trial_start)) / 86400)::int);
    IF v_days < 10 THEN v_phase := 'trial';
    ELSIF v_days < 20 THEN v_phase := 'restricted';
    ELSE v_phase := 'blocked';
    END IF;
  END IF;

  RETURN QUERY SELECT v_phase, coalesce(v_days,0), v_trial_start, v_active, 'informatica'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_trial_phase(uuid) TO authenticated;

-- 3) RPC do próprio usuário
CREATE OR REPLACE FUNCTION public.get_my_school_trial_phase()
RETURNS TABLE(
  phase text,
  days_since_approval int,
  trial_start timestamptz,
  subscription_active boolean,
  allowed_sector text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.get_school_trial_phase(
    (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_school_trial_phase() TO authenticated;

-- 4) Trigger que bloqueia bookings conforme a fase (admins isentos)
CREATE OR REPLACE FUNCTION public.enforce_trial_phase_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phase text;
  v_allowed text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL AND public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT phase, allowed_sector
    INTO v_phase, v_allowed
    FROM public.get_school_trial_phase(NEW.school_id);

  IF v_phase = 'blocked' THEN
    RAISE EXCEPTION 'trial_phase_blocked'
      USING HINT = 'Assinatura vencida há mais de 20 dias. Regularize em /subscription.';
  END IF;

  IF v_phase = 'restricted' AND NEW.sector IS DISTINCT FROM v_allowed THEN
    RAISE EXCEPTION 'trial_phase_restricted_sector'
      USING HINT = 'Período de carência: apenas o setor "' || v_allowed || '" pode ser agendado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_trial_phase ON public.bookings;
CREATE TRIGGER trg_enforce_trial_phase
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trial_phase_on_booking();
