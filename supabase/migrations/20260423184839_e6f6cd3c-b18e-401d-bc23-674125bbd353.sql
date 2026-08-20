
-- Tabela de histórico de decisões do gestor sobre reservas (eventos externos)
CREATE TABLE public.booking_gestor_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL,
  school_id uuid NOT NULL,
  gestor_status text NOT NULL,
  gestor_response text,
  decided_by uuid,
  decided_by_name text,
  decided_by_role text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_gestor_history_booking ON public.booking_gestor_history(booking_id, created_at DESC);
CREATE INDEX idx_booking_gestor_history_school ON public.booking_gestor_history(school_id);

ALTER TABLE public.booking_gestor_history ENABLE ROW LEVEL SECURITY;

-- Leitura: mesma escola ou admin
CREATE POLICY "View gestor history from same school"
ON public.booking_gestor_history
FOR SELECT
TO authenticated
USING (school_id = get_user_school_id(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- Bloquear writes diretas do cliente (somente trigger SECURITY DEFINER grava)
CREATE POLICY "Block client insert on gestor history"
ON public.booking_gestor_history
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block client update on gestor history"
ON public.booking_gestor_history
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client delete on gestor history"
ON public.booking_gestor_history
FOR DELETE
TO authenticated
USING (false);

-- Trigger: ao mudar gestor_status ou gestor_response, registra uma versão
CREATE OR REPLACE FUNCTION public.log_booking_gestor_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _role text;
BEGIN
  IF NEW.event_type <> 'evento_externo' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.gestor_status IS NOT DISTINCT FROM OLD.gestor_status
     AND NEW.gestor_response IS NOT DISTINCT FROM OLD.gestor_response THEN
    RETURN NEW;
  END IF;

  -- Não registra o estado inicial 'pending' criado junto com a reserva
  IF TG_OP = 'INSERT' AND NEW.gestor_status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT full_name, role INTO _name, _role
  FROM public.profiles
  WHERE user_id = COALESCE(NEW.gestor_responded_by, auth.uid())
  LIMIT 1;

  INSERT INTO public.booking_gestor_history
    (booking_id, school_id, gestor_status, gestor_response, decided_by, decided_by_name, decided_by_role)
  VALUES
    (NEW.id, NEW.school_id, NEW.gestor_status, NEW.gestor_response,
     COALESCE(NEW.gestor_responded_by, auth.uid()), _name, _role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_booking_gestor_change
AFTER INSERT OR UPDATE OF gestor_status, gestor_response
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.log_booking_gestor_change();
