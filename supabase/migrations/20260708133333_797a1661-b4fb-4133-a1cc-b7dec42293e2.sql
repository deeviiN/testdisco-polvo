ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY[
  'teacher','coordinator','admin','coord_pedagogico','supervisor','gestor_pedagogico',
  'secretario_escolar','chef_projeto_vida','coord_informatica','coord_biblioteca',
  'coord_lab_ciencias','presidente_apm','usuario_comunidade','assistente'
]));