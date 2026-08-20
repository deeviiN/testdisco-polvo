
-- RPC: notifica todos os gestores da escola sobre um comunicado emitido por outro perfil (coord/supervisor)
CREATE OR REPLACE FUNCTION public.notify_school_gestores_communique(
  _school_id uuid,
  _author_name text,
  _author_role text,
  _booking_id uuid,
  _summary text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_caller_school uuid;
BEGIN
  -- O autor precisa ser membro aprovado da própria escola que está notificando
  SELECT school_id INTO v_caller_school
  FROM public.profiles
  WHERE user_id = auth.uid() AND is_approved = true
  LIMIT 1;

  IF v_caller_school IS NULL OR v_caller_school <> _school_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, data)
  SELECT
    p.user_id,
    '📄 Comunicado emitido na escola',
    COALESCE(_author_name, 'Um responsável') || ' (' || COALESCE(_author_role, '—') || ') gerou um comunicado: ' || COALESCE(_summary, ''),
    jsonb_build_object(
      'type', 'communique_emitted',
      'booking_id', _booking_id,
      'author_role', _author_role,
      'url', '/booking/quadra/lista?comunicado=' || _booking_id::text
    )
  FROM public.profiles p
  WHERE p.school_id = _school_id
    AND p.is_approved = true
    AND p.role IN ('gestor_pedagogico', 'chef_projeto_vida')
    AND p.user_id <> auth.uid();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_school_gestores_communique(uuid, text, text, uuid, text) TO authenticated;
