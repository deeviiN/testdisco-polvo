
CREATE TABLE public.schedule_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  change_type text NOT NULL, -- 'periods' | 'reduced_day' | 'siren' | 'break_after'
  shift text,                 -- 'manha' | 'tarde' | 'noite' | null
  reduced_date date,          -- só para reduced_day
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_change_logs_school_date
  ON public.schedule_change_logs (school_id, created_at DESC);

GRANT SELECT, INSERT ON public.schedule_change_logs TO authenticated;
GRANT ALL ON public.schedule_change_logs TO service_role;

ALTER TABLE public.schedule_change_logs ENABLE ROW LEVEL SECURITY;

-- Inserir: usuário aprovado da própria escola, registrando a si mesmo
CREATE POLICY "Approved users log own actions"
ON public.schedule_change_logs
FOR INSERT
TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

-- Ver: gestor/chef da mesma escola, ou admin
CREATE POLICY "Gestor/chef view school logs"
ON public.schedule_change_logs
FOR SELECT
TO authenticated
USING (
  private_api.has_role(auth.uid(), 'admin'::app_role)
  OR (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor')
    )
  )
);

-- Sem update / delete (imutável)
CREATE POLICY "Block update schedule logs"
ON public.schedule_change_logs
FOR UPDATE
TO authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Block delete schedule logs"
ON public.schedule_change_logs
FOR DELETE
TO authenticated
USING (false);
