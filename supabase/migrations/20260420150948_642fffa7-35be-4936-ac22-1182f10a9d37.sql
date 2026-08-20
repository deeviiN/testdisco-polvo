
CREATE TABLE public.support_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  whatsapp_number text NOT NULL DEFAULT '5595991180294',
  display_label text NOT NULL DEFAULT '(95) 99118-0294',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support settings are publicly readable"
  ON public.support_settings FOR SELECT
  USING (true);

CREATE POLICY "Only admins can update support settings"
  ON public.support_settings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block insert on support_settings"
  ON public.support_settings FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block delete on support_settings"
  ON public.support_settings FOR DELETE
  USING (false);

INSERT INTO public.support_settings (id) VALUES (true);

CREATE TRIGGER update_support_settings_updated_at
  BEFORE UPDATE ON public.support_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
