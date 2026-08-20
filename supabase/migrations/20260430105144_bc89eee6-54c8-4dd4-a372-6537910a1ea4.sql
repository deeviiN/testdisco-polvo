-- Removemos e recriamos a função para garantir consistência total
DROP FUNCTION IF EXISTS public.bulk_set_schools_status(text);

CREATE OR REPLACE FUNCTION public.bulk_set_schools_status(_status TEXT)
RETURNS SETOF JSONB AS $$
DECLARE
    v_updated INTEGER := 0;
    v_preserved INTEGER := 0;
BEGIN
    -- Bloqueio em massa
    IF _status = 'blocked' THEN
        -- Identificamos quem NÃO deve ser bloqueado:
        -- 1. Assinaturas confirmadas (active, paid, trialing)
        -- 2. Escolas que ainda estão dentro da data de término (se houver)
        
        -- Contagem para o relatório
        SELECT count(*) INTO v_preserved 
        FROM schools 
        WHERE (subscription_status IN ('active', 'paid', 'trialing', 'trial'))
        AND (subscription_end_date IS NULL OR subscription_end_date > now());

        -- Executa o bloqueio apenas em quem NÃO tem assinatura ativa
        -- e está marcado como ativo no momento
        UPDATE schools
        SET is_active = false,
            subscription_status = 'inactive'
        WHERE is_active = true
        AND (subscription_status IS NULL OR subscription_status NOT IN ('active', 'paid', 'trialing', 'trial'))
        AND (subscription_end_date IS NULL OR subscription_end_date <= now());
        
        GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- Ativação em massa (Correção do Erro)
    ELSE
        -- Forçamos a reativação de todas as escolas que estavam desativadas
        UPDATE schools 
        SET is_active = true 
        WHERE is_active = false;
        
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        
        -- Na ativação, 'preserved' são as que já estavam ativas
        SELECT count(*) INTO v_preserved FROM schools WHERE is_active = true;
    END IF;

    RETURN NEXT jsonb_build_object(
        'updated_count', v_updated,
        'preserved_count', v_preserved
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
