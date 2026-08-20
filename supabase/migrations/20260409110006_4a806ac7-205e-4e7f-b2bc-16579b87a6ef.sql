
CREATE TABLE public.sector_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  sector_key text NOT NULL,
  custom_label text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(school_id, sector_key)
);

ALTER TABLE public.sector_labels ENABLE ROW LEVEL SECURITY;

-- Users from same school can view
CREATE POLICY "Users can view sector labels from same school"
ON public.sector_labels FOR SELECT
TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Gestors can insert for their school
CREATE POLICY "Gestors can insert sector labels"
ON public.sector_labels FOR INSERT
TO authenticated
WITH CHECK (
  school_id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'gestor_pedagogico'
  )
);

-- Gestors can update for their school
CREATE POLICY "Gestors can update sector labels"
ON public.sector_labels FOR UPDATE
TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'gestor_pedagogico'
  )
)
WITH CHECK (
  school_id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'gestor_pedagogico'
  )
);

-- Gestors can delete for their school
CREATE POLICY "Gestors can delete sector labels"
ON public.sector_labels FOR DELETE
TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'gestor_pedagogico'
  )
);

-- Admins can do everything
CREATE POLICY "Admins can manage all sector labels"
ON public.sector_labels FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_sector_labels_updated_at
BEFORE UPDATE ON public.sector_labels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
