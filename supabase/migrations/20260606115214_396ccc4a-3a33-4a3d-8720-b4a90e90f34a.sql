DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_reduced_days; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.school_siren_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.schedule_reduced_days REPLICA IDENTITY FULL;
ALTER TABLE public.school_siren_settings REPLICA IDENTITY FULL;
ALTER TABLE public.schedule_periods REPLICA IDENTITY FULL;