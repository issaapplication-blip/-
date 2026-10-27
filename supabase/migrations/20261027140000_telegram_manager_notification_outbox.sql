-- RAFIQ: durable, retryable Telegram manager notifications.
-- Additive only: no existing data is deleted or rewritten.
BEGIN;

ALTER TABLE public.rafiq_telegram_request_sessions
  ADD COLUMN IF NOT EXISTS submit_update_id bigint,
  ADD COLUMN IF NOT EXISTS confirmation_sent boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS rafiq_telegram_request_sessions_submit_update_key
  ON public.rafiq_telegram_request_sessions(submit_update_id)
  WHERE submit_update_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rafiq_telegram_manager_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  manager_chat_id text NOT NULL,
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT rafiq_telegram_manager_notification_outbox_request_manager_key
    UNIQUE (request_id, manager_chat_id)
);

CREATE INDEX IF NOT EXISTS rafiq_telegram_manager_notification_outbox_pending_idx
  ON public.rafiq_telegram_manager_notification_outbox(created_at)
  WHERE status = 'pending';

ALTER TABLE public.rafiq_telegram_manager_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rafiq_telegram_manager_notification_outbox FROM anon, authenticated;
DROP POLICY IF EXISTS service_role_only_access ON public.rafiq_telegram_manager_notification_outbox;
CREATE POLICY service_role_only_access
  ON public.rafiq_telegram_manager_notification_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.rafiq_telegram_manager_notification_outbox TO service_role;

COMMIT;
