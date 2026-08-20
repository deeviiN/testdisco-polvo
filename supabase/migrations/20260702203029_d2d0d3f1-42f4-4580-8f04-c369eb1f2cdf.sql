DROP POLICY IF EXISTS "Assistant marks presence on own roster" ON public.teacher_roster_presence;
DROP POLICY IF EXISTS "Manager marks presence" ON public.teacher_roster_presence;
DROP POLICY IF EXISTS "Assistant marks assigned roster presence" ON public.teacher_roster_presence;

CREATE POLICY "Assistant marks assigned roster presence"
ON public.teacher_roster_presence
FOR ALL
TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['assistente_alunos','assistente','secretario_escolar'])
  )
  AND EXISTS (
    SELECT 1
    FROM public.teacher_roster r
    WHERE r.id = teacher_roster_presence.roster_id
      AND r.school_id = teacher_roster_presence.school_id
      AND (
        r.assistant_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.assistant_classes ac
          WHERE ac.school_id = r.school_id
            AND ac.assistant_user_id = auth.uid()
            AND lower(regexp_replace(trim(ac.class_label), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(trim(coalesce(r.class_name, '')), '[^a-z0-9]+', '', 'g'))
            AND (
              ac.shift IS NULL
              OR trim(ac.shift) = ''
              OR CASE
                WHEN lower(trim(ac.shift)) IN ('matutino','manha','manhã') THEN 'manha'
                WHEN lower(trim(ac.shift)) IN ('vespertino','tarde') THEN 'tarde'
                WHEN lower(trim(ac.shift)) IN ('noturno','noite') THEN 'noite'
                ELSE lower(trim(ac.shift))
              END = CASE
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('matutino','manha','manhã') THEN 'manha'
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('vespertino','tarde') THEN 'tarde'
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('noturno','noite') THEN 'noite'
                ELSE lower(trim(coalesce(r.shift, '')))
              END
            )
        )
      )
  )
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
  AND marked_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['assistente_alunos','assistente','secretario_escolar'])
  )
  AND EXISTS (
    SELECT 1
    FROM public.teacher_roster r
    WHERE r.id = teacher_roster_presence.roster_id
      AND r.school_id = teacher_roster_presence.school_id
      AND (
        r.assistant_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.assistant_classes ac
          WHERE ac.school_id = r.school_id
            AND ac.assistant_user_id = auth.uid()
            AND lower(regexp_replace(trim(ac.class_label), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(trim(coalesce(r.class_name, '')), '[^a-z0-9]+', '', 'g'))
            AND (
              ac.shift IS NULL
              OR trim(ac.shift) = ''
              OR CASE
                WHEN lower(trim(ac.shift)) IN ('matutino','manha','manhã') THEN 'manha'
                WHEN lower(trim(ac.shift)) IN ('vespertino','tarde') THEN 'tarde'
                WHEN lower(trim(ac.shift)) IN ('noturno','noite') THEN 'noite'
                ELSE lower(trim(ac.shift))
              END = CASE
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('matutino','manha','manhã') THEN 'manha'
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('vespertino','tarde') THEN 'tarde'
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('noturno','noite') THEN 'noite'
                ELSE lower(trim(coalesce(r.shift, '')))
              END
            )
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.enforce_roster_presence_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NOT NULL AND private_api.has_role(v_uid, 'admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = v_uid AND is_approved = true
  LIMIT 1;

  IF v_role NOT IN ('assistente','assistente_alunos','secretario_escolar') THEN
    RAISE EXCEPTION 'Somente o assistente responsável pode alterar esta marcação.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_roster r
    WHERE r.id = COALESCE(NEW.roster_id, OLD.roster_id)
      AND r.school_id = COALESCE(NEW.school_id, OLD.school_id)
      AND (
        r.assistant_user_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.assistant_classes ac
          WHERE ac.school_id = r.school_id
            AND ac.assistant_user_id = v_uid
            AND lower(regexp_replace(trim(ac.class_label), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(trim(coalesce(r.class_name, '')), '[^a-z0-9]+', '', 'g'))
            AND (
              ac.shift IS NULL
              OR trim(ac.shift) = ''
              OR CASE
                WHEN lower(trim(ac.shift)) IN ('matutino','manha','manhã') THEN 'manha'
                WHEN lower(trim(ac.shift)) IN ('vespertino','tarde') THEN 'tarde'
                WHEN lower(trim(ac.shift)) IN ('noturno','noite') THEN 'noite'
                ELSE lower(trim(ac.shift))
              END = CASE
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('matutino','manha','manhã') THEN 'manha'
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('vespertino','tarde') THEN 'tarde'
                WHEN lower(trim(coalesce(r.shift, ''))) IN ('noturno','noite') THEN 'noite'
                ELSE lower(trim(coalesce(r.shift, '')))
              END
            )
        )
      )
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Você não é o assistente responsável por esta turma.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;