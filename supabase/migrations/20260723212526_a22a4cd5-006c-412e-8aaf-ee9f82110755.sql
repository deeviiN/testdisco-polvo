
ALTER TABLE public.panel_settings
  ADD COLUMN IF NOT EXISTS mostrar_aniv_servidores BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.servidores_aniversariantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  dia SMALLINT NOT NULL CHECK (dia BETWEEN 1 AND 31),
  mes SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cargo TEXT,
  setor TEXT,
  foto_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_serv_aniv_school ON public.servidores_aniversariantes(school_id);
CREATE INDEX idx_serv_aniv_data ON public.servidores_aniversariantes(mes, dia);

GRANT SELECT ON public.servidores_aniversariantes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servidores_aniversariantes TO authenticated;
GRANT ALL ON public.servidores_aniversariantes TO service_role;

ALTER TABLE public.servidores_aniversariantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Painel TV pode ler aniversariantes"
  ON public.servidores_aniversariantes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Aprovados da escola veem aniversariantes"
  ON public.servidores_aniversariantes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.school_id = servidores_aniversariantes.school_id
        AND p.is_approved = true
    )
  );

CREATE POLICY "Gestor/Secretario gerenciam aniversariantes"
  ON public.servidores_aniversariantes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.school_id = servidores_aniversariantes.school_id
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida','secretario_escolar')
        AND p.is_approved = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.school_id = servidores_aniversariantes.school_id
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida','secretario_escolar')
        AND p.is_approved = true
    )
  );

CREATE TRIGGER update_servidores_aniv_updated_at
  BEFORE UPDATE ON public.servidores_aniversariantes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
