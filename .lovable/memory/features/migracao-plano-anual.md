---
name: Migração de plano (mensal -> anual à vista)
description: Card no /subscription que oferece quitar o ciclo anual descontando os meses já pagos
type: feature
---

## Regra
- Ciclo de 12 meses. Valor mensal de referência: **R$ 169,90**.
- Conta `pagamentos.status='approved' AND plano='mensal'` desde o 1º pagamento aprovado dos últimos 12 meses (ou `now()-12m`).
- `valor_total = (12 - meses_pagos) × R$ 169,90`. Ex.: pagou 2 meses → cobra 10 meses integral = R$ 1.699,00.

## Backend
- RPC `public.get_plan_migration_quote(_school_id uuid)` SECURITY DEFINER.
  - Permissão: admin OU gestor/chef aprovado da própria escola.
  - Retorna: valor_mensal, meses_ciclo, meses_pagos, meses_restantes, valor_total, cycle_start.
- Edge `criar-pagamento-mp`: aceita `plano='migracao_anual'` e recalcula `valor` chamando a RPC com o `userClient`. PLAN_PRICES também alinhado: mensal=169.90, anual=1699.00, anual_24=3137, anual_36=4574, anual_48=5880.

## Frontend
- `/subscription` carrega a quote ao montar e renderiza um card âmbar acima da grade de planos quando `meses_pagos>0 && meses_restantes>0`.
- CTA gera PIX via `criarPagamentoMP({ plano:'migracao_anual', metodo:'pix' })` e abre Dialog com QR + botão "copiar código".
