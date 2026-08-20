---
name: Tolerância da chamada por turno
description: Tabela roster_call_settings (school_id PK + tolerance_manha/tarde/noite, default 15) configurada pela gestora em /gestor/tolerancia-chamada. Define quantos minutos após o início do tempo o assistente pode marcar presença/ausência/atraso em /assistente/quadro. Atalho "Tolerância" no header de /gestor/horarios.
type: feature
---
- Tabela `roster_call_settings` com PK `school_id`, 3 colunas inteiras (0–120, default 15).
- RLS: leitura por toda a escola aprovada; escrita só gestor/chef/admin.
- Página `/gestor/tolerancia-chamada` com 3 cards (Manhã/Tarde/Noite) e stepper ±1 min.
- Acesso via botão "Tolerância" (ícone Sliders) no header de `/gestor/horarios`.
- Consumir em `/assistente/quadro` e `/painel-tv`: status fica neutro até `now() >= período.start_time + tolerância[shift]`.
