---
name: Sistema de advertências disciplinares
description: Erros (ausência, sem check-out) acumulam advertências; 3=bloqueio gestor, +2 pós-desbloqueio=suspensão 15d auto
type: feature
---
**Erros que contam:** `ausencia` (agendou e não fez check-in) e `sem_checkout` (usou e não encerrou). Atraso não conta.

**Escala:**
- 1ª e 2ª: aviso no inbox do usuário
- 3ª: status `blocked_manager` → não cria mais bookings. Só `manager_unblock_user` libera.
- Após desbloqueio: +1 aviso, +1 = `suspended_auto` por 15 dias corridos. Gestor não libera, só o cron diário.

**Banco:** tabela `user_infractions` (única por user+booking+type). Colunas em `profiles`: `discipline_status`, `discipline_total_infractions`, `discipline_suspended_until`, `discipline_blocked_at`, `discipline_unblocked_count`.

**RPCs:**
- `register_infraction(user, booking, type)` SECURITY DEFINER — só cron/admin chama. Aplica consequência + cria inbox.
- `manager_unblock_user(user)` — só gestor/chef da mesma escola, exige status `blocked_manager`.
- `detect_infractions_daily()` — cron 03:30 (`detect-infractions-daily`): varre `booking_date = current_date-1` sem usage → ausência; usage iniciado sem `ended_at` após `end_time+6h` → sem_checkout. Limpa suspensões expiradas.

**Trigger:** `discipline_block_booking` BEFORE INSERT em `bookings` bloqueia user com status `blocked_manager`/`suspended_auto`.

**Front:**
- `/disciplina` (usuário) — status, contador, histórico. Botão balança ⚖️ abaixo do QR em `/qr-scan`.
- `/gestor/disciplina` — lista usuários com infrações + botão "Desbloquear" quando `blocked_manager`. Shortcut no `GestorPanel` (ícone Scale).
