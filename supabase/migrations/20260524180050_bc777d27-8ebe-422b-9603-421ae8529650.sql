
-- Dedupe de lembretes enviados (evita repetir push e in-app no mesmo intervalo)
CREATE TABLE IF NOT EXISTS public.booking_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  minutes_before integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('push','inapp')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, user_id, minutes_before, channel)
);

CREATE INDEX IF NOT EXISTS idx_brs_booking ON public.booking_reminders_sent(booking_id);
CREATE INDEX IF NOT EXISTS idx_brs_user ON public.booking_reminders_sent(user_id);

ALTER TABLE public.booking_reminders_sent ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver / gravar dedupe das próprias reservas
CREATE POLICY "Users see own reminder marks"
  ON public.booking_reminders_sent FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own reminder marks"
  ON public.booking_reminders_sent FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Função: retorna agendamentos próximos do dono que devem disparar lembrete agora
-- minutes_before vem em {60,45,30,15,10,5}; janela de tolerância ±90s
CREATE OR REPLACE FUNCTION public.get_pending_booking_reminders()
RETURNS TABLE (
  booking_id uuid,
  user_id uuid,
  school_id uuid,
  sector text,
  topic text,
  booking_date date,
  start_time time,
  minutes_before integer,
  minutes_left integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH thresholds(m) AS (VALUES (60),(45),(30),(15),(10),(5))
  SELECT b.id, b.user_id, b.school_id, b.sector, b.topic,
         b.booking_date, b.start_time, t.m,
         GREATEST(0, EXTRACT(EPOCH FROM ((b.booking_date + b.start_time) - now()))/60)::int
  FROM public.bookings b
  CROSS JOIN thresholds t
  WHERE b.status IN ('confirmed','approved','active')
    AND (b.gestor_status IS NULL OR b.gestor_status IN ('approved','auto_approved'))
    AND (b.booking_date + b.start_time) > now()
    AND (b.booking_date + b.start_time) <= now() + interval '65 minutes'
    AND abs(EXTRACT(EPOCH FROM ((b.booking_date + b.start_time) - now()))/60 - t.m) <= 1.5
$$;
