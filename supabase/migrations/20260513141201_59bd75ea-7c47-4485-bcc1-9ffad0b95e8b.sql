-- Lock down process_mp_webhook_event to service_role only
REVOKE ALL ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_mp_webhook_event(text, text, jsonb, text) TO service_role;