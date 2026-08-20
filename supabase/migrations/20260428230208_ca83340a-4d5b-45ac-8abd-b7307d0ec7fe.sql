-- Table for periodic health check results
CREATE TABLE IF NOT EXISTS public.health_checks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    service TEXT NOT NULL, -- 'mercado_pago_sandbox', 'mercado_pago_prod', 'database', 'edge_gateway'
    status TEXT NOT NULL, -- 'up', 'down', 'degraded'
    details JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;

-- Admin-only view
CREATE POLICY "Admins can view health checks" 
ON public.health_checks 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_health_checks_created_at ON public.health_checks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_service_status ON public.health_checks (service, status);

-- Cleanup function to keep table size manageable (delete older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_health_checks()
RETURNS void AS $$
BEGIN
    DELETE FROM public.health_checks WHERE created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
