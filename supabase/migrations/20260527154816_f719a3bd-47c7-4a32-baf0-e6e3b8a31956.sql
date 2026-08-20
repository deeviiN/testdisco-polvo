
CREATE TABLE public.school_discipline_settings (
  school_id uuid PRIMARY KEY,
  infractions_threshold integer NOT NULL DEFAULT 3,
  block_duration_minutes integer NOT NULL DEFAULT 21600, -- 15 dias
  auto_block boolean NOT NULL DEFAULT true,
  manager_review boolean NOT NULL DEFAULT true,
  checkin_tolerance_minutes integer NOT NULL DEFAULT 20,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_threshold CHECK (infractions_threshold BETWEEN 1 AND 20),
  CONSTRAINT chk_block_duration CHECK (block_duration_minutes BETWEEN 1 AND 525600),
  CONSTRAINT chk_tolerance CHECK (checkin_tolerance_minutes BETWEEN 0 AND 240)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_discipline_settings TO authenticated;
GRANT ALL ON public.school_discipline_settings TO service_role;

ALTER TABLE public.school_discipline_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View discipline settings same school"
ON public.school_discipline_settings
FOR SELECT
TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Gestor insert discipline settings"
ON public.school_discipline_settings
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
);

CREATE POLICY "Gestor update discipline settings"
ON public.school_discipline_settings
FOR UPDATE
TO authenticated
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
);

CREATE POLICY "Admin manages discipline settings"
ON public.school_discipline_settings
FOR ALL
TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_discipline_settings_updated_at
BEFORE UPDATE ON public.school_discipline_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
