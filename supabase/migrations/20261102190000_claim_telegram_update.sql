-- Proposed additive Telegram update idempotency RPC.
-- This migration is staged for review only. Do not apply until the live
-- project has been inspected read-only and the missing/incompatible schema
-- has been confirmed. No existing rows or objects are dropped.

BEGIN;

CREATE TABLE IF NOT EXISTS public.telegram_update_receipts (
  update_id bigint PRIMARY KEY,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text
);

ALTER TABLE public.telegram_update_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telegram_update_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.telegram_update_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.claim_telegram_update(
  p_update_id bigint,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(claimed boolean, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_claimed boolean;
  v_status text;
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
BEGIN
  IF p_update_id IS NULL OR p_update_id < 0 THEN
    RAISE EXCEPTION 'invalid_telegram_update_id';
  END IF;

  INSERT INTO public.telegram_update_receipts AS receipt
    (update_id, status, lease_until, created_at, updated_at, completed_at, last_error)
  VALUES
    (p_update_id, 'processing', now() + make_interval(secs => v_lease_seconds), now(), now(), NULL, NULL)
  ON CONFLICT (update_id) DO UPDATE
    SET status = 'processing',
        lease_until = now() + make_interval(secs => v_lease_seconds),
        updated_at = now(),
        completed_at = NULL,
        last_error = NULL
    WHERE receipt.status <> 'completed'
      AND (
        receipt.status <> 'processing'
        OR receipt.lease_until IS NULL
        OR receipt.lease_until <= now()
      )
  RETURNING true, receipt.status
  INTO v_claimed, v_status;

  IF FOUND THEN
    RETURN QUERY SELECT v_claimed, v_status;
    RETURN;
  END IF;

  SELECT receipt.status
    INTO v_status
    FROM public.telegram_update_receipts AS receipt
   WHERE receipt.update_id = p_update_id;

  RETURN QUERY SELECT false, v_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_telegram_update(bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_update(bigint, integer) TO service_role;

COMMIT;
