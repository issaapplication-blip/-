-- RAFIQ approvals: approval code, QR payload, and outbound message queue
create table if not exists public.application_approvals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  user_id uuid not null,
  approval_code text not null unique,
  qr_payload text not null,
  created_at timestamptz not null default now()
);

alter table public.application_approvals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='application_approvals' and policyname='Admins can view approvals') then
    create policy "Admins can view approvals" on public.application_approvals for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='application_approvals' and policyname='Users can view own approval') then
    create policy "Users can view own approval" on public.application_approvals for select to authenticated using (user_id=auth.uid());
  end if;
end $$;

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  application_id uuid references public.applications(id) on delete set null,
  recipient text not null,
  message text not null,
  qr_payload text,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.whatsapp_outbox enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='whatsapp_outbox' and policyname='Admins can view outbox') then
    create policy "Admins can view outbox" on public.whatsapp_outbox for select to authenticated using (public.is_admin());
  end if;
end $$;

create or replace function public.admin_set_application_status(
  p_application_id uuid,
  p_status text,
  p_notes text default null
)
returns public.applications
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.applications;
  v_code text;
  v_phone text;
  v_name text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('pending','review','approved','rejected') then raise exception 'invalid_status'; end if;

  update public.applications
    set status=p_status, notes=coalesce(p_notes,notes), updated_at=now()
    where id=p_application_id
    returning * into v_row;

  if v_row.id is null then raise exception 'application_not_found'; end if;

  insert into public.audit_logs(user_id, action, table_name, record_id)
    values(auth.uid(), 'application_status_'||p_status, 'applications', v_row.id);

  if p_status='approved' then
    v_code := 'RAFIQ-' || upper(substr(md5(v_row.id::text || clock_timestamp()::text),1,10));

    insert into public.application_approvals(application_id,user_id,approval_code,qr_payload)
      values(v_row.id,v_row.user_id,v_code,'RAFIQ|APPROVED|'||v_code)
      on conflict (application_id) do update
        set approval_code=excluded.approval_code, qr_payload=excluded.qr_payload;

    select coalesce(phone,'') into v_phone from public.profiles where id=v_row.user_id;
    select trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) into v_name from public.profiles where id=v_row.user_id;

    if coalesce(v_phone,'') <> '' then
      insert into public.whatsapp_outbox(user_id,application_id,recipient,message,qr_payload)
      values(
        v_row.user_id,
        v_row.id,
        v_phone,
        'مرحبًا '||coalesce(nullif(v_name,''),'بك')||'، نود إبلاغك بأن طلبك للانتساب إلى منصة RAFIQ | رفيق قد تمت الموافقة عليه. رمز اعتمادك: '||v_code||'. سيتم إرسال/تسليم الباركود الخاص بك عبر قناة واتساب المعتمدة بعد تفعيل الإرسال.',
        'RAFIQ|APPROVED|'||v_code
      );
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_set_application_status(uuid,text,text) from public;
grant execute on function public.admin_set_application_status(uuid,text,text) to authenticated;
