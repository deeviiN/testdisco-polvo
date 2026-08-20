-- Fix 0011: set immutable search_path on the only trigger fn missing it
ALTER FUNCTION public.touch_inbox_updated_at() SET search_path = public;

-- Fix 0028/0029: revoke anon EXECUTE on SECURITY DEFINER functions that
-- should never be called by unauthenticated users. The truly public
-- helpers (school search, public booking lookup, app version manifest,
-- gestor public contact, public city/state lists) keep anon access.

-- Admin-only / auth-required RPCs
REVOKE EXECUTE ON FUNCTION public.broadcast_app_refresh() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_linter_reports() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_trial_status() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_plan_migration_quote(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_user_approved(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_subscription_notifications_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_gestores_admin_contract_signed() FROM anon, PUBLIC;

-- Trigger-only functions (never called via PostgREST)
REVOKE EXECUTE ON FUNCTION public.touch_inbox_updated_at() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_on_booking_decision() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_on_booking_insert() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_on_profile_approved() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_on_profile_pending() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_on_signed_contract() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_on_transfer_decision() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_on_transfer_insert() FROM anon, PUBLIC;

-- Re-grant authenticated EXECUTE to RPCs that the app calls from logged-in users
GRANT EXECUTE ON FUNCTION public.get_my_trial_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_migration_quote(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_subscription_notifications_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_app_refresh() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_linter_reports() TO authenticated;