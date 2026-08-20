UPDATE public.app_version_manifest
SET minimum_supported_build_time = 1776523802252,
    minimum_supported_version = 'access-gate-v1',
    latest_build_time = 1776523802252,
    latest_version = 'access-gate-v1',
    updated_at = now()
WHERE id = true;