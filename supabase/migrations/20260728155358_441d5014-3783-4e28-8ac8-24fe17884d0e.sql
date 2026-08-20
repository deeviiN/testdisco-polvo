
CREATE TABLE IF NOT EXISTS public.tolerance_push_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  period_id uuid NOT NULL,
  dispatch_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, period_id, dispatch_date)
);

GRANT ALL ON public.tolerance_push_dispatch_log TO service_role;

ALTER TABLE public.tolerance_push_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages tolerance dispatch log"
ON public.tolerance_push_dispatch_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tolerance_push_log_date
  ON public.tolerance_push_dispatch_log (dispatch_date);
