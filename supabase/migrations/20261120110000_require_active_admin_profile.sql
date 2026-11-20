-- Require an authenticated, active administrator for every RLS policy and admin RPC
-- that delegates authorization to public.is_admin().
BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND lower(coalesce(p.role, '')) = 'admin'
      AND lower(coalesce(p.status, '')) = 'active'
  );
$function$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMIT;
