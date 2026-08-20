ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY[
  'teacher'::text,
  'coordinator'::text,
  'admin'::text,
  'coord_pedagogico'::text,
  'supervisor'::text,
  'gestor_pedagogico'::text,
  'secretario_escolar'::text,
  'chef_projeto_vida'::text
]));