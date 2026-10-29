-- Harden the manually provisioned bookings table without changing or deleting rows.
-- This migration is intentionally guarded because older RAFIQ deployments may not have
-- created the table yet. It is safe to apply only after review and is NOT run by CI.
DO $$
BEGIN
  IF to_regclass('public.bookings') IS NULL THEN
    RAISE NOTICE 'public.bookings is absent; skipping bookings RLS hardening';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON TABLE public.bookings FROM anon, authenticated';
  EXECUTE 'GRANT SELECT, UPDATE ON TABLE public.bookings TO authenticated';
  EXECUTE 'GRANT ALL ON TABLE public.bookings TO service_role';

  EXECUTE 'DROP POLICY IF EXISTS bookings_admin_select ON public.bookings';
  EXECUTE 'CREATE POLICY bookings_admin_select ON public.bookings FOR SELECT TO authenticated USING (public.is_admin())';
  EXECUTE 'DROP POLICY IF EXISTS bookings_admin_update ON public.bookings';
  EXECUTE 'CREATE POLICY bookings_admin_update ON public.bookings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
END $$;
