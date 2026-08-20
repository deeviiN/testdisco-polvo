---
name: Registro imutável de alterações de horários
description: Tabela schedule_change_logs grava cada alteração de quadro/sirene/intervalo/tempo reduzido por gestor ou coordenador; nunca pode ser apagado
type: feature
---
Tabela `public.schedule_change_logs` (school_id, actor_user_id, actor_name, actor_role, change_type ['periods'|'reduced_day'|'siren'|'break_after'], shift, reduced_date, summary, details jsonb).

RLS:
- INSERT: usuário aprovado da própria escola registrando a si mesmo (actor_user_id = auth.uid()).
- SELECT: gestor/chef/coord/supervisor da mesma escola + admin.
- UPDATE/DELETE: bloqueados (imutável).

`/gestor/horarios` chama `logChange()` ao salvar quadro padrão / tempo reduzido / sirene+intervalo. Botão "Registro" no header abre `/gestor/registro-horarios` que lista por data decrescente com ícone por tipo, nome+papel do autor e data.
