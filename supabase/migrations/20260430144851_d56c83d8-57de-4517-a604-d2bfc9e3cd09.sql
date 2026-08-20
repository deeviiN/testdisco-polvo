-- Tabela para comandos remotos do app
CREATE TABLE IF NOT EXISTS public.app_remote_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_type TEXT NOT NULL, -- e.g., 'REFRESH_ALL'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    payload JSONB DEFAULT '{}'::jsonb
);

-- Habilitar Realtime para esta tabela
ALTER publication supabase_realtime ADD TABLE app_remote_commands;

-- RLS
ALTER TABLE public.app_remote_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer um pode ler comandos remotos"
ON public.app_remote_commands FOR SELECT
USING (true);

CREATE POLICY "Apenas administradores podem criar comandos"
ON public.app_remote_commands FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Função para disparar o refresh global
CREATE OR REPLACE FUNCTION public.broadcast_app_refresh()
RETURNS void AS $$
BEGIN
    INSERT INTO public.app_remote_commands (command_type, created_by)
    VALUES ('REFRESH_ALL', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
