-- ============================================================
-- PAINEL INTELIGENTE ESCOLAR — FASE 2
-- Tabelas para controle de presença, transferência de
-- responsabilidade e configuração do painel.
-- ============================================================

-- 1) ASSISTANT_CLASSES: vincula usuários com papel 'assistente'
--    às turmas/séries que eles monitoram presença.
CREATE TABLE public.assistant_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assistant_user_id uuid NOT NULL,
  class_label text NOT NULL,                  -- ex.: "9º A", "3ª Série Médio B"
  education_level text,                       -- fundamental | medio | eja | outro
  shift text,                                  -- matutino | vespertino | noturno
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, assistant_user_id, class_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_classes TO authenticated;
GRANT ALL ON public.assistant_classes TO service_role;

ALTER TABLE public.assistant_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View assistant_classes same school"
  ON public.assistant_classes FOR SELECT TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Gestor manages assistant_classes"
  ON public.assistant_classes FOR ALL TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  )
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  );

CREATE POLICY "Admin manages assistant_classes"
  ON public.assistant_classes FOR ALL TO authenticated
  USING (private_api.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));


-- 2) ATTENDANCE_RECORDS: registros de presença lançados pelo
--    assistente para um agendamento/aula específica.
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  booking_id uuid,                            -- pode ser nulo se for aula fora do sistema
  class_label text NOT NULL,
  student_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('presente','ausente','justificado','atrasado')),
  notes text,
  recorded_by uuid NOT NULL,                  -- assistente que registrou
  recorded_at timestamptz NOT NULL DEFAULT now(),
  attendance_date date NOT NULL DEFAULT (now()::date),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_school_date ON public.attendance_records (school_id, attendance_date);
CREATE INDEX idx_attendance_booking ON public.attendance_records (booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View attendance same school"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Assistant/gestor insert attendance"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    AND recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('assistente','gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor')
    )
  );

CREATE POLICY "Recorder/gestor update attendance"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    (recorded_by = auth.uid()) OR
    (school_id = private_api.get_user_school_id(auth.uid())
     AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()
                  AND p.is_approved = true
                  AND p.role IN ('gestor_pedagogico','chef_projeto_vida')))
  )
  WITH CHECK (school_id = private_api.get_user_school_id(auth.uid()));

CREATE POLICY "Gestor delete attendance"
  ON public.attendance_records FOR DELETE TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()
                 AND p.is_approved = true
                 AND p.role IN ('gestor_pedagogico','chef_projeto_vida'))
  );


-- 3) RESPONSIBILITY_TRANSFERS: transferência de responsabilidade
--    por um agendamento (substituição de professor).
CREATE TABLE public.responsibility_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  approved_by uuid,                           -- gestor que homologou (opcional)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transfers_booking ON public.responsibility_transfers (booking_id);
CREATE INDEX idx_transfers_to_user ON public.responsibility_transfers (to_user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsibility_transfers TO authenticated;
GRANT ALL ON public.responsibility_transfers TO service_role;

ALTER TABLE public.responsibility_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View transfers same school"
  ON public.responsibility_transfers FOR SELECT TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Owner creates transfer"
  ON public.responsibility_transfers FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    AND from_user_id = auth.uid()
    AND to_user_id <> auth.uid()
  );

CREATE POLICY "Target/gestor updates transfer"
  ON public.responsibility_transfers FOR UPDATE TO authenticated
  USING (
    to_user_id = auth.uid()
    OR from_user_id = auth.uid()
    OR (school_id = private_api.get_user_school_id(auth.uid())
        AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()
                     AND p.is_approved = true
                     AND p.role IN ('gestor_pedagogico','chef_projeto_vida')))
  )
  WITH CHECK (school_id = private_api.get_user_school_id(auth.uid()));


-- 4) PANEL_SETTINGS: configuração do Painel TV por escola.
CREATE TABLE public.panel_settings (
  school_id uuid PRIMARY KEY,
  refresh_seconds integer NOT NULL DEFAULT 30,
  show_finished boolean NOT NULL DEFAULT true,
  show_absent boolean NOT NULL DEFAULT true,
  highlight_color text NOT NULL DEFAULT '#10b981',
  panel_title text,
  marquee_message text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.panel_settings TO authenticated;
GRANT ALL ON public.panel_settings TO service_role;

ALTER TABLE public.panel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View panel_settings same school"
  ON public.panel_settings FOR SELECT TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Gestor manages panel_settings"
  ON public.panel_settings FOR ALL TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()
                 AND p.is_approved = true
                 AND p.role IN ('gestor_pedagogico','chef_projeto_vida'))
  )
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
  );

CREATE POLICY "Admin manages panel_settings"
  ON public.panel_settings FOR ALL TO authenticated
  USING (private_api.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.responsibility_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.panel_settings;