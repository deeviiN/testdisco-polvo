
-- 1) New field on profiles for gestor subscription deadline
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_blocked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_deadline
  ON public.profiles(subscription_deadline)
  WHERE role IN ('gestor_pedagogico','chef_projeto_vida');

-- 2) Sync function: pulls latest validade from assinaturas / schools and applies grace logic
CREATE OR REPLACE FUNCTION public.sync_gestor_subscription_deadlines()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated int := 0;
  _blocked int := 0;
  _grace_days int;
BEGIN
  -- Update each gestor's deadline using assinatura -> school fallback
  WITH src AS (
    SELECT
      p.id AS profile_id,
      p.school_id,
      COALESCE(
        (SELECT a.validade FROM public.assinaturas a
          WHERE a.school_id = p.school_id
          ORDER BY a.validade DESC NULLS LAST LIMIT 1),
        (s.subscription_end_date)::timestamptz,
        p.approved_until
      ) AS new_deadline,
      COALESCE(s.grace_period_days, 15) AS grace
    FROM public.profiles p
    LEFT JOIN public.schools s ON s.id = p.school_id
    WHERE p.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
  UPDATE public.profiles p
  SET subscription_deadline = src.new_deadline,
      updated_at = now()
  FROM src
  WHERE p.id = src.profile_id
    AND (p.subscription_deadline IS DISTINCT FROM src.new_deadline);
  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- Block gestores whose deadline + grace already expired
  UPDATE public.profiles p
  SET is_approved = false,
      subscription_blocked_at = now(),
      updated_at = now()
  FROM public.schools s
  WHERE p.school_id = s.id
    AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    AND p.is_approved = true
    AND p.subscription_deadline IS NOT NULL
    AND (p.subscription_deadline + (COALESCE(s.grace_period_days,15) || ' days')::interval) < now();
  GET DIAGNOSTICS _blocked = ROW_COUNT;

  -- Auto-unblock when payment renewed (deadline back in the future)
  UPDATE public.profiles p
  SET subscription_blocked_at = NULL,
      is_approved = true,
      updated_at = now()
  WHERE p.role IN ('gestor_pedagogico','chef_projeto_vida')
    AND p.subscription_blocked_at IS NOT NULL
    AND p.subscription_deadline IS NOT NULL
    AND p.subscription_deadline > now();

  INSERT INTO public.audit_logs (action, table_name, new_data, performed_by)
  VALUES ('sync_gestor_subscription_deadlines', 'profiles',
          jsonb_build_object('updated', _updated, 'blocked', _blocked, 'ran_at', now()),
          NULL);

  RETURN jsonb_build_object('updated', _updated, 'blocked', _blocked);
END;
$$;

-- Allow protect_approved_until trigger to accept these system-driven changes:
-- The trigger already allows admins; sync function runs as SECURITY DEFINER (postgres),
-- so we add a bypass for when current_user is the function owner.
CREATE OR REPLACE FUNCTION public.protect_approved_until()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  IF NEW.approved_until IS NULL THEN
    RETURN NEW;
  END IF;
  _is_admin := public.has_role(auth.uid(), 'admin');
  IF TG_OP = 'INSERT' THEN
    IF NOT _is_admin AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Only admins can set approved_until';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.approved_until IS DISTINCT FROM OLD.approved_until AND NOT _is_admin AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Only admins can change approved_until';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) RPC: gestor reads own deadline + days remaining
CREATE OR REPLACE FUNCTION public.get_my_subscription_deadline()
RETURNS TABLE(
  subscription_deadline timestamptz,
  days_remaining int,
  grace_period_days int,
  is_blocked boolean,
  in_grace boolean,
  school_name text,
  school_phone text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.subscription_deadline,
    CASE
      WHEN p.subscription_deadline IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(DAY FROM (p.subscription_deadline - now()))::int)
    END,
    COALESCE(s.grace_period_days, 15),
    (p.subscription_blocked_at IS NOT NULL),
    (p.subscription_deadline IS NOT NULL
      AND p.subscription_deadline < now()
      AND (p.subscription_deadline + (COALESCE(s.grace_period_days,15) || ' days')::interval) >= now()),
    s.name,
    NULL::text
  FROM public.profiles p
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

-- 4) Admin RPC: list all schools with gestor contact + deadline
CREATE OR REPLACE FUNCTION public.list_schools_deadlines_admin()
RETURNS TABLE(
  school_id uuid,
  school_name text,
  city text,
  state text,
  network text,
  gestor_name text,
  gestor_phone text,
  gestor_email text,
  subscription_deadline timestamptz,
  days_remaining int,
  status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.city,
    s.state,
    s.network,
    p.full_name,
    p.phone,
    u.email::text,
    p.subscription_deadline,
    CASE
      WHEN p.subscription_deadline IS NULL THEN NULL
      ELSE EXTRACT(DAY FROM (p.subscription_deadline - now()))::int
    END,
    CASE
      WHEN p.subscription_blocked_at IS NOT NULL THEN 'blocked'
      WHEN p.subscription_deadline IS NULL THEN 'no_subscription'
      WHEN p.subscription_deadline < now()
        AND (p.subscription_deadline + (COALESCE(s.grace_period_days,15) || ' days')::interval) >= now() THEN 'grace_period'
      WHEN p.subscription_deadline < now() THEN 'expired'
      WHEN p.subscription_deadline < now() + interval '14 days' THEN 'expiring_soon'
      ELSE 'active'
    END
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT pr.* FROM public.profiles pr
    WHERE pr.school_id = s.id
      AND pr.role IN ('gestor_pedagogico','chef_projeto_vida')
    ORDER BY CASE WHEN pr.role='gestor_pedagogico' THEN 0 ELSE 1 END, pr.created_at ASC
    LIMIT 1
  ) p ON true
  LEFT JOIN auth.users u ON u.id = p.user_id
  ORDER BY
    CASE
      WHEN p.subscription_blocked_at IS NOT NULL THEN 0
      WHEN p.subscription_deadline IS NULL THEN 4
      WHEN p.subscription_deadline < now() THEN 1
      WHEN p.subscription_deadline < now() + interval '14 days' THEN 2
      ELSE 3
    END,
    p.subscription_deadline ASC NULLS LAST;
END;
$$;

-- 5) Enable cron + run sync daily at 03:10
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-gestor-subscription-deadlines');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sync-gestor-subscription-deadlines',
  '10 3 * * *',
  $$ SELECT public.sync_gestor_subscription_deadlines(); $$
);

-- Run once now to backfill
SELECT public.sync_gestor_subscription_deadlines();
