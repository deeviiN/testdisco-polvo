
-- Trigger functions: nunca devem ser chamadas via API/PostgREST
REVOKE EXECUTE ON FUNCTION public.audit_booking_changes() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_profile_changes() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_role_changes() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_booking_gestor_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_payment_status_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_chef_profile_escalation() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_approved_until() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_booking_gestor_fields() FROM anon, PUBLIC;
