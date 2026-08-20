
CREATE TABLE public.roster_call_settings (
  school_id uuid PRIMARY KEY,
  tolerance_manha integer NOT NULL DEFAULT 15,
  tolerance_tarde integer NOT NULL DEFAULT 15,
  tolerance_noite integer NOT NULL DEFAULT 15,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_tol_manha CHECK (tolerance_manha BETWEEN 0 AND 120),
  CONSTRAINT chk_tol_tarde CHECK (tolerance_tarde BETWEEN 0 AND 120),
  CONSTRAINT chk_tol_noite CHECK (tolerance_noite BETWEEN 0 AND 120)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_call_settings TO authenticated;
GRANT ALL ON public.roster_call_settings TO service_role;

ALTER TABLE public.roster_call_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View roster_call_settings same school"
ON public.roster_call_settings FOR SELECT TO authenticated
USING (
  (school_id = private_api.get_user_school_id(auth.uid()) AND private_api.is_user_approved(auth.uid()))
  OR private_api.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Gestor manages roster_call_settings"
ON public.roster_call_settings FOR ALL TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.is_approved = true AND p.role IN ('gestor_pedagogico','chef_projeto_vida'))
)
WITH CHECK (school_id = private_api.get_user_school_id(auth.uid()));

CREATE POLICY "Admin manages roster_call_settings"
ON public.roster_call_settings FOR ALL TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));
