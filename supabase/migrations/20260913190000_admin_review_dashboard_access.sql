create policy "Admins can view profiles" on public.profiles for select to authenticated using (is_admin());
create policy "Admins can manage profiles" on public.profiles for update to authenticated using (is_admin()) with check (is_admin());

create index if not exists applications_status_created_at_idx on public.applications(status, created_at desc);
create index if not exists documents_user_id_created_at_idx on public.documents(user_id, created_at desc);
create index if not exists caregivers_verification_created_at_idx on public.caregivers(verification_status, created_at desc);
create index if not exists nurses_verification_created_at_idx on public.nurses(verification_status, created_at desc);
create index if not exists physiotherapists_verification_created_at_idx on public.physiotherapists(verification_status, created_at desc);

create or replace function public.admin_set_application_status(p_application_id uuid, p_status text, p_notes text default null)
returns public.applications language plpgsql security invoker set search_path = public as $$
declare v_row public.applications;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('pending','review','approved','rejected') then raise exception 'invalid_status'; end if;
  update public.applications set status=p_status, notes=coalesce(p_notes,notes), updated_at=now() where id=p_application_id returning * into v_row;
  if v_row.id is null then raise exception 'application_not_found'; end if;
  insert into public.audit_logs(user_id, action, table_name, record_id) values(auth.uid(), 'application_status_'||p_status, 'applications', v_row.id);
  return v_row;
end; $$;
revoke all on function public.admin_set_application_status(uuid,text,text) from public;
grant execute on function public.admin_set_application_status(uuid,text,text) to authenticated;

create or replace function public.admin_set_provider_status(p_user_id uuid, p_provider_type text, p_status text, p_notes text default null)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('pending','review','approved','rejected') then raise exception 'invalid_status'; end if;
  if p_provider_type='caregiver' then update caregivers set verification_status=p_status, updated_at=now() where user_id=p_user_id;
  elsif p_provider_type='nurse' then update nurses set verification_status=p_status, updated_at=now() where user_id=p_user_id;
  elsif p_provider_type='physiotherapist' then update physiotherapists set verification_status=p_status where user_id=p_user_id;
  else raise exception 'invalid_provider_type'; end if;
  if not found then raise exception 'provider_not_found'; end if;
  update profiles set status=case when p_status='approved' then 'active' when p_status='rejected' then 'rejected' else status end, updated_at=now() where id=p_user_id;
  insert into public.audit_logs(user_id, action, table_name, record_id) values(auth.uid(), 'provider_status_'||p_status, p_provider_type||'s', p_user_id);
  return true;
end; $$;
revoke all on function public.admin_set_provider_status(uuid,text,text,text) from public;
grant execute on function public.admin_set_provider_status(uuid,text,text,text) to authenticated;