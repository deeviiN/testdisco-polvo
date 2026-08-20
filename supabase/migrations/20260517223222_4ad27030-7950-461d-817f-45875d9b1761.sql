ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS payment_plan text;

ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_payment_plan_check;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_payment_plan_check
  CHECK (payment_plan IS NULL OR payment_plan IN ('mensal','anual_12','anual_24','anual_36','anual_48'));