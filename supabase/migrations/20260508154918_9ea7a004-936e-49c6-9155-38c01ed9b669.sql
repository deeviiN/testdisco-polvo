CREATE TABLE IF NOT EXISTS public.subscription_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  gestor_user_id uuid,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  event_type text NOT NULL CHECK (event_type IN ('warning_7d','blocked','renewed')),
  recipient text NOT NULL,
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','dismissed')),
  error_message text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  acted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, channel, event_type, scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_sub_notif_status ON public.subscription_notifications(status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_notif_school ON public.subscription_notifications(school_id);

ALTER TABLE public.subscription_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin views subscription notifications"
  ON public.subscription_notifications FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin updates subscription notifications"
  ON public.subscription_notifications FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block client insert subscription notifications"
  ON public.subscription_notifications FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block client delete subscription notifications"
  ON public.subscription_notifications FOR DELETE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.enqueue_subscription_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  today timestamptz := date_trunc('day', now());
  msg text;
  subj text;
BEGIN
  FOR rec IN
    SELECT
      s.id AS school_id, s.name AS school_name,
      p.user_id AS gestor_user_id, p.full_name AS gestor_name,
      p.phone AS gestor_phone, au.email AS gestor_email,
      p.subscription_deadline, p.subscription_blocked_at,
      EXTRACT(DAY FROM (p.subscription_deadline - now()))::int AS days_remaining
    FROM public.profiles p
    JOIN public.schools s ON s.id = p.school_id
    LEFT JOIN auth.users au ON au.id = p.user_id
    WHERE p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
      AND p.subscription_deadline IS NOT NULL
  LOOP
    IF rec.days_remaining BETWEEN 0 AND 7 AND rec.subscription_blocked_at IS NULL THEN
      subj := 'Sua assinatura vence em ' || rec.days_remaining || ' dias';
      msg := 'Olá ' || COALESCE(rec.gestor_name,'Gestor') || ', a assinatura da escola '
        || rec.school_name || ' vence em ' || rec.days_remaining
        || ' dias. Renove para evitar bloqueio.';
      IF rec.gestor_email IS NOT NULL THEN
        INSERT INTO public.subscription_notifications
          (school_id, gestor_user_id, channel, event_type, recipient, subject, message, scheduled_at)
        VALUES (rec.school_id, rec.gestor_user_id, 'email', 'warning_7d', rec.gestor_email, subj, msg, today)
        ON CONFLICT DO NOTHING;
      END IF;
      IF rec.gestor_phone IS NOT NULL THEN
        INSERT INTO public.subscription_notifications
          (school_id, gestor_user_id, channel, event_type, recipient, message, scheduled_at)
        VALUES (rec.school_id, rec.gestor_user_id, 'whatsapp', 'warning_7d', rec.gestor_phone, msg, today)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    IF rec.subscription_blocked_at IS NOT NULL
       AND rec.subscription_blocked_at::date = today::date THEN
      subj := 'Assinatura bloqueada';
      msg := 'A assinatura da escola ' || rec.school_name
        || ' foi bloqueada após o período de carência. Regularize o pagamento para reativar o acesso.';
      IF rec.gestor_email IS NOT NULL THEN
        INSERT INTO public.subscription_notifications
          (school_id, gestor_user_id, channel, event_type, recipient, subject, message, scheduled_at)
        VALUES (rec.school_id, rec.gestor_user_id, 'email', 'blocked', rec.gestor_email, subj, msg, today)
        ON CONFLICT DO NOTHING;
      END IF;
      IF rec.gestor_phone IS NOT NULL THEN
        INSERT INTO public.subscription_notifications
          (school_id, gestor_user_id, channel, event_type, recipient, message, scheduled_at)
        VALUES (rec.school_id, rec.gestor_user_id, 'whatsapp', 'blocked', rec.gestor_phone, msg, today)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT
      s.id AS school_id, s.name AS school_name,
      p.user_id AS gestor_user_id, p.full_name AS gestor_name,
      p.phone AS gestor_phone, au.email AS gestor_email,
      p.subscription_deadline
    FROM public.profiles p
    JOIN public.schools s ON s.id = p.school_id
    LEFT JOIN auth.users au ON au.id = p.user_id
    WHERE p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
      AND p.subscription_blocked_at IS NULL
      AND p.subscription_deadline > now() + interval '20 days'
      AND p.updated_at > now() - interval '24 hours'
  LOOP
    subj := 'Assinatura renovada';
    msg := 'A assinatura da escola ' || rec.school_name
      || ' foi renovada até ' || to_char(rec.subscription_deadline,'DD/MM/YYYY') || '.';
    IF rec.gestor_email IS NOT NULL THEN
      INSERT INTO public.subscription_notifications
        (school_id, gestor_user_id, channel, event_type, recipient, subject, message, scheduled_at)
      VALUES (rec.school_id, rec.gestor_user_id, 'email', 'renewed', rec.gestor_email, subj, msg, today)
      ON CONFLICT DO NOTHING;
    END IF;
    IF rec.gestor_phone IS NOT NULL THEN
      INSERT INTO public.subscription_notifications
        (school_id, gestor_user_id, channel, event_type, recipient, message, scheduled_at)
      VALUES (rec.school_id, rec.gestor_user_id, 'whatsapp', 'renewed', rec.gestor_phone, msg, today)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_subscription_notifications() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_subscription_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.list_subscription_notifications_admin()
RETURNS TABLE (
  id uuid, school_id uuid, school_name text,
  channel text, event_type text, recipient text,
  subject text, message text, status text,
  error_message text, scheduled_at timestamptz,
  sent_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.school_id, s.name AS school_name,
         n.channel, n.event_type, n.recipient,
         n.subject, n.message, n.status,
         n.error_message, n.scheduled_at, n.sent_at, n.created_at
  FROM public.subscription_notifications n
  LEFT JOIN public.schools s ON s.id = n.school_id
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY n.created_at DESC
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.list_subscription_notifications_admin() TO authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='enqueue_subscription_notifications_daily') THEN
      PERFORM cron.unschedule('enqueue_subscription_notifications_daily');
    END IF;
    PERFORM cron.schedule(
      'enqueue_subscription_notifications_daily',
      '20 3 * * *',
      $job$SELECT public.enqueue_subscription_notifications();$job$
    );
  END IF;
END
$cron$;