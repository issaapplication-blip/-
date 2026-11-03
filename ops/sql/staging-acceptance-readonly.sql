-- RAFIQ staging acceptance audit — READ ONLY.
-- Run in Supabase SQL Editor on the STAGING project only.
-- This file contains SELECT statements only. It does not alter schema, data, policies or settings.

-- 1) RLS enabled/forced and row counts are intentionally omitted (avoid reading customer data).
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','storage')
  and c.relkind = 'r'
  and (
    n.nspname = 'storage'
    or c.relname ilike any (array[
      '%booking%','%intake%','%application%','%conversation%',
      '%whatsapp%','%telegram%','%message%','%approval%'
    ])
  )
order by n.nspname, c.relname;

-- 2) Policies for sensitive public tables and Storage.
select
  schemaname, tablename, policyname, permissive, roles,
  cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
  and (
    schemaname = 'storage'
    or tablename ilike any (array[
      '%booking%','%intake%','%application%','%conversation%',
      '%whatsapp%','%telegram%','%message%','%approval%'
    ])
  )
order by schemaname, tablename, policyname;

-- 3) Explicit table grants to anon/authenticated/service_role.
select
  table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public','storage')
  and grantee in ('anon','authenticated','service_role')
  and (
    table_schema = 'storage'
    or table_name ilike any (array[
      '%booking%','%intake%','%application%','%conversation%',
      '%whatsapp%','%telegram%','%message%','%approval%'
    ])
  )
order by table_schema, table_name, grantee, privilege_type;

-- 4) Storage buckets: public flag, object-size cap and allowed MIME types.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- 5) Storage policies specifically for objects and bucket scoping.
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 6) RPC definitions and grants for Telegram claim/mark/rate-limit and admin review.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  coalesce(array_to_string(array(
    select r.rolname
    from pg_roles r
    where has_function_privilege(r.oid, p.oid, 'EXECUTE')
    order by r.rolname
  ), ', '), '') as roles_with_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','storage')
  and p.proname in (
    'claim_telegram_update','consume_telegram_rate_limit',
    'admin_approve_application_intake'
  )
order by p.proname;

-- 7) Auth-related hooks and triggers that can modify JWT claims.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','auth')
  and (
    p.proname ilike '%token%hook%'
    or p.proname ilike '%jwt%'
    or p.proname ilike '%claims%'
  )
order by n.nspname, p.proname;

-- 8) Auth schema migration version table presence only; do not query auth.users.
select to_regclass('auth.schema_migrations') as auth_schema_migrations_table;
