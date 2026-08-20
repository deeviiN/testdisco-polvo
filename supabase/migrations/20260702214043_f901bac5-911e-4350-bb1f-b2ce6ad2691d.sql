
CREATE OR REPLACE FUNCTION public.enforce_max_two_assistants_per_class()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.assistant_classes
  WHERE school_id = NEW.school_id
    AND class_label = NEW.class_label
    AND assistant_user_id <> NEW.assistant_user_id;
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'Limite de 2 assistentes por turma atingido para %', NEW.class_label
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_two_assistants_per_class ON public.assistant_classes;
CREATE TRIGGER trg_max_two_assistants_per_class
BEFORE INSERT OR UPDATE ON public.assistant_classes
FOR EACH ROW EXECUTE FUNCTION public.enforce_max_two_assistants_per_class();
