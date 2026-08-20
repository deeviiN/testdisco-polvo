
-- Catálogo central de logos oficiais
CREATE TABLE public.gov_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('estadual','federal','municipal')),
  state text,         -- UF para estadual/municipal
  city text,          -- para municipal
  label text NOT NULL,
  logo_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX gov_logos_estadual_uniq ON public.gov_logos(state) WHERE scope='estadual';
CREATE UNIQUE INDEX gov_logos_federal_uniq ON public.gov_logos((1)) WHERE scope='federal';
CREATE UNIQUE INDEX gov_logos_municipal_uniq ON public.gov_logos(state, city) WHERE scope='municipal';

ALTER TABLE public.gov_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read gov_logos"
  ON public.gov_logos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages gov_logos"
  ON public.gov_logos FOR ALL TO authenticated
  USING (private_api.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER gov_logos_updated_at
  BEFORE UPDATE ON public.gov_logos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Override por escola
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS gov_logo_url text;

-- Bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('gov-logos', 'gov-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gov-logos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gov-logos');

CREATE POLICY "gov-logos admin write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gov-logos' AND private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "gov-logos admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'gov-logos' AND private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "gov-logos admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gov-logos' AND private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "gov-logos gestor upload own school"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gov-logos'
    AND (storage.foldername(name))[1] = 'schools'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  );
