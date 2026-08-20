-- Trigger: notifica o solicitante quando o gestor decide um evento externo
CREATE OR REPLACE FUNCTION public.notify_external_event_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_desc TEXT;
  v_date_str TEXT;
BEGIN
  -- Só dispara para eventos externos quando o gestor_status muda para approved/denied
  IF NEW.event_type <> 'evento_externo' THEN
    RETURN NEW;
  END IF;

  IF NEW.gestor_status NOT IN ('approved', 'denied') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.gestor_status IS NOT DISTINCT FROM NEW.gestor_status THEN
    RETURN NEW;
  END IF;

  v_date_str := to_char(NEW.booking_date, 'DD/MM/YYYY')
                || ' ' || to_char(NEW.start_time, 'HH24:MI')
                || '-' || to_char(NEW.end_time, 'HH24:MI');

  IF NEW.gestor_status = 'approved' THEN
    v_title := 'Evento externo aprovado';
    v_desc := 'Sua solicitação para ' || COALESCE(NEW.visitor_name, 'evento externo')
              || ' em ' || v_date_str || ' foi aprovada pelo gestor.';
  ELSE
    v_title := 'Evento externo recusado';
    v_desc := 'Sua solicitação para ' || COALESCE(NEW.visitor_name, 'evento externo')
              || ' em ' || v_date_str || ' foi recusada.'
              || CASE WHEN COALESCE(NEW.gestor_response, '') <> ''
                      THEN ' Motivo: ' || NEW.gestor_response
                      ELSE '' END;
  END IF;

  INSERT INTO public.inbox_requests (
    school_id,
    audience,
    type,
    status,
    title,
    description,
    target_user_id,
    requester_user_id,
    payload
  ) VALUES (
    NEW.school_id,
    'user',
    'external_event_decision',
    'resolved',
    v_title,
    v_desc,
    NEW.user_id,
    NEW.gestor_responded_by,
    jsonb_build_object(
      'booking_id', NEW.id,
      'gestor_status', NEW.gestor_status,
      'booking_date', NEW.booking_date,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'visitor_name', NEW.visitor_name,
      'reason', NEW.gestor_response
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_external_event_decision ON public.bookings;
CREATE TRIGGER trg_notify_external_event_decision
AFTER UPDATE OF gestor_status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_external_event_decision();