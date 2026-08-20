---
name: Horários travados e sirene sem duplicidade
description: Horários oficiais não podem ser alterados automaticamente pelo app; sirene deve disparar no máximo uma vez por evento/minuto.
type: feature
---
Os horários oficiais (`schedule_periods`) e tempos reduzidos (`schedule_reduced_days`) só podem ser gravados por gestor, coordenação, chefia/supervisão aprovados da escola ou admin.

Telas de assistente/TV nunca devem semear, recalcular ou salvar horários automaticamente por lentidão, retorno do app minimizado, relógio do celular ou fallback de carregamento.

A sirene deve ser deduplicada por escola + data + evento + minuto e não deve disparar tardiamente ao retornar do segundo plano.