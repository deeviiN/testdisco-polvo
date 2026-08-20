
-- Revogar execução de funções de utilidade internas que são disparadas por triggers
REVOKE EXECUTE ON FUNCTION public.validate_gestor_status() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_str_status() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_gestor_payment_approval() FROM anon, authenticated, PUBLIC;
