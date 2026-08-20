ALTER TABLE public.signed_contracts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signed_contracts;