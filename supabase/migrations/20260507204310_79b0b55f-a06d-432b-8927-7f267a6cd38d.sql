UPDATE public.app_version_manifest
SET minimum_supported_version = 'access-gate-' || extract(epoch from now())::bigint::text,
    minimum_supported_build_time = (extract(epoch from now()) * 1000)::bigint,
    updated_at = now()
WHERE id = true;