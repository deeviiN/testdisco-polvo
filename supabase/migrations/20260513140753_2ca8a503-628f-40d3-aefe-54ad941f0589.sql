
-- 1. Colunas geradas normalizadas
ALTER TABLE public.processed_webhook_events
  ADD COLUMN mp_payment_id_norm text
    GENERATED ALWAYS AS (btrim(mp_payment_id)) STORED,
  ADD COLUMN status_norm text
    GENERATED ALWAYS AS (btrim(status)) STORED;

-- 2. Substitui a UNIQUE antiga pela nova sobre as colunas normalizadas
ALTER TABLE public.processed_webhook_events
  DROP CONSTRAINT IF EXISTS processed_webhook_events_unique;

ALTER TABLE public.processed_webhook_events
  ADD CONSTRAINT processed_webhook_events_norm_unique
  UNIQUE (mp_payment_id_norm, status_norm);

-- 3. Índice auxiliar para lookup por mp_payment_id normalizado
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_payment_norm
  ON public.processed_webhook_events (mp_payment_id_norm);

-- 4. Atualiza RPC para normalizar a entrada antes do INSERT
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
  v_mp_id text := btrim(_mp_payment_id);
  v_status text := btrim(_status);
BEGIN
  IF v_mp_id IS NULL OR length(v_mp_id) = 0
     OR v_status IS NULL OR length(v_status) = 0 THEN
    RETURN jsonb_build_object('found', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_pag
  FROM pagamentos
  WHERE mp_payment_id = v_mp_id
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

  BEGIN
    INSERT INTO processed_webhook_events (mp_payment_id, status, pagamento_id, request_id)
    VALUES (v_mp_id, v_status, v_pag.id, _request_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'found', true,
      'duplicate', true,
      'pagamento_id', v_pag.id,
      'status', v_status
    );
  END;

  PERFORM 1 FROM pagamentos WHERE id = v_pag.id FOR UPDATE;

  UPDATE pagamentos
  SET mp_payment_id = v_mp_id,
      status = v_status,
      mp_raw = _mp_raw,
      approved_at = CASE WHEN v_status = 'approved' AND approved_at IS NULL
                        THEN now() ELSE approved_at END,
      updated_at = now()
  WHERE id = v_pag.id;

  IF v_status = 'approved' THEN
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
    'status', v_status,
    'released', v_released
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) TO service_role;
