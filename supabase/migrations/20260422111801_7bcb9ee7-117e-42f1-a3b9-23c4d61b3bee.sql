-- Tabela de solicitações de transferência de escola
CREATE TABLE public.school_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_school_id uuid NOT NULL,
  to_school_id uuid NOT NULL,
  requested_role text NOT NULL DEFAULT 'teacher',
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_str_to_school ON public.school_transfer_requests(to_school_id, status);
CREATE INDEX idx_str_user ON public.school_transfer_requests(user_id, status);

-- Apenas uma solicitação pendente por usuário
CREATE UNIQUE INDEX uniq_pending_per_user
  ON public.school_transfer_requests(user_id)
  WHERE status = 'pending';

ALTER TABLE public.school_transfer_requests ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE TRIGGER trg_str_updated_at
BEFORE UPDATE ON public.school_transfer_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validar status
CREATE OR REPLACE FUNCTION public.validate_str_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_str_validate_status
BEFORE INSERT OR UPDATE ON public.school_transfer_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_str_status();

-- ==== RLS Policies ====
-- O próprio usuário cria sua solicitação para si mesmo, vinda da escola atual
CREATE POLICY "User creates own transfer request"
ON public.school_transfer_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND from_school_id = public.get_user_school_id(auth.uid())
  AND status = 'pending'
  AND to_school_id <> from_school_id
  AND requested_role IN ('teacher','coord_pedagogico','supervisor','secretario_escolar')
);

-- Usuário vê suas próprias solicitações
CREATE POLICY "User views own transfer requests"
ON public.school_transfer_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Gestores/Chef da escola DESTINO veem solicitações endereçadas a sua escola
CREATE POLICY "Gestor of destination school views requests"
ON public.school_transfer_requests
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = school_transfer_requests.to_school_id
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
);

-- Admin vê tudo
CREATE POLICY "Admin views all transfer requests"
ON public.school_transfer_requests
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Usuário pode cancelar a própria solicitação enquanto pendente (apenas mudar status para cancelled)
CREATE POLICY "User cancels own pending request"
ON public.school_transfer_requests
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status IN ('pending','cancelled'));

-- Gestor da escola destino aprova/rejeita
CREATE POLICY "Gestor of destination updates request"
ON public.school_transfer_requests
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = school_transfer_requests.to_school_id
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = school_transfer_requests.to_school_id
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  )
);

-- Admin pode atualizar
CREATE POLICY "Admin updates transfer requests"
ON public.school_transfer_requests
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bloquear DELETE no client
CREATE POLICY "Block delete on transfer requests"
ON public.school_transfer_requests
FOR DELETE TO authenticated
USING (false);

-- ==== Função para aprovar a transferência (move o profile e re-aprova) ====
CREATE OR REPLACE FUNCTION public.approve_school_transfer(_request_id uuid, _note text DEFAULT NULL)
RETURNS public.school_transfer_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.school_transfer_requests;
  _can boolean;
BEGIN
  SELECT * INTO _req FROM public.school_transfer_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;

  -- Permissão: admin OU gestor/chef da escola destino
  _can := public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = _req.to_school_id
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  );
  IF NOT _can THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Move o profile para a nova escola, reseta aprovação e aplica cargo solicitado
  UPDATE public.profiles
  SET school_id = _req.to_school_id,
      role = _req.requested_role,
      is_approved = false,
      updated_at = now()
  WHERE user_id = _req.user_id;

  UPDATE public.school_transfer_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = _note,
      updated_at = now()
  WHERE id = _request_id
  RETURNING * INTO _req;

  -- Auditoria
  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'school_transfer_approved',
    'school_transfer_requests',
    _req.id::text,
    jsonb_build_object('user_id', _req.user_id, 'from', _req.from_school_id, 'to', _req.to_school_id, 'role', _req.requested_role),
    auth.uid(),
    _req.to_school_id
  );

  RETURN _req;
END $$;

CREATE OR REPLACE FUNCTION public.reject_school_transfer(_request_id uuid, _note text DEFAULT NULL)
RETURNS public.school_transfer_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.school_transfer_requests;
  _can boolean;
BEGIN
  SELECT * INTO _req FROM public.school_transfer_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;

  _can := public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = _req.to_school_id
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  );
  IF NOT _can THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.school_transfer_requests
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = _note,
      updated_at = now()
  WHERE id = _request_id
  RETURNING * INTO _req;

  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'school_transfer_rejected',
    'school_transfer_requests',
    _req.id::text,
    jsonb_build_object('user_id', _req.user_id, 'from', _req.from_school_id, 'to', _req.to_school_id, 'note', _note),
    auth.uid(),
    _req.to_school_id
  );

  RETURN _req;
END $$;