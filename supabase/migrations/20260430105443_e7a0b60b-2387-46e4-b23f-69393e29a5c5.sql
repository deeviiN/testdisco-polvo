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

    -- Se não estiver ativo ou em carência, retorna 0
    IF v_status IS NULL OR v_status = 'inactive' THEN
        RETURN 0;
    END IF;

    -- Calcula os dias restantes reais
    IF v_end_date IS NOT NULL THEN
        v_total_days := EXTRACT(DAY FROM (v_end_date - now()));
    ELSE
        -- Se não tiver data de fim, usa os dias de carência (carência padrão ou definida pelo gestor)
        v_total_days := COALESCE(v_grace_days, 7);
    END IF;

    -- LIMITAÇÃO SOLICITADA: No máximo 7 dias na visualização do contador
    -- Se tiver mais de 7 dias, retorna null ou 7 (dependendo de como queremos tratar no front)
    -- Para seguir a lógica de "mostrar contagem regressiva até a expiração" mas limitada,
    -- vamos retornar o valor real mas o frontend ou a própria função pode travar em 7.
    
    RETURN LEAST(GREATEST(v_total_days, 0), 7);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
