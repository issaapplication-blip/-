begin;

create table if not exists public.message_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid references public.application_intakes(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  recipient_phone text,
  telegram_chat_id text,
  event_type text not null,
  channel text not null check (channel in ('whatsapp','telegram','none')),
  status text not null check (status in ('success','failed')),
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default now()
);
alter table public.message_delivery_attempts enable row level security;
revoke all on public.message_delivery_attempts from anon,public;
grant select on public.message_delivery_attempts to authenticated;
drop policy if exists message_delivery_attempts_admin_select on public.message_delivery_attempts;
create policy message_delivery_attempts_admin_select on public.message_delivery_attempts for select to authenticated using (public.is_admin());
create index if not exists message_delivery_attempts_intake_idx on public.message_delivery_attempts(intake_id,attempted_at desc);
create index if not exists message_delivery_attempts_phone_idx on public.message_delivery_attempts(recipient_phone,attempted_at desc);
create index if not exists rafiq_telegram_identities_phone_idx on public.rafiq_telegram_identities(phone,last_seen_at desc);
create index if not exists rafiq_telegram_identities_username_idx on public.rafiq_telegram_identities(username,last_seen_at desc);

create or replace function public.admin_delete_application_intake(p_intake_id uuid)
returns jsonb language plpgsql security definer set search_path='public'
as $fn$
declare i public.application_intakes; deleted_paths text[] := array[]::text[];
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into i from public.application_intakes where id=p_intake_id for update;
  if i.id is null then raise exception 'intake_not_found'; end if;
  select coalesce(array_agg(storage_path) filter(where storage_path is not null),'{}'::text[]) into deleted_paths from public.application_intake_files where intake_id=i.id;
  delete from public.application_intake_files where intake_id=i.id;
  update public.issued_barcodes set status='revoked',updated_at=now() where intake_id=i.id;
  delete from public.application_intakes where id=i.id;
  insert into public.audit_logs(user_id,action,table_name,record_id,details)
  values(auth.uid(),'application_intake_deleted','application_intakes',i.id,jsonb_build_object('application_number',i.application_number,'application_type',i.application_type,'deleted_file_count',coalesce(array_length(deleted_paths,1),0)));
  return jsonb_build_object('status','deleted','intake_id',i.id,'application_number',i.application_number,'deleted_file_paths',to_jsonb(deleted_paths));
end
$fn$;
revoke all on function public.admin_delete_application_intake(uuid) from public,anon;
grant execute on function public.admin_delete_application_intake(uuid) to authenticated;
commit;