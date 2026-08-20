
-- Tabela para histórico do linter
CREATE TABLE IF NOT EXISTS public.security_linter_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    issue_count INTEGER NOT NULL,
    raw_output TEXT,
    diff_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE public.security_linter_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view linter reports"
ON public.security_linter_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Função para limpeza
CREATE OR REPLACE FUNCTION public.cleanup_old_linter_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.security_linter_reports WHERE scan_date < now() - interval '90 days';
END;
$$;
