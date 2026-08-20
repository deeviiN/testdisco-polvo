-- Validates the classification logic of public.get_contract_pending_counts
-- Runs in a transaction against a temp table mirroring signed_contracts.
BEGIN;

CREATE TEMP TABLE _sc (
  school_id   uuid,
  signer_role text,
  file_name   text,
  file_path   text,
  uploaded_at timestamptz
) ON COMMIT DROP;

-- Fixtures (one row per scenario unless multiple uploads needed)
-- A: only request marker -> awaiting_admin
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000a','gestor','__request__','__request__/a.pdf', now());
-- B: admin only -> awaiting_gestor
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000b','admin','admin.pdf','b/admin.pdf', now());
-- C: gestor only -> gestor_signed
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000c','gestor','g.pdf','c/g.pdf', now());
-- D: gestor then admin counter-sign (a>g) -> completed
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000d','gestor','g.pdf','d/g.pdf', now() - interval '2 hour');
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000d','admin','a.pdf','d/a.pdf', now() - interval '1 hour');
-- E: admin first, gestor re-uploaded later (g>a) -> gestor_signed (still pending admin counter)
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000e','admin','a.pdf','e/a.pdf', now() - interval '3 hour');
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000e','gestor','g.pdf','e/g.pdf', now() - interval '1 hour');
-- F: gestor with two uploads + admin in between -> last gestor wins -> gestor_signed
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000f','gestor','g1.pdf','f/g1.pdf', now() - interval '5 hour');
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000f','admin', 'a.pdf', 'f/a.pdf',  now() - interval '4 hour');
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-00000000000f','gestor','g2.pdf','f/g2.pdf', now() - interval '1 hour');
-- G: request + admin upload (request is noise) -> awaiting_gestor
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-0000000000aa','gestor','__request__','__request__/g.pdf', now() - interval '5 hour');
INSERT INTO _sc VALUES ('00000000-0000-0000-0000-0000000000aa','admin','a.pdf','g/a.pdf', now() - interval '1 hour');

DO $$
DECLARE
  r record;
  expected jsonb := jsonb_build_object(
    'awaiting_admin', 1,  -- A
    'awaiting_gestor', 2, -- B, G
    'gestor_signed', 3,   -- C, E, F
    'completed', 1,       -- D
    'total', 7
  );
  got jsonb;
BEGIN
  WITH per_school AS (
    SELECT
      school_id,
      MAX(CASE WHEN signer_role='gestor'
               AND file_name <> '__request__'
               AND (file_path IS NULL OR file_path NOT LIKE '__request__/%')
               THEN uploaded_at END) AS g_at,
      MAX(CASE WHEN signer_role='admin'
               AND file_name <> '__request__'
               AND (file_path IS NULL OR file_path NOT LIKE '__request__/%')
               THEN uploaded_at END) AS a_at,
      BOOL_OR(file_name='__request__' OR file_path LIKE '__request__/%') AS has_request
    FROM _sc GROUP BY school_id
  ),
  classified AS (
    SELECT CASE
      WHEN g_at IS NOT NULL AND a_at IS NOT NULL AND a_at >= g_at THEN 'completed'
      WHEN g_at IS NOT NULL THEN 'gestor_signed'
      WHEN a_at IS NOT NULL THEN 'awaiting_gestor'
      WHEN has_request THEN 'awaiting_admin'
      ELSE 'other'
    END AS stage
    FROM per_school
  )
  SELECT jsonb_build_object(
    'awaiting_admin', COUNT(*) FILTER (WHERE stage='awaiting_admin'),
    'awaiting_gestor', COUNT(*) FILTER (WHERE stage='awaiting_gestor'),
    'gestor_signed', COUNT(*) FILTER (WHERE stage='gestor_signed'),
    'completed', COUNT(*) FILTER (WHERE stage='completed'),
    'total', COUNT(*)
  ) INTO got FROM classified;

  RAISE NOTICE 'Expected: %', expected;
  RAISE NOTICE 'Got:      %', got;

  IF got <> expected THEN
    RAISE EXCEPTION 'TEST FAILED — mismatch';
  END IF;
  RAISE NOTICE '✅ All scenarios passed';
END $$;

ROLLBACK;
