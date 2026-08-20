
CREATE TABLE public.school_siren_settings (
  school_id UUID PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  siren_kind TEXT NOT NULL DEFAULT 'silvo' CHECK (siren_kind IN ('silvo','badalo')),
  short_seconds SMALLINT NOT NULL DEFAULT 4 CHECK (short_seconds BETWEEN 1 AND 30),
  long_seconds SMALLINT NOT NULL DEFAULT 12 CHECK (long_seconds BETWEEN 3 AND 60),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_siren_settings TO authenticated;
GRANT ALL ON public.school_siren_settings TO service_role;

ALTER TABLE public.school_siren_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members read siren settings"
ON public.school_siren_settings FOR SELECT TO authenticated
USING (school_id = public.get_user_school_id(auth.uid()));

CREATE POLICY "managers manage siren settings"
ON public.school_siren_settings FOR ALL TO authenticated
USING (
  school_id = public.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','coordenador_pedagogico','chef_projeto_vida','admin')
  )
)
WITH CHECK (
  school_id = public.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','coordenador_pedagogico','chef_projeto_vida','admin')
  )
);
