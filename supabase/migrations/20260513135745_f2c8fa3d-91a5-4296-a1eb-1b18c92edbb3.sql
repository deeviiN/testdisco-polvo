
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id text NOT NULL,
  status text NOT NULL,
  pagamento_id uuid,
  request_id text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processed_webhook_events_unique UNIQUE (mp_payment_id, status)
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_payment ON public.processed_webhook_events(mp_payment_id);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view processed webhook events"
ON public.processed_webhook_events
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block client insert processed webhook"
ON public.processed_webhook_events
FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "Block client update processed webhook"
ON public.processed_webhook_events
FOR UPDATE TO authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Block client delete processed webhook"
ON public.processed_webhook_events
FOR DELETE TO authenticated
USING (false);
