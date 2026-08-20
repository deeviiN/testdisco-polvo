
-- 1) Add discipline columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discipline_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS discipline_total_infractions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discipline_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS discipline_suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS discipline_unblocked_count integer NOT NULL DEFAULT 0;

-- 2) user_infractions table
CREATE TABLE IF NOT EXISTS public.user_infractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('ausencia','sem_checkout')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, booking_id, type)
);

GRANT SELECT ON public.user_infractions TO authenticated;
GRANT ALL ON public.user_infractions TO service_role;

ALTER TABLE public.user_infractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User views own infractions"
  ON public.user_infractions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Gestor/admin view school infractions"
  ON public.user_infractions FOR SELECT TO authenticated
  USING (
    private_api.has_role(auth.uid(), 'admin'::app_role)
    OR (
      school_id = private_api.get_user_school_id(auth.uid())
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid() AND p.is_approved = true
          AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      )
    )
  );

CREATE POLICY "Block client insert infractions"
  ON public.user_infractions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Block client update infractions"
  ON public.user_infractions FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block client delete infractions"
  ON public.user_infractions FOR DELETE TO authenticated USING (false);

-- 3) RPC: register_infraction
CREATE OR REPLACE FUNCTION public.register_infraction(
  _user_id uuid,
  _booking_id uuid,
  _type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_total int;
  v_unblocks int;
  v_status text;
  v_title text;
  v_desc text;
  v_inbox_type text;
  v_inserted boolean := false;
BEGIN
  SELECT school_id INTO v_school FROM bookings WHERE id = _booking_id;
  IF v_school IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  END IF;

  INSERT INTO user_infractions (user_id, school_id, booking_id, type)
  VALUES (_user_id, v_school, _booking_id, _type)
  ON CONFLICT (user_id, booking_id, type) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  UPDATE profiles
    SET discipline_total_infractions = discipline_total_infractions + 1
    WHERE user_id = _user_id
    RETURNING discipline_total_infractions, discipline_unblocked_count INTO v_total, v_unblocks;

  -- Determine consequence
  -- Base counter pre-unblock: 1 -> aviso, 2 -> aviso final, 3 -> bloqueio gestor
  -- After unblock: +1 -> aviso pós-desbloqueio, +2 -> suspensão 15 dias
  IF v_unblocks = 0 THEN
    IF v_total = 1 THEN
      v_status := 'ok';
      v_inbox_type := 'disciplina_aviso_1';
      v_title := 'Advertência 1/3 — falta registrada';
      v_desc := 'Você recebeu sua 1ª advertência (' || CASE _type WHEN 'ausencia' THEN 'ausência total no agendamento' ELSE 'não realizou o check-out' END || '). Na 3ª, seu acesso será bloqueado.';
    ELSIF v_total = 2 THEN
      v_status := 'ok';
      v_inbox_type := 'disciplina_aviso_2';
      v_title := 'Advertência 2/3 — atenção';
      v_desc := 'Esta é sua 2ª advertência. Na próxima, sua conta será BLOQUEADA e só o gestor poderá liberar.';
    ELSIF v_total >= 3 THEN
      v_status := 'blocked_manager';
      v_inbox_type := 'disciplina_bloqueio_gestor';
      v_title := 'Conta bloqueada — 3 advertências';
      v_desc := 'Sua conta foi bloqueada por acumular 3 advertências. Procure o gestor da escola para desbloqueio.';
      UPDATE profiles SET discipline_status = 'blocked_manager', discipline_blocked_at = now()
        WHERE user_id = _user_id;
      -- notify gestor
      INSERT INTO inbox_requests (audience, type, school_id, title, description, payload)
      VALUES ('gestor', 'disciplina_usuario_bloqueado', v_school,
              'Usuário bloqueado por advertências',
              'Um usuário acumulou 3 advertências e precisa do seu desbloqueio.',
              jsonb_build_object('user_id', _user_id, 'total', v_total));
    END IF;
  ELSE
    -- already unblocked at least once
    DECLARE
      v_post int := v_total - 3 - ((v_unblocks - 1) * 2);
    BEGIN
      IF v_post = 1 THEN
        v_status := 'ok';
        v_inbox_type := 'disciplina_aviso_pos_desbloqueio';
        v_title := 'Advertência após desbloqueio';
        v_desc := 'Você recebeu nova advertência após o desbloqueio. Na próxima, será SUSPENSO automaticamente por 15 dias.';
      ELSIF v_post >= 2 THEN
        v_status := 'suspended_auto';
        v_inbox_type := 'disciplina_suspensao_15d';
        v_title := 'Suspensão automática de 15 dias';
        v_desc := 'Sua conta foi suspensa automaticamente por 15 dias. Nem o gestor pode liberar — aguarde o término do prazo.';
        UPDATE profiles
          SET discipline_status = 'suspended_auto',
              discipline_suspended_until = now() + interval '15 days'
          WHERE user_id = _user_id;
        INSERT INTO inbox_requests (audience, type, school_id, title, description, payload)
        VALUES ('gestor', 'disciplina_usuario_suspenso', v_school,
                'Usuário suspenso automaticamente (15 dias)',
                'Suspensão automática aplicada pelo sistema.',
                jsonb_build_object('user_id', _user_id, 'total', v_total));
      END IF;
    END;
  END IF;

  IF v_inbox_type IS NOT NULL THEN
    INSERT INTO inbox_requests (audience, type, school_id, target_user_id, title, description, payload)
    VALUES ('user', v_inbox_type, v_school, _user_id, v_title, v_desc,
            jsonb_build_object('booking_id', _booking_id, 'infraction_type', _type, 'total', v_total));
  END IF;

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'new_status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.register_infraction(uuid, uuid, text) FROM public, anon, authenticated;

-- 4) RPC: manager_unblock_user
CREATE OR REPLACE FUNCTION public.manager_unblock_user(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_target_school uuid;
  v_status text;
BEGIN
  v_school := private_api.get_user_school_id(auth.uid());

  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
  ) THEN
    RAISE EXCEPTION 'not_manager';
  END IF;

  SELECT school_id, discipline_status INTO v_target_school, v_status
    FROM profiles WHERE user_id = _user_id;

  IF v_target_school IS NULL OR v_target_school <> v_school THEN
    RAISE EXCEPTION 'wrong_school';
  END IF;

  IF v_status <> 'blocked_manager' THEN
    RAISE EXCEPTION 'not_blocked_by_manager';
  END IF;

  UPDATE profiles
    SET discipline_status = 'ok',
        discipline_blocked_at = NULL,
        discipline_unblocked_count = discipline_unblocked_count + 1
    WHERE user_id = _user_id;

  INSERT INTO inbox_requests (audience, type, school_id, target_user_id, title, description, payload)
  VALUES ('user', 'disciplina_desbloqueado', v_school, _user_id,
          'Conta desbloqueada pelo gestor',
          'Seu acesso foi restabelecido. Atenção: após 2 novas advertências você será suspenso automaticamente por 15 dias.',
          jsonb_build_object('unblocked_by', auth.uid()));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manager_unblock_user(uuid) TO authenticated;

-- 5) RPC: detect_infractions_daily — varre dia anterior
CREATE OR REPLACE FUNCTION public.detect_infractions_daily()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  -- Ausência total: agendamento de ontem (ou mais antigo, hoje-1) confirmed sem booking_usage iniciado
  FOR r IN
    SELECT b.id, b.user_id
    FROM bookings b
    LEFT JOIN booking_usage u ON u.booking_id = b.id
    WHERE b.status = 'confirmed'
      AND b.booking_date = (current_date - 1)
      AND u.started_at IS NULL
  LOOP
    PERFORM register_infraction(r.user_id, r.id, 'ausencia');
    v_count := v_count + 1;
  END LOOP;

  -- Sem check-out: booking_usage iniciado mas não encerrado, end_time + 6h < now()
  FOR r IN
    SELECT u.booking_id, u.user_id
    FROM booking_usage u
    JOIN bookings b ON b.id = u.booking_id
    WHERE u.started_at IS NOT NULL
      AND u.ended_at IS NULL
      AND (b.booking_date + b.end_time + interval '6 hours') < now()
  LOOP
    PERFORM register_infraction(r.user_id, r.booking_id, 'sem_checkout');
    v_count := v_count + 1;
  END LOOP;

  -- Liberar suspensões expiradas
  UPDATE profiles
    SET discipline_status = 'ok',
        discipline_suspended_until = NULL
    WHERE discipline_status = 'suspended_auto'
      AND discipline_suspended_until IS NOT NULL
      AND discipline_suspended_until < now();

  RETURN jsonb_build_object('ok', true, 'processed', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.detect_infractions_daily() FROM public, anon, authenticated;

-- 6) Block bookings for disciplined users
CREATE OR REPLACE FUNCTION public.discipline_block_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_until timestamptz;
BEGIN
  SELECT discipline_status, discipline_suspended_until
    INTO v_status, v_until
    FROM profiles WHERE user_id = NEW.user_id;

  IF v_status = 'blocked_manager' THEN
    RAISE EXCEPTION 'discipline_blocked_manager';
  END IF;

  IF v_status = 'suspended_auto' AND v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'discipline_suspended_until_%', to_char(v_until, 'DD/MM/YYYY');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_discipline_block_booking ON public.bookings;
CREATE TRIGGER trg_discipline_block_booking
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.discipline_block_booking();
