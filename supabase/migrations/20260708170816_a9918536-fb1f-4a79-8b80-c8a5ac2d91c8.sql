-- Restringe profiles.intended_role aos 11 setores padronizados do cadastro.
-- NOT VALID evita bloquear linhas históricas com valores diferentes; o CHECK vale para novos INSERT/UPDATE.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_intended_role_allowed;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_intended_role_allowed
  CHECK (
    intended_role IS NULL
    OR intended_role IN (
      'teacher',
      'coord_pedagogico',
      'supervisor',
      'coord_informatica',
      'chef_projeto_vida',
      'coord_lab_ciencias',
      'coord_biblioteca',
      'secretario_escolar',
      'gestor_pedagogico',
      'presidente_apm',
      'usuario_comunidade'
    )
  ) NOT VALID;