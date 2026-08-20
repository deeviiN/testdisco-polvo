
-- =============================================================
-- Sistema de pagamentos Mercado Pago — tabelas pagamentos e assinaturas
-- =============================================================

-- Tabela: pagamentos
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID NOT NULL,
  plano TEXT NOT NULL CHECK (plano IN ('mensal', 'anual')),
  valor NUMERIC(10, 2) NOT NULL,
  metodo TEXT NOT NULL CHECK (metodo IN ('pix', 'boleto', 'cartao')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back')),
  mp_payment_id TEXT,
  mp_preference_id TEXT,
  mp_external_reference TEXT,
  mp_raw JSONB,
  qr_code TEXT,
  qr_code_base64 TEXT,
  ticket_url TEXT,
  init_point TEXT,
  data_inicio TIMESTAMPTZ,
  data_fim TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_user_id ON public.pagamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_school_id ON public.pagamentos(school_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_mp_payment_id ON public.pagamentos(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_mp_external_reference ON public.pagamentos(mp_external_reference);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

-- Apenas leitura para usuários da mesma escola e admins (escrita só via Edge Function service-role)
CREATE POLICY "View pagamentos same school"
  ON public.pagamentos FOR SELECT TO authenticated
  USING (school_id = get_user_school_id(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Block client insert pagamentos"
  ON public.pagamentos FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block client update pagamentos"
  ON public.pagamentos FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Block client delete pagamentos"
  ON public.pagamentos FOR DELETE TO authenticated
  USING (false);

CREATE TRIGGER trg_pagamentos_updated_at
  BEFORE UPDATE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: assinaturas (uma por escola, registro extensível por renovações)
CREATE TABLE IF NOT EXISTS public.assinaturas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'inativo' CHECK (status IN ('ativo', 'inativo', 'cancelado')),
  tipo TEXT NOT NULL CHECK (tipo IN ('mensal', 'anual')),
  validade TIMESTAMPTZ NOT NULL,
  ultima_pagamento_id UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_school_id ON public.assinaturas(school_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON public.assinaturas(status);

ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View assinaturas same school"
  ON public.assinaturas FOR SELECT TO authenticated
  USING (school_id = get_user_school_id(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Block client write assinaturas insert"
  ON public.assinaturas FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block client write assinaturas update"
  ON public.assinaturas FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Block client write assinaturas delete"
  ON public.assinaturas FOR DELETE TO authenticated
  USING (false);

CREATE TRIGGER trg_assinaturas_updated_at
  BEFORE UPDATE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- Função: liberar_assinatura
-- Aplica regra: aprovado → mensal +30 dias, anual +365 dias.
-- Se já existe assinatura ativa não expirada, soma o período ao final atual.
-- Atualiza também schools.subscription_status / subscription_end_date.
-- =============================================================
CREATE OR REPLACE FUNCTION public.liberar_assinatura(_pagamento_id UUID)
RETURNS public.assinaturas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pag public.pagamentos;
  _existing public.assinaturas;
  _base TIMESTAMPTZ;
  _add_days INT;
  _new_validade TIMESTAMPTZ;
  _result public.assinaturas;
BEGIN
  SELECT * INTO _pag FROM public.pagamentos WHERE id = _pagamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado: %', _pagamento_id;
  END IF;

  IF _pag.status <> 'approved' THEN
    RAISE EXCEPTION 'Pagamento não está aprovado (status=%)', _pag.status;
  END IF;

  _add_days := CASE _pag.plano WHEN 'mensal' THEN 30 WHEN 'anual' THEN 365 ELSE 30 END;

  SELECT * INTO _existing FROM public.assinaturas WHERE school_id = _pag.school_id;

  IF FOUND AND _existing.status = 'ativo' AND _existing.validade > now() THEN
    -- Soma ao período atual (pagamento antecipado / vários meses)
    _base := _existing.validade;
  ELSE
    _base := now();
  END IF;

  _new_validade := _base + (_add_days || ' days')::interval;

  IF FOUND THEN
    UPDATE public.assinaturas
    SET status = 'ativo',
        tipo = _pag.plano,
        validade = _new_validade,
        user_id = COALESCE(_pag.user_id, _existing.user_id),
        ultima_pagamento_id = _pag.id,
        updated_at = now()
    WHERE id = _existing.id
    RETURNING * INTO _result;
  ELSE
    INSERT INTO public.assinaturas (school_id, user_id, status, tipo, validade, ultima_pagamento_id)
    VALUES (_pag.school_id, _pag.user_id, 'ativo', _pag.plano, _new_validade, _pag.id)
    RETURNING * INTO _result;
  END IF;

  -- Atualiza pagamento com janela efetiva
  UPDATE public.pagamentos
  SET data_inicio = _base,
      data_fim = _new_validade,
      approved_at = COALESCE(approved_at, now()),
      updated_at = now()
  WHERE id = _pag.id;

  -- Sincroniza com schools (modelo atual do app)
  UPDATE public.schools
  SET subscription_status = 'active',
      subscription_end_date = _new_validade::date
  WHERE id = _pag.school_id;

  -- Aprovação automática de gestores (regra existente do projeto)
  UPDATE public.profiles
  SET is_approved = true,
      approved_until = NULL,
      updated_at = now()
  WHERE school_id = _pag.school_id
    AND role IN ('gestor_pedagogico','chef_projeto_vida');

  -- Auditoria
  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    'subscription_released',
    'assinaturas',
    _result.id::text,
    jsonb_build_object(
      'pagamento_id', _pag.id,
      'plano', _pag.plano,
      'metodo', _pag.metodo,
      'valor', _pag.valor,
      'validade', _new_validade
    ),
    _pag.user_id,
    _pag.school_id
  );

  RETURN _result;
END;
$$;

-- =============================================================
-- Função: get_my_assinatura — leitura pública à própria escola
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_my_assinatura()
RETURNS public.assinaturas
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.* FROM public.assinaturas a
  WHERE a.school_id = get_user_school_id(auth.uid())
  LIMIT 1;
$$;
