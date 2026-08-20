-- 1) Tabela de ausência do dia inteiro (por professor + data)
CREATE TABLE IF NOT EXISTS public.teacher_day_absence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  teacher_name text NOT NULL,
  absence_date date NOT NULL,
  reason text NOT NULL DEFAULT 'Faltou o dia todo',
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_day_absence_uniq
  ON public.teacher_day_absence (school_id, absence_date, lower(btrim(teacher_name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_day_absence TO authenticated;
GRANT ALL ON public.teacher_day_absence TO service_role;

ALTER TABLE public.teacher_day_absence ENABLE ROW LEVEL SECURITY;

-- Admin gerencia tudo
CREATE POLICY "Admin manages day absences"
  ON public.teacher_day_absence
  FOR ALL
  TO authenticated
  USING (private_api.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

-- Leitura na escola do usuário aprovado
CREATE POLICY "Read day absences in own school"
  ON public.teacher_day_absence
  FOR SELECT
  TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    AND private_api.is_user_approved(auth.uid())
  );

-- Assistente/secretário/gestor inserem/atualizam para sua escola
CREATE POLICY "Staff writes day absences in own school"
  ON public.teacher_day_absence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    AND private_api.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role = ANY (ARRAY[
          'assistente_alunos','assistente','secretario_escolar',
          'gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor'
        ])
    )
  );

CREATE POLICY "Staff updates day absences in own school"
  ON public.teacher_day_absence
  FOR UPDATE
  TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    AND private_api.is_user_approved(auth.uid())
  )
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
  );

CREATE POLICY "Staff deletes day absences in own school"
  ON public.teacher_day_absence
  FOR DELETE
  TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    AND private_api.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role = ANY (ARRAY[
          'assistente_alunos','assistente','secretario_escolar',
          'gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor'
        ])
    )
  );

-- Realtime
ALTER TABLE public.teacher_day_absence REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_day_absence';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) Função que aplica a regra: para cada roster do professor no dia (weekday),
-- e cada período do turno do roster, cria linha 'ausente' com nota
-- "Faltou o dia todo" quando ainda não houver marcação.
CREATE OR REPLACE FUNCTION public.apply_teacher_day_absence(
  p_school_id uuid,
  p_teacher_name text,
  p_date date,
  p_marked_by uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekday int;
  v_inserted int := 0;
BEGIN
  v_weekday := EXTRACT(DOW FROM p_date)::int;

  INSERT INTO public.teacher_roster_presence (
    roster_id, school_id, presence_date, period_number,
    status, notes, marked_by
  )
  SELECT
    r.id, r.school_id, p_date, sp.period_number,
    'ausente', 'Faltou o dia todo', p_marked_by
  FROM public.teacher_roster r
  JOIN public.schedule_periods sp
    ON sp.school_id = r.school_id
   AND (
     (r.shift IS NOT NULL AND lower(btrim(sp.shift)) = lower(btrim(r.shift)))
     OR r.shift IS NULL
   )
  WHERE r.school_id = p_school_id
    AND r.weekday = v_weekday
    AND lower(btrim(r.teacher_name)) = lower(btrim(p_teacher_name))
    AND NOT EXISTS (
      SELECT 1 FROM public.teacher_roster_presence prp
      WHERE prp.roster_id = r.id
        AND prp.presence_date = p_date
        AND prp.period_number = sp.period_number
    )
  ON CONFLICT (roster_id, presence_date, period_number) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_teacher_day_absence(uuid, text, date, uuid) TO authenticated;

-- 3) Trigger: ao inserir em teacher_day_absence, aplica automaticamente
CREATE OR REPLACE FUNCTION public.trg_apply_day_absence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_teacher_day_absence(
    NEW.school_id, NEW.teacher_name, NEW.absence_date, NEW.marked_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_day_absence_apply ON public.teacher_day_absence;
CREATE TRIGGER teacher_day_absence_apply
AFTER INSERT ON public.teacher_day_absence
FOR EACH ROW EXECUTE FUNCTION public.trg_apply_day_absence();

-- updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_teacher_day_absence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS teacher_day_absence_touch ON public.teacher_day_absence;
CREATE TRIGGER teacher_day_absence_touch
BEFORE UPDATE ON public.teacher_day_absence
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_teacher_day_absence();