ALTER TABLE public.schools 
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN subscription_end_date date DEFAULT NULL,
  ADD COLUMN grace_period_days integer NOT NULL DEFAULT 15;

CREATE OR REPLACE FUNCTION public.get_school_access_level(_school_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE
      WHEN s.subscription_status = 'active' THEN 'full'
      WHEN s.subscription_status = 'grace_period' THEN 
        CASE 
          WHEN s.subscription_end_date IS NOT NULL 
               AND current_date <= (s.subscription_end_date + s.grace_period_days) 
          THEN 'limited'
          ELSE 'blocked'
        END
      WHEN s.subscription_status = 'blocked' THEN 'blocked'
      ELSE 'full'
    END
  FROM public.schools s
  WHERE s.id = _school_id
$$;