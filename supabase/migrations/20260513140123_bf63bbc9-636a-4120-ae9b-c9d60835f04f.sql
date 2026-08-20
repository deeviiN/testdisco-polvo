
CREATE OR REPLACE FUNCTION public.process_mp_webhook_event(
  _mp_payment_id text,
  _status text,
  _mp_raw jsonb,
  _request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pag pagamentos%ROWTYPE;
  v_released boolean := false;
BEGIN
  -- Localiza pagamento por mp_payment_id, ou por external_reference se houver no mp_raw
  SELECT * INTO v_pag
  FROM pagamentos
  WHERE mp_payment_id = _mp_payment_id
  LIMIT 1;

  IF NOT FOUND AND (_mp_raw ? 'external_reference') THEN
    SELECT * INTO v_pag
    FROM pagamentos
    WHERE mp_external_reference = (_mp_raw->>'external_reference')
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Tenta marcar evento como processado (idempotência atômica via UNIQUE)
  BEGIN
    INSERT INTO processed_webhook_events (mp_payment_id, status, pagamento_id, request_id)
    VALUES (_mp_payment_id, _status, v_pag.id, _request_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'found', true,
      'duplicate', true,
      'pagamento_id', v_pag.id,
      'status', _status
    );
  END;

  -- Bloqueia a linha do pagamento durante a transação para evitar race
  PERFORM 1 FROM pagamentos WHERE id = v_pag.id FOR UPDATE;

  UPDATE pagamentos
  SET mp_payment_id = _mp_payment_id,
      status = _status,
      mp_raw = _mp_raw,
      approved_at = CASE WHEN _status = 'approved' AND approved_at IS NULL
                        THEN now() ELSE approved_at END,
      updated_at = now()
  WHERE id = v_pag.id;

  IF _status = 'approved' THEN
    PERFORM public.liberar_assinatura(v_pag.id);
    v_released := true;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'duplicate', false,
    'pagamento_id', v_pag.id,
    'school_id', v_pag.school_id,
    'user_id', v_pag.user_id,
    'plano', v_pag.plano,
    'status_before', v_pag.status,
    'status', _status,
    'released', v_released
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) TO service_role;
