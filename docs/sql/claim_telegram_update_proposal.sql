-- PROPOSAL ONLY — DO NOT APPLY until the live table/function definitions have been inspected
-- Project: qmuxaehrahfsnabyjens
-- Purpose: supply the atomic idempotency RPC called by telegram-webhook.
-- This file is intentionally under docs/sql, not supabase/migrations.
-- It is gated: it aborts if the existing table shape or RPC return contract differs.

BEGIN;

DO $preflight$
DECLARE
  v_table regclass := to_regclass('public.telegram_update_receipts');
  v_update_id_type text;
  v_missing text[];
  v_rpc oid;
  v_result text;
BEGIN
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: public.telegram_update_receipts does not exist; inspect the live schema before creating it';
  END IF;

  SELECT array_agg(required.column_name ORDER BY required.column_name)
    INTO v_missing
  FROM (VALUES
    ('update_id'), ('status'), ('lease_until'),
    ('last_error'), ('completed_at'), ('updated_at')
  ) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'telegram_update_receipts'
      AND c.column_name = required.column_name
  );

  IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Preflight failed: telegram_update_receipts missing columns: %', array_to_string(v_missing, ', ');
  END IF;

  SELECT data_type INTO v_update_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'telegram_update_receipts'
    AND column_name = 'update_id';

  IF v_update_id_type <> 'bigint' THEN
    RAISE EXCEPTION 'Preflight failed: update_id must be bigint; found %', v_update_id_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = v_table
      AND i.indisunique
      AND a.attname = 'update_id'
  ) THEN
    RAISE EXCEPTION 'Preflight failed: update_id has no unique constraint/index';
  END IF;

  v_rpc := to_regprocedure('public.claim_telegram_update(bigint,integer)');
  IF v_rpc IS NOT NULL THEN
    SELECT pg_get_function_result(v_rpc) INTO v_result;
    IF v_result <> 'TABLE(claimed boolean, current_status text)' THEN
      RAISE EXCEPTION 'Preflight failed: existing RPC returns %, expected TABLE(claimed boolean, current_status text)', v_result;
    END IF;
  END IF;
END;
$preflight$;

DO $create_rpc$
BEGIN
  IF to_regprocedure('public.claim_telegram_update(bigint,integer)') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.claim_telegram_update(
        p_update_id bigint,
        p_lease_seconds integer DEFAULT 120
      )
      RETURNS TABLE(claimed boolean, current_status text)
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = ''
      AS $body$
      DECLARE
        v_status text;
        v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 900));
      BEGIN
        IF p_update_id IS NULL OR p_update_id < 0 THEN
          RETURN QUERY SELECT false, 'invalid'::text;
          RETURN;
        END IF;

        INSERT INTO public.telegram_update_receipts AS receipts
          (update_id, status, lease_until, last_error, completed_at, updated_at)
        VALUES
          (p_update_id, 'processing', pg_catalog.now() + pg_catalog.make_interval(secs => v_lease_seconds), NULL, NULL, pg_catalog.now())
        ON CONFLICT (update_id) DO UPDATE
          SET status = 'processing',
              lease_until = pg_catalog.now() + pg_catalog.make_interval(secs => v_lease_seconds),
              last_error = NULL,
              completed_at = NULL,
              updated_at = pg_catalog.now()
          WHERE receipts.status <> 'completed'
            AND (
              receipts.status <> 'processing'
              OR receipts.lease_until IS NULL
              OR receipts.lease_until <= pg_catalog.now()
            )
        RETURNING receipts.status INTO v_status;

        IF FOUND THEN
          RETURN QUERY SELECT true, v_status;
          RETURN;
        END IF;

        SELECT receipts.status
          INTO v_status
        FROM public.telegram_update_receipts AS receipts
        WHERE receipts.update_id = p_update_id;

        RETURN QUERY SELECT false, coalesce(v_status, 'missing');
      END;
      $body$
    $function$;
  END IF;
END;
$create_rpc$;

REVOKE ALL ON FUNCTION public.claim_telegram_update(bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_update(bigint, integer) TO service_role;

COMMIT;
