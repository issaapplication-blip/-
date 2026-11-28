-- RAFIQ layered security hardening (additive, non-destructive)
begin;

-- Replace legacy role-only checks with the canonical active-admin predicate.
do $rafig$
declare p record; policy_expr text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies where schemaname = 'public'
  loop
    policy_expr := coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '');
    if policy_expr ilike '%role = ''admin''%' then
      execute format('alter policy %I on %I.%I to authenticated',p.policyname,p.schemaname,p.tablename);
      if p.cmd in ('ALL','UPDATE') then
        execute format('alter policy %I on %I.%I using (public.is_admin()) with check (public.is_admin())',p.policyname,p.schemaname,p.tablename);
      elsif p.cmd in ('SELECT','DELETE') then
        execute format('alter policy %I on %I.%I using (public.is_admin())',p.policyname,p.schemaname,p.tablename);
      elsif p.cmd = 'INSERT' then
        execute format('alter policy %I on %I.%I with check (public.is_admin())',p.policyname,p.schemaname,p.tablename);
      end if;
    end if;
  end loop;
end
$rafig$;

-- These policies already used is_admin() but were granted to PUBLIC.
alter policy public_members_admin_all on public.public_members
  to authenticated using (public.is_admin()) with check (public.is_admin());

alter policy pricing_authenticated_read on public.service_pricing_rules
  to authenticated using ((select auth.uid()) is not null and active = true);

-- Remove the legacy anonymous barcode endpoint that exposed internal intake IDs.
-- The high-entropy hashed public member-barcode verifier remains available.
revoke all on function public.public_lookup_issued_barcode(text) from public, anon, authenticated;
grant execute on function public.public_lookup_issued_barcode(text) to service_role;

-- Remove DDL-adjacent privileges from client roles; ordinary CRUD remains governed by RLS.
do $rafig$
declare r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, references, trigger on table %I.%I from anon, authenticated',
      r.schemaname, r.tablename
    );
  end loop;
end
$rafig$;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

commit;
