-- Sirene por tempo: cada tempo do quadro define que tipo de sirene toca
-- no início e no fim (curta, longa ou nenhuma). Vale tanto para o quadro
-- mestre quanto para o tempo reduzido do dia.
ALTER TABLE public.schedule_periods
  ADD COLUMN IF NOT EXISTS start_siren text NOT NULL DEFAULT 'short',
  ADD COLUMN IF NOT EXISTS end_siren   text NOT NULL DEFAULT 'short';

ALTER TABLE public.schedule_reduced_days
  ADD COLUMN IF NOT EXISTS start_siren text NOT NULL DEFAULT 'short',
  ADD COLUMN IF NOT EXISTS end_siren   text NOT NULL DEFAULT 'short';

ALTER TABLE public.schedule_periods
  DROP CONSTRAINT IF EXISTS schedule_periods_start_siren_check,
  DROP CONSTRAINT IF EXISTS schedule_periods_end_siren_check,
  ADD CONSTRAINT schedule_periods_start_siren_check CHECK (start_siren IN ('none','short','long')),
  ADD CONSTRAINT schedule_periods_end_siren_check   CHECK (end_siren   IN ('none','short','long'));

ALTER TABLE public.schedule_reduced_days
  DROP CONSTRAINT IF EXISTS schedule_reduced_days_start_siren_check,
  DROP CONSTRAINT IF EXISTS schedule_reduced_days_end_siren_check,
  ADD CONSTRAINT schedule_reduced_days_start_siren_check CHECK (start_siren IN ('none','short','long')),
  ADD CONSTRAINT schedule_reduced_days_end_siren_check   CHECK (end_siren   IN ('none','short','long'));