-- Rollback for RAFIQ security hardening / Telegram rate limiter.
-- Run only after reverting the Telegram Edge Function to a build that does not call
-- consume_telegram_rate_limit. No table or data is dropped by this rollback.
BEGIN;

DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_case_assignments;
DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_provider_registry;
DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_telegram_broadcast_targets;
DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_telegram_broadcasts;
DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_telegram_identities;
DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_telegram_request_sessions;
DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_telegram_subscribers;
DROP POLICY IF EXISTS service_role_only_access ON public.telegram_update_receipts;
DROP POLICY IF EXISTS service_role_only_access ON public.whatsapp_integrations;
DROP POLICY IF EXISTS service_role_only_access ON public.whatsapp_webhook_events;
DROP POLICY IF EXISTS service_role_only_access ON public.telegram_webhook_rate_limits;

REVOKE EXECUTE ON FUNCTION public.consume_telegram_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.consume_telegram_rate_limit(text, integer, integer);

-- Restore the pre-migration ACLs from 20261005120000_member_cards_folders_manager.sql
-- and 20260913190000_admin_review_dashboard_access.sql. Never widen RPC access in rollback.
REVOKE ALL ON FUNCTION public.manager_folder_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manager_folder_counts() TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_set_provider_status(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_provider_status(uuid, text, text, text) TO authenticated, service_role;

COMMIT;
