# Sistema de Remanejamento Rápido

## Regra de negócio (confirmada)
- Ao marcar **AUSENTE** em qualquer tempo da turma, o sistema abre o modal **"Remanejamento Rápido"**.
- Regra padrão: subir o professor do **ÚLTIMO tempo** da mesma turma no dia para cobrir a partir do **2º tempo em diante** (o 1º tempo fica como exceção porque o professor pode só estar atrasado).
- Exceção — quando o assistente marca como **"Faltou o dia todo"** (nova opção dentro do modal): permitido cobrir até o 1º tempo.
- O professor sobe apenas 1 tempo por vez; o último tempo dele fica **vago** → turma sai mais cedo.
- Se não houver ninguém na hierarquia da turma, oferecer: "Deseja buscar na escola toda?" (lista todos os professores com status Aguardando naquele horário).

## Banco de dados (nova migração)

Tabela `room_reassignments`:
- `id, school_id, reassignment_date, class_name, shift`
- `absent_roster_id` (quem ficou ausente), `absent_teacher_name`, `absent_period_number`
- `covering_roster_id` (quem subiu), `covering_teacher_name`, `covering_original_period`
- `vacated_period_number` (tempo que virou vago), `vacated_end_time`
- `reason` ('ausencia' | 'falta_dia_todo' | 'manual')
- `created_by, created_at, cancelled_at, cancelled_by`
- RLS por `school_id` via `private_api.get_user_school_id`; GRANTs para authenticated + service_role.
- Realtime habilitado.

## Fluxo do modal (novo componente `RemanejamentoModal.tsx`)

1. Header: "Professor Ausente no Xº tempo — {turma}"
2. Toggle: **"Só ausente hoje"** (default) × **"Faltou o dia todo"** (libera cobertura do 1º tempo).
3. **Seção Sugestão automática**: mostra card com professor sugerido pela hierarquia (último → penúltimo → ...). Botões: `[Confirmar e Subir Tempo]` `[Ver Próximo da Fila]`.
4. **Seção Manual**: `[Escolher outro professor manualmente]` → lista todos os professores da turma no dia (e opção "buscar na escola toda" se lista vazia) com status Aguardando.
5. Ao confirmar → RPC `reassign_room_period` que:
   - Move o roster do professor sugerido para o tempo vago (`period_id` + `start_time`/`end_time` do tempo do ausente) — como override do dia, não altera o cadastro fixo. Usa nova tabela `teacher_roster_daily_override` (data + roster_id → novo period/tempo/status='vago').
   - Registra em `room_reassignments`.
   - Retorna dados para gerar aviso.

Alternativa mais simples (adotada): não alterar `teacher_roster`; a UI do quadro lê `room_reassignments` do dia e reordena visualmente os cards da turma + marca o último tempo como "VAGO — turma liberada mais cedo".

## Aviso copiável
Card no topo do quadro após remanejamento:
> "AVISO: {turma} sairá às {hh:mm} hoje. Motivo: Antecipação de aula ({professor} cobriu o {Xº} tempo)."
Botão `[Copiar Aviso]` (clipboard).

## Nova aba "Remanejamentos do Dia"
Nova rota `/assistente/remanejamentos` + card no AssistentePanel.
Lista cronológica: "07:20 — 6º ano 1 — João Ausente → Substituído por Jaizinho. Status: Confirmado". Botão desfazer (cancelled_at).

## Ajustes na UI existente
- `AssistenteQuadro.tsx`: interceptar clique em "Ausente" → abrir modal em vez de só gravar `presence.status='ausente'` (grava também, mas segue com o modal).
- Ao ler roster do dia, aplicar overrides de `room_reassignments` para reordenar cards + inserir card VAGO.

## Arquivos
- `supabase/migrations/…_room_reassignments.sql` (nova)
- `src/components/RemanejamentoModal.tsx` (novo)
- `src/pages/AssistenteRemanejamentos.tsx` (novo)
- `src/pages/AssistenteQuadro.tsx` (editar: hook do botão ausente + overlay aviso + aplicar overrides)
- `src/pages/AssistentePanel.tsx` (card novo)
- `src/App.tsx` (rota nova)

## O que não muda
- Sistema atual de Presente/Ausente/Aguardando permanece intacto.
- Nenhuma tela existente é removida.

Confirma que sigo por esse caminho?
