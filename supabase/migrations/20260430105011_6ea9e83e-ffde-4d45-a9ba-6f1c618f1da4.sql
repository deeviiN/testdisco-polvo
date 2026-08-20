-- Primeiro removemos a função existente para mudar o tipo de retorno se necessário
DROP FUNCTION IF EXISTS public.bulk_set_schools_status(text);

-- Recriação da função com a lógica correta
CREATE OR REPLACE FUNCTION public.bulk_set_schools_status(_status TEXT)
RETURNS SETOF JSONB AS $$
DECLARE
    v_updated INTEGER := 0;
    v_preserved INTEGER := 0;
BEGIN
    -- Se for para bloquear, preservamos quem tem assinatura ativa ou está em carência
    IF _status = 'blocked' THEN
        -- Contamos quem será preservado (assinantes ativos ou dentro da validade)
        SELECT count(*) INTO v_preserved 
        FROM schools 
        WHERE (subscription_status IN ('active', 'paid', 'trialing', 'trial') OR is_active = true)
        AND (subscription_end_date IS NULL OR subscription_end_date > now());

        -- Atualizamos apenas quem NÃO tem assinatura ativa/carência
        UPDATE schools
        SET is_active = false,
            subscription_status = 'inactive'
        WHERE subscription_status NOT IN ('active', 'paid', 'trialing', 'trial')
        AND is_active = true
        AND (subscription_end_date IS NULL OR subscription_end_date <= now());
        
        GET DIAGNOSTICS v_updated = ROW_COUNT;
    ELSE
        -- Reativação em massa (simples)
        UPDATE schools SET is_active = true WHERE is_active = false;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
    END IF;

    RETURN NEXT jsonb_build_object(
        'updated_count', v_updated,
        'preserved_count', v_preserved
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para o contador regressivo
CREATE OR REPLACE FUNCTION public.get_school_subscription_countdown(_school_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_end_date TIMESTAMP WITH TIME ZONE;
    v_grace_days INTEGER;
    v_status TEXT;
    v_total_days INTEGER;
BEGIN
    SELECT subscription_end_date, grace_period_days, subscription_status 
    INTO v_end_date, v_grace_days, v_status
    FROM schools 
    WHERE id = _school_id;

    IF v_status IS NULL OR v_status = 'inactive' THEN
        RETURN 0;
    END IF;

    IF v_end_date IS NOT NULL THEN
        v_total_days := EXTRACT(DAY FROM (v_end_date - now()));
    ELSE
        v_total_days := COALESCE(v_grace_days, 7);
    END IF;

    RETURN GREATEST(v_total_days, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
