-- Duplica os tempos de domingo (weekday=0) para sábado (weekday=6)
-- em todas as escolas, evitando duplicar quando já existir entrada
-- para o mesmo (school_id, teacher_name, shift, start_time, end_time) no sábado.
INSERT INTO public.teacher_roster (
  school_id, teacher_name, discipline, class_name, weekday,
  start_time, end_time, shift, assistant_user_id
)
SELECT
  s.school_id, s.teacher_name, s.discipline, s.class_name, 6 AS weekday,
  s.start_time, s.end_time, s.shift, s.assistant_user_id
FROM public.teacher_roster s
WHERE s.weekday = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_roster x
    WHERE x.school_id = s.school_id
      AND x.weekday = 6
      AND x.teacher_name = s.teacher_name
      AND x.shift IS NOT DISTINCT FROM s.shift
      AND x.start_time = s.start_time
      AND x.end_time = s.end_time
  );