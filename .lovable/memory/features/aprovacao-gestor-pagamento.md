---
name: Aprovação de gestor com trial de 7 dias
description: Admin aprova gestor concedendo 7 dias de trial; pagamento confirmado remove o limite e ativa a escola; expirou sem pagar = bloqueio
type: feature
---
Fluxo:
1. Gestor (`gestor_pedagogico` ou `chef_projeto_vida`) se cadastra → `is_approved=false`, vai para fila do admin global.
2. Admin aprova via `admin_approve_gestor_trial(_profile_id)` → seta `is_approved=true` + `approved_until = now()+7d`.
3. Durante os 7 dias o gestor usa o app normalmente. Banner de assinatura recomenda pagar.
4. Quando o pagamento (PIX/Cartão/Boleto) é confirmado pelo webhook do Mercado Pago, a edge function `mp-webhook` chama `activate_school_subscription(_school_id, _new_end_date)` que:
   - marca `schools.subscription_status='active'` + `subscription_end_date = base+1mês`;
   - zera `approved_until` de todos os gestores da escola (acesso permanente enquanto a assinatura estiver ativa).
5. Se os 7 dias expirarem sem pagamento (`approved_until < now()` E `school.subscription_status != 'active'`), o `ApprovedRouteGuard` redireciona para `/subscription` automaticamente.

Frontend:
- `ApprovedRouteGuard` consulta `get_my_trial_status()` para gestores aprovados e bloqueia se trial expirou sem assinatura ativa.
- `Admin.tsx > approveAsIntended` detecta cargo de gestor e usa a RPC de trial em vez de update direto.
- Demais cargos (professor etc.) seguem aprovação manual pelo gestor da escola sem prazo.
