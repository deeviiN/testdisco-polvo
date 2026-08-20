
-- =====================================================
-- INBOX REQUESTS - sistema unificado de notificações
-- =====================================================

CREATE TABLE IF NOT EXISTS public.inbox_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('admin','gestor','user')),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved','rejected','info')),
  school_id uuid,
  requester_user_id uuid,
  target_user_id uuid,
  title text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_audience_school ON public.inbox_requests (audience, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_target_user ON public.inbox_requests (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_unread ON public.inbox_requests (audience, school_id, is_read) WHERE is_read = false;

ALTER TABLE public.inbox_requests ENABLE ROW LEVEL SECURITY;

-- ADMIN
CREATE POLICY "Admin reads admin inbox" ON public.inbox_requests
  FOR SELECT TO authenticated
  USING (audience = 'admin' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin updates admin inbox" ON public.inbox_requests
  FOR UPDATE TO authenticated
  USING (audience = 'admin' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (audience = 'admin' AND has_role(auth.uid(), 'admin'::app_role));

-- GESTOR
CREATE POLICY "Gestor reads school inbox" ON public.inbox_requests
  FOR SELECT TO authenticated
  USING (
    audience = 'gestor'
    AND school_id = get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  );

CREATE POLICY "Gestor updates school inbox" ON public.inbox_requests
  FOR UPDATE TO authenticated
  USING (
    audience = 'gestor'
    AND school_id = get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  )
  WITH CHECK (
    audience = 'gestor'
    AND school_id = get_user_school_id(auth.uid())
  );

-- USER (próprio ou broadcast da escola)
CREATE POLICY "User reads own inbox" ON public.inbox_requests
  FOR SELECT TO authenticated
  USING (
    audience = 'user'
    AND (
      target_user_id = auth.uid()
      OR (target_user_id IS NULL AND school_id = get_user_school_id(auth.uid()) AND is_user_approved(auth.uid()))
    )
  );

CREATE POLICY "User updates own inbox" ON public.inbox_requests
  FOR UPDATE TO authenticated
  USING (
    audience = 'user'
    AND (
      target_user_id = auth.uid()
      OR (target_user_id IS NULL AND school_id = get_user_school_id(auth.uid()))
    )
  )
  WITH CHECK (
    audience = 'user'
    AND (
      target_user_id = auth.uid()
      OR (target_user_id IS NULL AND school_id = get_user_school_id(auth.uid()))
    )
  );

-- Bloquear inserts/deletes do cliente (tudo via triggers)
CREATE POLICY "Block client insert inbox" ON public.inbox_requests
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "Block client delete inbox" ON public.inbox_requests
  FOR DELETE TO authenticated USING (false);

-- Realtime
ALTER TABLE public.inbox_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_requests;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_inbox_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_inbox_updated_at
BEFORE UPDATE ON public.inbox_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_inbox_updated_at();

-- =====================================================
-- TRIGGERS DE EVENTOS
-- =====================================================

-- Novo cadastro pendente -> caixa do gestor
CREATE OR REPLACE FUNCTION public.inbox_on_profile_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NOT NULL AND NEW.is_approved = false THEN
    INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
    VALUES (
      'gestor', 'cadastro_pendente', 'pending',
      NEW.school_id, NEW.user_id, NULL,
      'Novo cadastro aguardando aprovação',
      coalesce(NEW.full_name,'Usuário') || ' solicitou acesso como ' || coalesce(NEW.intended_role, NEW.role),
      jsonb_build_object('profile_id', NEW.id, 'role', coalesce(NEW.intended_role, NEW.role))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_profile_pending ON public.profiles;
CREATE TRIGGER trg_inbox_profile_pending
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.inbox_on_profile_pending();

-- Cadastro aprovado -> broadcast para a escola (audience=user)
CREATE OR REPLACE FUNCTION public.inbox_on_profile_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_approved = true AND coalesce(OLD.is_approved, false) = false AND NEW.school_id IS NOT NULL THEN
    -- broadcast para a escola
    INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
    VALUES (
      'user', 'novo_colega', 'info',
      NEW.school_id, NEW.user_id, NULL,
      'Novo colega na escola',
      coalesce(NEW.full_name,'Um novo usuário') || ' foi aprovado(a) como ' || coalesce(NEW.role,'membro'),
      jsonb_build_object('profile_id', NEW.id, 'role', NEW.role)
    );
    -- notificação direta para o próprio usuário
    INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
    VALUES (
      'user', 'cadastro_aprovado', 'info',
      NEW.school_id, NEW.user_id, NEW.user_id,
      'Seu cadastro foi aprovado',
      'Bem-vindo(a)! Seu acesso à escola foi liberado.',
      jsonb_build_object('profile_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_profile_approved ON public.profiles;
CREATE TRIGGER trg_inbox_profile_approved
AFTER UPDATE OF is_approved ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.inbox_on_profile_approved();

-- Bookings: criação que precisa aprovação do gestor -> caixa do gestor
CREATE OR REPLACE FUNCTION public.inbox_on_booking_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requester_name text;
BEGIN
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;

  IF NEW.event_type = 'evento_externo' AND coalesce(NEW.gestor_status,'pending') = 'pending' THEN
    INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
    VALUES (
      'gestor', 'agendamento_pendente', 'pending',
      NEW.school_id, NEW.user_id, NULL,
      'Agendamento aguardando aprovação',
      coalesce(v_requester_name,'Usuário') || ' solicitou ' || coalesce(NEW.topic, NEW.event_type) || ' em ' || to_char(NEW.booking_date,'DD/MM'),
      jsonb_build_object('booking_id', NEW.id, 'sector', NEW.sector, 'date', NEW.booking_date)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_booking_insert ON public.bookings;
CREATE TRIGGER trg_inbox_booking_insert
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.inbox_on_booking_insert();

-- Bookings: gestor respondeu -> notifica o dono; se confirmado, broadcast escola
CREATE OR REPLACE FUNCTION public.inbox_on_booking_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_name text;
BEGIN
  IF NEW.gestor_status IS DISTINCT FROM OLD.gestor_status
     AND NEW.gestor_status IN ('approved','rejected') THEN
    -- direto para o dono
    INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
    VALUES (
      'user',
      CASE WHEN NEW.gestor_status = 'approved' THEN 'meu_agendamento_aprovado' ELSE 'meu_agendamento_recusado' END,
      'info', NEW.school_id, NEW.gestor_responded_by, NEW.user_id,
      CASE WHEN NEW.gestor_status = 'approved'
           THEN 'Seu agendamento foi aprovado'
           ELSE 'Seu agendamento foi recusado' END,
      coalesce(NEW.topic,'Agendamento') || ' • ' || to_char(NEW.booking_date,'DD/MM') ||
        coalesce(' • ' || NEW.gestor_response, ''),
      jsonb_build_object('booking_id', NEW.id, 'sector', NEW.sector)
    );

    IF NEW.gestor_status = 'approved' THEN
      SELECT full_name INTO v_owner_name FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
      INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
      VALUES (
        'user', 'agendamento_escola', 'info',
        NEW.school_id, NEW.user_id, NULL,
        'Novo agendamento aprovado na escola',
        coalesce(NEW.topic,'Agendamento') || ' • ' || to_char(NEW.booking_date,'DD/MM') ||
          ' • por ' || coalesce(v_owner_name,'colega'),
        jsonb_build_object('booking_id', NEW.id, 'sector', NEW.sector)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_booking_decision ON public.bookings;
CREATE TRIGGER trg_inbox_booking_decision
AFTER UPDATE OF gestor_status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.inbox_on_booking_decision();

-- Transferência de escola
CREATE OR REPLACE FUNCTION public.inbox_on_transfer_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
  VALUES (
    'gestor', 'transferencia_escola', 'pending',
    NEW.to_school_id, NEW.user_id, NULL,
    'Pedido de transferência para sua escola',
    coalesce(v_name,'Usuário') || ' deseja transferir-se como ' || NEW.requested_role,
    jsonb_build_object('transfer_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_transfer_insert ON public.school_transfer_requests;
CREATE TRIGGER trg_inbox_transfer_insert
AFTER INSERT ON public.school_transfer_requests
FOR EACH ROW EXECUTE FUNCTION public.inbox_on_transfer_insert();

CREATE OR REPLACE FUNCTION public.inbox_on_transfer_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
    VALUES (
      'user',
      CASE WHEN NEW.status='approved' THEN 'transferencia_aprovada' ELSE 'transferencia_recusada' END,
      'info', NEW.to_school_id, NEW.reviewed_by, NEW.user_id,
      CASE WHEN NEW.status='approved' THEN 'Sua transferência foi aprovada' ELSE 'Sua transferência foi recusada' END,
      coalesce(NEW.review_note, 'Pedido de transferência atualizado.'),
      jsonb_build_object('transfer_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_transfer_decision ON public.school_transfer_requests;
CREATE TRIGGER trg_inbox_transfer_decision
AFTER UPDATE OF status ON public.school_transfer_requests
FOR EACH ROW EXECUTE FUNCTION public.inbox_on_transfer_decision();

-- Contratos assinados -> caixa do admin
CREATE OR REPLACE FUNCTION public.inbox_on_signed_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school text;
BEGIN
  SELECT name INTO v_school FROM public.schools WHERE id = NEW.school_id LIMIT 1;
  INSERT INTO public.inbox_requests (audience, type, status, school_id, requester_user_id, target_user_id, title, description, payload)
  VALUES (
    'admin', 'contrato_assinado', 'pending',
    NEW.school_id, NEW.uploaded_by, NULL,
    'Contrato assinado pelo gestor',
    'Escola ' || coalesce(v_school,'(sem nome)') || ' enviou contrato assinado.',
    jsonb_build_object('contract_id', NEW.id, 'file_name', NEW.file_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_signed_contract ON public.signed_contracts;
CREATE TRIGGER trg_inbox_signed_contract
AFTER INSERT ON public.signed_contracts
FOR EACH ROW EXECUTE FUNCTION public.inbox_on_signed_contract();
