
CREATE TABLE IF NOT EXISTS public.shift_push_dispatch_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  period_id UUID NOT NULL,
  dispatch_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, period_id, dispatch_date)
);

GRANT ALL ON public.shift_push_dispatch_log TO service_role;

ALTER TABLE public.shift_push_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only"
ON public.shift_push_dispatch_log FOR ALL
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS shift_push_dispatch_log_date_idx
  ON public.shift_push_dispatch_log (dispatch_date);
