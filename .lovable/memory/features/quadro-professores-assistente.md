---
name: Quadro de professores do assistente
description: Tabelas teacher_roster + teacher_roster_presence. Assistente cadastra professor/disciplina/turma/horário em /assistente/quadro, marca presença e propaga em realtime para /gestor/ausencias-hoje no painel gestor.
type: feature
---
- `teacher_roster` (cadastro fixo) + `teacher_roster_presence` (marcação diária, unique por roster_id+presence_date) com RLS multi-tenant via `private_api.get_user_school_id`.
- Realtime habilitado nas duas tabelas (`REPLICA IDENTITY FULL`).
- `/assistente/quadro`: assistente cria/edita/exclui linha e marca presente/ausente/atrasado/justificado. Filtra por dia da semana via input `date`.
- `/gestor/ausencias-hoje`: gestor vê em tempo real só ausentes/atrasados de hoje (filtra status no client), com badge "NOVO" pulsando ao receber evento.
- Card no GestorPanel grid: ícone `UserX`, label "Ausências de hoje".
- Card no AssistentePanel: "Meu Quadro de Professores" com ícone `GraduationCap` (accentTileStyle).
