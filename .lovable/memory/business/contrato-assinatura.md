---
name: Contrato de assinatura (eletrônico 2026.1)
description: Termos vigentes — aceite eletrônico, fidelidade 24m, R$ 199,90/mês
type: feature
---

## Versão atual: `2026.1-eletronico-24m`
Constante em `src/lib/contractVersion.ts` (`CURRENT_CONTRACT_VERSION`).

## Cláusulas (17, formato A4 ABNT)
1. Objeto — licença de uso da plataforma.
2. Licença — limitada, não exclusiva, intransferível.
3. **Vigência e fidelidade** — 12 meses renovável + fidelidade mínima de **24 meses**; multa proporcional se cancelar antes.
4. Valores — base **R$ 199,90/mês**; PIX, boleto ou cartão.
5. Reajuste — IPCA anual.
6/7. Obrigações da CONTRATANTE / CONTRATADA.
8. Inadimplência — 30/60/90 dias → suspensão, SPC/SERASA, protesto. Multa 2%, juros 1% a.m.
9. Rescisão — aviso 30 dias; multa de fidelidade quando aplicável.
10. Propriedade intelectual.
11. Disponibilidade — sem garantia de funcionamento ininterrupto.
12. Limitação de responsabilidade.
13. LGPD.
14. Registros eletrônicos — IP, data/hora, navegador, dispositivo, versão aceita.
15. **Aceite eletrônico** — checkbox + botão "ACEITAR CONTRATO E ATIVAR ASSINATURA" tem valor de assinatura física.
16. Responsabilidade exclusiva da PJ — gestor isento.
17. Foro — Boa Vista/RR.

## Planos disponíveis
- Mensal — R$ 199,90/mês
- 1 ano (anual_12) — R$ 2.278,86 (5% off)
- 2 anos (anual_24) — R$ 4.317,84 (10% off)

Planos `anual_36` e `anual_48` foram **removidos**. Constraint do banco rejeita.

## Fluxo de aceite (substitui o antigo)
**Removido:** etapa "admin assina primeiro", sininho `useGestorContractNotifications`/`useAdminPendingContracts`, upload manual de PDF pelo gestor, steps `contract-upload`/`contract-review` (ainda no código mas inalcançáveis).

**Novo:** em `/subscription` step `contract-view`:
1. Gestor lê o contrato completo na tela.
2. Marca checkbox "Li e concordo com os termos deste contrato".
3. Clica "ACEITAR CONTRATO E ATIVAR ASSINATURA" → `handleAcceptContract`:
   - Captura IP (api.ipify.org), `navigator.userAgent`, timestamp UTC + Manaus.
   - Gera PDF com 17 cláusulas + bloco "TERMO DE ACEITE ELETRÔNICO".
   - Upload no bucket `signed-contracts` em `{schoolId}/{userId}/{ts}-aceite.pdf`.
   - Chama RPC `accept_contract_electronically(_school_id, _file_name, _file_path, _file_size, _gestor_cpf, _accepted_ip, _accepted_user_agent, _contract_version, _reacceptance)`.
   - Atualiza `schools.contract_version` para `2026.1-eletronico-24m`.
   - Redireciona para etapa `payment`.

## Re-aceite de contratos antigos
- Banner âmbar `ReacceptanceBanner` (sticky top, injetado em `GestorPanel`) aparece quando `schools.contract_version` é diferente da versão atual.
- Botão "Aceitar agora" → `/subscription?reaceite=1` → contract-view com `reacceptance=true` na chamada da RPC.
- Sem pagamento adicional, sem prazo forçado. Dismiss por 24h via `localStorage`.

## Tabela `signed_contracts` (colunas novas)
- `accepted_at timestamptz`
- `accepted_ip inet`
- `accepted_user_agent text`
- `contract_version text`
- `reacceptance boolean default false`

Índice único `signed_contracts_one_gestor_per_school` permite múltiplos re-aceites (filtra `reacceptance=false`).
