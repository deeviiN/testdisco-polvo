ALTER TABLE public.panel_settings
  ADD COLUMN IF NOT EXISTS break_after_periods jsonb NOT NULL DEFAULT '{}'::jsonb;