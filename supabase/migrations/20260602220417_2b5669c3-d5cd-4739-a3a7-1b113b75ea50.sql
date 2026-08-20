
CREATE TABLE public.schedule_reduced_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  reduced_date DATE NOT NULL,
  shift TEXT NOT NULL,
  period_number INT NOT NULL,
  label TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, reduced_date, shift, period_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_reduced_days TO authenticated;
GRANT ALL ON public.schedule_reduced_days TO service_role;

ALTER TABLE public.schedule_reduced_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members read reduced days"
ON public.schedule_reduced_days FOR SELECT
TO authenticated
USING (school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "managers write reduced days"
ON public.schedule_reduced_days FOR ALL
TO authenticated
USING (
  school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor','coordenador','chef_sala','assistente_alunos','admin')
  )
)
WITH CHECK (
  school_id IN (SELECT school_id FROM public.profiles WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor','coordenador','chef_sala','assistente_alunos','admin')
  )
);

CREATE INDEX idx_reduced_days_school_date ON public.schedule_reduced_days(school_id, reduced_date);
