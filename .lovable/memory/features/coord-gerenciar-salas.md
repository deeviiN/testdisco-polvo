---
name: Transferência de salas entre assistentes
description: Transferência de turmas é acordo entre os próprios assistentes (não do coordenador). Assistente acessa /assistente/transferir-salas para passar suas próprias salas a outro assistente. Coord/gestor ainda podem via /gestor/gerenciar-salas se necessário.
type: feature
---
- RPC `coord_reassign_assistant_rosters` aceita roles assistente/assistente_alunos/secretario_escolar; quando caller é assistente, `_from_user` é forçado a ser `auth.uid()` e a UPDATE só atinge `assistant_user_id = auth.uid()`.
- Coord/gestor/chef continuam podendo redistribuir entre quaisquer assistentes.
- Página `CoordGerenciarSalas.tsx` é usada em duas rotas: `/gestor/gerenciar-salas` (coord/gestor) e `/assistente/transferir-salas` (assistente). Quando role é assistente, origem é travada no próprio usuário (campo fica readonly) e o título muda para "Transferir minhas salas".
- Botão removido do header do SectorSelect (coord/gestor). Botão adicionado no `AssistentePanel` ("Transferir minhas salas").
- `teacher_roster_presence` continua restrita: assistente só altera presença das próprias salas (`teacher_roster.assistant_user_id = auth.uid()`).
- Política unificada `Gestor or coord manages assistant_classes` permanece.
