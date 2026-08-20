UPDATE public.app_version_manifest
SET minimum_supported_version = '0000.0000',
    minimum_supported_build_time = 0,
    updated_at = now()
WHERE id = true;