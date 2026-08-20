CREATE TABLE public.contract_count_divergences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  detected_by uuid,
  db_awaiting_admin int NOT NULL DEFAULT 0,
  db_awaiting_gestor int NOT NULL DEFAULT 0,
  db_gestor_signed int NOT NULL DEFAULT 0,
  ui_awaiting_admin int NOT NULL DEFAULT 0,
  ui_awaiting_gestor int NOT NULL DEFAULT 0,
  ui_gestor_signed int NOT NULL DEFAULT 0,
  notes text
);

CREATE INDEX idx_ccd_created_at ON public.contract_count_divergences (created_at DESC);

ALTER TABLE public.contract_count_divergences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view divergences"
ON public.contract_count_divergences FOR SELECT
TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert divergences"
ON public.contract_count_divergences FOR INSERT
TO authenticated
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role) AND detected_by = auth.uid());

CREATE POLICY "Block client update divergences"
ON public.contract_count_divergences FOR UPDATE
TO authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Admins delete divergences"
ON public.contract_count_divergences FOR DELETE
TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role));