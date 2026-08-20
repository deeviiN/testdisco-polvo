CREATE OR REPLACE FUNCTION public.liberar_assinatura(_pagamento_id uuid)
 RETURNS public.assinaturas
 LANGUAGE plpgsql
 AS $function$
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

  -- Cálculo de dias baseado no plano (suporte a pacotes de vários anos)
  _add_days := CASE _pag.plano 
    WHEN 'mensal' THEN 30 
    WHEN 'anual' THEN 365 
    WHEN 'anual_12' THEN 365
    WHEN 'anual_24' THEN 730
    WHEN 'anual_36' THEN 1095
    WHEN 'anual_48' THEN 1460
    ELSE 30 
  END;

  SELECT * INTO _existing FROM public.assinaturas WHERE school_id = _pag.school_id;

  IF FOUND AND _existing.status = 'ativo' AND _existing.validade > now() THEN
    -- Soma ao período atual (pagamento antecipado / vários meses)
    _base := _existing.validade;
  ELSE
    -- Se expirado ou novo, começa de agora
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
      'validade', _new_validade,
      'dias_adicionados', _add_days
    ),
    _pag.user_id,
    _pag.school_id
  );

  RETURN _result;
END;
$function$;