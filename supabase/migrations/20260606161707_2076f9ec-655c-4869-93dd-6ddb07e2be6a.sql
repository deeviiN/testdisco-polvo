
-- 1) Aceitar 'alarme' e 'campainha' no tipo de sirene
ALTER TABLE public.school_siren_settings
  DROP CONSTRAINT IF EXISTS school_siren_settings_siren_kind_check;
ALTER TABLE public.school_siren_settings
  ADD CONSTRAINT school_siren_settings_siren_kind_check
  CHECK (siren_kind = ANY (ARRAY['silvo','badalo','alarme','campainha']));

-- Normalizar registros antigos para o novo vocabulário
UPDATE public.school_siren_settings SET siren_kind = 'alarme' WHERE siren_kind = 'silvo';
UPDATE public.school_siren_settings SET siren_kind = 'campainha' WHERE siren_kind = 'badalo';

-- 2) Permitir coord_pedagogico também salvar panel_settings
DROP POLICY IF EXISTS "Gestor manages panel_settings" ON public.panel_settings;
CREATE POLICY "Gestor manages panel_settings"
ON public.panel_settings
FOR ALL
USING (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','chef_projeto_vida','coord_pedagogico'])
  )
)
WITH CHECK (school_id = private_api.get_user_school_id(auth.uid()));
