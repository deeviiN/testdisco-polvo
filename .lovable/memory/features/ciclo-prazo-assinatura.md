---
name: Ciclo de prazo de assinatura
description: Campo subscription_deadline em profiles, cron diário sync_gestor_subscription_deadlines (03:10), 15d carência, banner /gestor, página /admin/deadlines
type: feature
---
**Banco:**
- `profiles.subscription_deadline` (timestamptz) e `profiles.subscription_blocked_at`.
- Cron `sync-gestor-subscription-deadlines` (03:10 diário) atualiza prazos de cada gestor a partir de `assinaturas.validade` → `schools.subscription_end_date` → `approved_until`. Bloqueia (`is_approved=false`) quando prazo + grace_period_days (15) passou. Reativa automaticamente se renovado.

**RPCs:**
- `get_my_subscription_deadline()` — gestor consulta dias restantes, in_grace, is_blocked.
- `list_schools_deadlines_admin()` — admin lista todas escolas com gestor, telefone, e-mail, prazo, status (`active|expiring_soon|grace_period|expired|blocked|no_subscription`).
- `sync_gestor_subscription_deadlines()` — disparável manualmente pelo admin (botão refresh em /admin/deadlines).

**Frontend:**
- `SubscriptionDeadlineBanner` no topo de `/gestor` (renderiza se prazo existir; toques diferentes para grace/expirando/bloqueada).
- `/admin/deadlines` (SchoolDeadlines.tsx) com filtros por status, busca, links wa.me/mailto.
- Botão "Prazos" (ícone Clock) no header do `/admin`.
