---
name: Importação em massa do quadro de professores (IA do app)
description: Botão em /gestor/horarios (passo Ajustar tempos) que lê PDF/texto colado e cria todas as aulas em teacher_roster de uma vez
type: feature
---
Botão âmbar "Preencher horários dos professores de uma vez" no passo 2 de `/gestor/horarios` abre `ImportTeacherRosterModal`.

Fluxo: escolhe assistente responsável → anexa PDF (texto extraído no cliente por `extractPdfText`, arquivo não é guardado) ou cola o quadro → "Ler com IA" chama a edge function `parse-teacher-roster` (Lovable AI, google/gemini-3-flash-preview, JSON) → prévia editável (remover linhas) → salva em `teacher_roster` (opcional substituir o quadro do turno).

Fallback convencional sem IA: `parseRosterTextLocally` (src/lib/parseRosterText.ts) lê linhas `DIA | TEMPO | TURMA | PROFESSOR | DISCIPLINA | SALA`; é usado automaticamente se a IA falhar e pelo botão "Leitura simples".

`parse-teacher-roster` exige JWT e papel gestor/chefia/coordenação/supervisão/secretaria aprovado, ou admin.
