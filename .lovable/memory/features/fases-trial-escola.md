---
name: Fases de trial da escola (10/15 dias corridos)
description: Trial gestor de 10d → carência 5d (10-15) só setor 'informatica' + TV bloqueada + novos cadastros bloqueados → 15+d bloqueio total exceto /subscription, /gestor/documentos, /profile, /settings. Token verify_contract expira em 5 anos.
type: feature
---

**Contagem em dias corridos** desde `min(approved_until - 10d)` dos gestores aprovados da escola.

**Backend:**
- `admin_approve_gestor_trial` seta `approved_until = now()+10 dias`.
- RPC `get_school_trial_phase(_school_id)`: phase ∈ ('active'|'trial'|'restricted'|'blocked'). Boundaries: `<10` trial, `<15` restricted, `>=15` blocked. EXECUTE liberado para anon (TV pública precisa).
- Trigger `enforce_trial_phase_on_booking` (BEFORE INSERT bookings): bloqueia phase='blocked' (`trial_phase_blocked` HINT "vencida há mais de 15 dias") e phase='restricted' fora do `allowed_sector='informatica'` (`trial_phase_restricted_sector`). Admin isento.
- Trigger `enforce_trial_phase_on_profile_insert` (BEFORE INSERT profiles): bloqueia novos cadastros quando phase ∈ ('restricted','blocked'). Erro `school_registrations_blocked`. Admin e perfis sem school_id passam.
- `verify_contract(_token)`: retorna status='expired' quando accepted_at < now()-5 anos.

**Frontend:**
- Hook `useSchoolTrialPhase`: remaining em 'restricted' = `15 - days` (era 20).
- `ApprovedRouteGuard` (já existente): em 'blocked' libera apenas `BLOCKED_PHASE_WHITELIST` (`/subscription`, `/gestor/documentos`, `/profile`, `/settings`, `/auth`, `/admin`).
- `TvMode` (`/tv`): chama `get_school_trial_phase` a cada refresh; em restricted/blocked mostra tela "Painel TV indisponível" com mensagem específica.
- `Auth.tsx` (cadastro): captura erro `school_registrations_blocked` e exibe "Esta escola está com assinatura pendente. Novos cadastros estão bloqueados…".
- `SectorSelect.handleSectorClick`: em 'restricted' bloqueia setores ≠ allowedSector; em 'blocked' redireciona /subscription.

**Aplica-se a TODA a escola** (todos os papéis). Admin global é isento.
