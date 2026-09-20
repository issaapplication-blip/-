-- RAFIQ admin access + review/approval foundation
-- Project-owner email is recognized after Supabase Auth authentication;
-- role=admin remains supported for additional administrators.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    lower(coalesce(auth.jwt()->>'email','')) = 'issaapplication@gmail.com'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role,'')) = 'admin'
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='applications' and policyname='Admins can view applications') then
    create policy "Admins can view applications" on public.applications for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Admins can view documents') then
    create policy "Admins can view documents" on public.documents for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Admins can review documents') then
    create policy "Admins can review documents" on public.documents for update to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='care_requests' and policyname='Admins can view care requests') then
    create policy "Admins can view care requests" on public.care_requests for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='care_requests' and policyname='Admins can update care requests') then
    create policy "Admins can update care requests" on public.care_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='caregivers' and policyname='Admins can view caregivers') then
    create policy "Admins can view caregivers" on public.caregivers for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nurses' and policyname='Admins can view nurses') then
    create policy "Admins can view nurses" on public.nurses for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='physiotherapists' and policyname='Admins can view physiotherapists') then
    create policy "Admins can view physiotherapists" on public.physiotherapists for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='Admins can view audit logs') then
    create policy "Admins can view audit logs" on public.audit_logs for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='Admins can create notifications') then
    create policy "Admins can create notifications" on public.notifications for insert to authenticated with check (public.is_admin());
  end if;
end $$;

do $$
begin
  if exists (select 1 from storage.buckets where id='private_documents') and not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Admins can read private documents'
  ) then
    create policy "Admins can read private documents" on storage.objects for select to authenticated
      using (bucket_id='private_documents' and public.is_admin());
  end if;
end $$;
