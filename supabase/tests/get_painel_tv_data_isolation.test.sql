-- E2E: anon access to public.get_painel_tv_data must return ONLY data for
-- the requested school. Cross-tenant leakage must be impossible even though
-- the function is SECURITY DEFINER and callable without a session.
BEGIN;

-- Use two real school ids
\set school_a '\'7438b7a7-bcb4-44a0-b944-96814feb2955\''
\set school_b '\'8f0d09aa-8f8d-4469-9412-b96b81725ace\''

-- Snapshot existing roster ids so we can restrict assertions to fixtures.
CREATE TEMP TABLE _fixture_ids(id uuid) ON COMMIT DROP;

-- Insert a roster row for each school for today's weekday
WITH ins AS (
  INSERT INTO public.teacher_roster
    (school_id, assistant_user_id, teacher_name, discipline, class_name,
     weekday, start_time, end_time, shift)
  VALUES
    (:school_a, '00000000-0000-0000-0000-000000000001',
     'PROF SCHOOL A', 'MAT', '9A',
     EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Manaus'))::smallint,
     '07:00','07:50','manha'),
    (:school_b, '00000000-0000-0000-0000-000000000002',
     'PROF SCHOOL B', 'POR', '9B',
     EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Manaus'))::smallint,
     '07:00','07:50','manha')
  RETURNING id
)
INSERT INTO _fixture_ids SELECT id FROM ins;

-- Verifica que a função pode ser executada por anon (Data API sem JWT)
DO $$
BEGIN
  IF NOT has_function_privilege(
    'anon', 'public.get_painel_tv_data(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED — anon não pode executar get_painel_tv_data';
  END IF;
END $$;

-- Verifica que NENHUMA policy de teacher_roster permite leitura por anon
DO $$
DECLARE
  anon_policies int;
BEGIN
  SELECT count(*) INTO anon_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'teacher_roster'
    AND (cmd = 'SELECT' OR cmd = 'ALL')
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF anon_policies > 0 THEN
    RAISE EXCEPTION 'TEST FAILED — existe policy permitindo anon ler teacher_roster';
  END IF;
END $$;

DO $$
DECLARE
  res_a jsonb;
  res_b jsonb;
  names_a text;
  names_b text;
BEGIN
  res_a := public.get_painel_tv_data('7438b7a7-bcb4-44a0-b944-96814feb2955'::uuid);
  res_b := public.get_painel_tv_data('8f0d09aa-8f8d-4469-9412-b96b81725ace'::uuid);

  -- Collect teacher names returned for each school
  SELECT string_agg(value->>'teacher_name', '|')
    INTO names_a
  FROM jsonb_array_elements(res_a->'roster');

  SELECT string_agg(value->>'teacher_name', '|')
    INTO names_b
  FROM jsonb_array_elements(res_b->'roster');

  RAISE NOTICE 'School A roster names: %', names_a;
  RAISE NOTICE 'School B roster names: %', names_b;

  -- A must contain its own teacher and NEVER contain B's teacher
  IF names_a IS NULL OR position('PROF SCHOOL A' IN names_a) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED — School A roster missing own teacher';
  END IF;
  IF names_a LIKE '%PROF SCHOOL B%' THEN
    RAISE EXCEPTION 'TEST FAILED — School A roster leaked School B data';
  END IF;

  -- B must contain its own teacher and NEVER contain A's teacher
  IF names_b IS NULL OR position('PROF SCHOOL B' IN names_b) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED — School B roster missing own teacher';
  END IF;
  IF names_b LIKE '%PROF SCHOOL A%' THEN
    RAISE EXCEPTION 'TEST FAILED — School B roster leaked School A data';
  END IF;

  -- school_id em todas as linhas deve bater com o solicitado
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(res_a->'roster') v
    WHERE (v->>'school_id')::uuid <> '7438b7a7-bcb4-44a0-b944-96814feb2955'::uuid
  ) THEN
    RAISE EXCEPTION 'TEST FAILED — School A response contains foreign school_id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(res_b->'roster') v
    WHERE (v->>'school_id')::uuid <> '8f0d09aa-8f8d-4469-9412-b96b81725ace'::uuid
  ) THEN
    RAISE EXCEPTION 'TEST FAILED — School B response contains foreign school_id';
  END IF;

  RAISE NOTICE '✅ Isolation E2E passed: anon only sees requested school';
END $$;

ROLLBACK;
