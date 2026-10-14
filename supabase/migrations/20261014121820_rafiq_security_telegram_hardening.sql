-- RAFIQ security hardening and Telegram webhook rate limit.
-- Server-only data remains unavailable to anon/authenticated; service_role is the only policy target.
BEGIN;

DO $policies$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'rafiq_case_assignments',
    'rafiq_provider_registry',
    'rafiq_telegram_broadcast_targets',
    'rafiq_telegram_broadcasts',
    'rafiq_telegram_identities',
    'rafiq_telegram_request_sessions',
    'rafiq_telegram_subscribers',
    'telegram_update_receipts',
    'whatsapp_integrations',
    'whatsapp_webhook_events'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS service_role_only_access ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY service_role_only_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END
$policies$;

-- This manager-only aggregate exposed internal review folder counts to public roles.
REVOKE EXECUTE ON FUNCTION public.manager_folder_counts() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manager_folder_counts() TO service_role;

-- Admin write RPC should not be callable by the unauthenticated public role.
REVOKE EXECUTE ON FUNCTION public.admin_set_provider_status(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_provider_status(uuid, text, text, text) TO authenticated, service_role;

-- Atomic per-chat rolling-window limiter for the Telegram webhook.
CREATE TABLE IF NOT EXISTS public.telegram_webhook_rate_limits (
  chat_id text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_webhook_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only_access ON public.telegram_webhook_rate_limits;
CREATE POLICY service_role_only_access ON public.telegram_webhook_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_telegram_rate_limit(
  p_chat_id text,
  p_window_seconds integer DEFAULT 60,
  p_max_requests integer DEFAULT 10
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_window_seconds integer := greatest(10, least(coalesce(p_window_seconds, 60), 3600));
  v_max_requests integer := greatest(1, least(coalesce(p_max_requests, 10), 100));
  v_count integer;
BEGIN
  IF length(trim(coalesce(p_chat_id, ''))) = 0 OR length(p_chat_id) > 128 THEN
    RETURN false;
  END IF;

  INSERT INTO public.telegram_webhook_rate_limits AS limits
    (chat_id, window_started_at, request_count, updated_at)
  VALUES (p_chat_id, now(), 1, now())
  ON CONFLICT (chat_id) DO UPDATE
    SET window_started_at = CASE
          WHEN limits.window_started_at <= now() - make_interval(secs => v_window_seconds) THEN now()
          ELSE limits.window_started_at
        END,
        request_count = CASE
          WHEN limits.window_started_at <= now() - make_interval(secs => v_window_seconds) THEN 1
          ELSE limits.request_count + 1
        END,
        updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN v_count <= v_max_requests;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_telegram_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_telegram_rate_limit(text, integer, integer) TO service_role;

COMMIT;
