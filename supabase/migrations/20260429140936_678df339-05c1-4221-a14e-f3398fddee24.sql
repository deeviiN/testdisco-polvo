ALTER TABLE public.pagamentos
ADD CONSTRAINT pagamentos_school_id_fkey
FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;