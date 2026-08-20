-- Remove sistema de presença de aluno (não era pedido)
DROP TABLE IF EXISTS public.attendance_records CASCADE;

-- Criar tabela de PRESENÇA DO PROFESSOR (1 registro por agendamento)
CREATE TABLE public.teacher_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  booking_id UUID NOT NULL UNIQUE,
  teacher_user_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('presente','ausente','atrasado','justificado')),
  notes TEXT,
  marked_by UUID NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_presence TO authenticated;
GRANT ALL ON public.teacher_presence TO service_role;

ALTER TABLE public.teacher_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View teacher_presence same school"
ON public.teacher_presence FOR SELECT TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Assistant/gestor insert teacher_presence"
ON public.teacher_presence FOR INSERT TO authenticated
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND marked_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.is_approved = true
      AND p.role IN ('assistente','secretario_escolar','gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor')
  )
);

CREATE POLICY "Assistant/gestor update teacher_presence"
ON public.teacher_presence FOR UPDATE TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.is_approved = true
      AND p.role IN ('assistente','secretario_escolar','gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor')
  )
)
WITH CHECK (school_id = private_api.get_user_school_id(auth.uid()));

CREATE POLICY "Gestor delete teacher_presence"
ON public.teacher_presence FOR DELETE TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
);

CREATE INDEX idx_teacher_presence_school_date ON public.teacher_presence(school_id, marked_at DESC);
CREATE INDEX idx_teacher_presence_booking ON public.teacher_presence(booking_id);

CREATE TRIGGER trg_teacher_presence_updated
BEFORE UPDATE ON public.teacher_presence
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_presence;