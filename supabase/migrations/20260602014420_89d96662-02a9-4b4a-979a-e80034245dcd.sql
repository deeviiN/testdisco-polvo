
-- Quadro de professores do assistente
CREATE TABLE public.teacher_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assistant_user_id uuid NOT NULL,
  teacher_name text NOT NULL,
  discipline text,
  class_name text,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  shift text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_teacher_roster_school ON public.teacher_roster(school_id, weekday);
CREATE INDEX idx_teacher_roster_assistant ON public.teacher_roster(assistant_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_roster TO authenticated;
GRANT ALL ON public.teacher_roster TO service_role;

ALTER TABLE public.teacher_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assistant manages own roster"
ON public.teacher_roster FOR ALL TO authenticated
USING (assistant_user_id = auth.uid())
WITH CHECK (assistant_user_id = auth.uid() AND school_id = private_api.get_user_school_id(auth.uid()));

CREATE POLICY "School staff view roster"
ON public.teacher_roster FOR SELECT TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

CREATE POLICY "Admin manages all roster"
ON public.teacher_roster FOR ALL TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_teacher_roster_updated_at
BEFORE UPDATE ON public.teacher_roster
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Presença diária do quadro
CREATE TABLE public.teacher_roster_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES public.teacher_roster(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  presence_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('presente','ausente','atrasado','justificado')),
  notes text,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (roster_id, presence_date)
);

CREATE INDEX idx_trp_school_date ON public.teacher_roster_presence(school_id, presence_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_roster_presence TO authenticated;
GRANT ALL ON public.teacher_roster_presence TO service_role;

ALTER TABLE public.teacher_roster_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assistant marks presence on own roster"
ON public.teacher_roster_presence FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.teacher_roster r WHERE r.id = roster_id AND r.assistant_user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.teacher_roster r WHERE r.id = roster_id AND r.assistant_user_id = auth.uid())
  AND school_id = private_api.get_user_school_id(auth.uid())
);

CREATE POLICY "School staff view presence"
ON public.teacher_roster_presence FOR SELECT TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

CREATE POLICY "Manager marks presence"
ON public.teacher_roster_presence FOR ALL TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor'))
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
);

CREATE POLICY "Admin manages all presence"
ON public.teacher_roster_presence FOR ALL TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_trp_updated_at
BEFORE UPDATE ON public.teacher_roster_presence
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_roster;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_roster_presence;
ALTER TABLE public.teacher_roster REPLICA IDENTITY FULL;
ALTER TABLE public.teacher_roster_presence REPLICA IDENTITY FULL;
