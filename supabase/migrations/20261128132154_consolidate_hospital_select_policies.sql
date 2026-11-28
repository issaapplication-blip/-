begin;
drop policy if exists hospitals_public_read on public.hospitals;
drop policy if exists hospitals_admin_read_all on public.hospitals;
drop policy if exists hospitals_authenticated_read on public.hospitals;
create policy hospitals_public_read
  on public.hospitals for select
  to anon
  using (is_published is true);
create policy hospitals_authenticated_read
  on public.hospitals for select
  to authenticated
  using (is_published is true or public.is_admin());
commit;
