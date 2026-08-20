-- Tabela para logs detalhados de integração com Mercado Pago
CREATE TABLE IF NOT EXISTS public.payment_integration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pagamento_id UUID REFERENCES public.pagamentos(id),
    mp_payment_id TEXT,
    event_type TEXT NOT NULL, -- 'webhook', 'manual_check', 'creation'
    status_before TEXT,
    status_after TEXT,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS nos logs de integração
ALTER TABLE public.payment_integration_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para visualização de logs (apenas admins)
CREATE POLICY "Admins podem ver todos os logs de integração"
ON public.payment_integration_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- Índice para busca rápida de logs por pagamento
CREATE INDEX IF NOT EXISTS idx_payment_logs_pagamento_id ON public.payment_integration_logs(pagamento_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_mp_id ON public.payment_integration_logs(mp_payment_id);

-- Função para registrar mudança de status automaticamente via trigger
CREATE OR REPLACE FUNCTION public.log_payment_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.payment_integration_logs (
            pagamento_id,
            mp_payment_id,
            event_type,
            status_before,
            status_after,
            payload
        ) VALUES (
            NEW.id,
            NEW.mp_payment_id,
            'status_update',
            OLD.status,
            NEW.status,
            jsonb_build_object('trigger', true, 'updated_at', now())
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para capturar mudanças de status na tabela pagamentos
DROP TRIGGER IF EXISTS tr_log_payment_status ON public.pagamentos;
CREATE TRIGGER tr_log_payment_status
AFTER UPDATE ON public.pagamentos
FOR EACH ROW
EXECUTE FUNCTION public.log_payment_status_change();
