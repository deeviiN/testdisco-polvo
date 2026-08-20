
ALTER TABLE public.processed_webhook_events
  ADD CONSTRAINT processed_webhook_events_mp_payment_id_not_empty
  CHECK (length(btrim(mp_payment_id)) > 0) NOT VALID;

ALTER TABLE public.processed_webhook_events
  VALIDATE CONSTRAINT processed_webhook_events_mp_payment_id_not_empty;

ALTER TABLE public.processed_webhook_events
  ADD CONSTRAINT processed_webhook_events_status_not_empty
  CHECK (length(btrim(status)) > 0) NOT VALID;

ALTER TABLE public.processed_webhook_events
  VALIDATE CONSTRAINT processed_webhook_events_status_not_empty;

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
  ON public.processed_webhook_events (processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_pagamento
  ON public.processed_webhook_events (pagamento_id);
