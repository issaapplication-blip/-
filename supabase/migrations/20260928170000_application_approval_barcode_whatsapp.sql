-- RAFIQ final approval workflow
-- Save applications in Supabase. Only the project admin can approve/reject.
-- On approval: activate provider profile, issue a specialty barcode, queue one WhatsApp welcome.
-- Actual WhatsApp sending is performed server-side through Kapso after the admin decision.

begin;

create table if not exists public.application_approvals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approval_code text not null unique,
  qr_payload text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.application_approvals enable row level security;

create table if not exists public.member_barcodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique,
  member_type text not null check (member_type in (
    'family','caregiver','nurse','physiotherapist','dentist',
    'nutritionist','speech_therapist','other_medical','owner'
  )),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.member_barcodes enable row level security;

create table if not exists public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid unique references public.applications(id) on delete set null,
  recipient text not null,
  message text not null,
  qr_payload text,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  error_message text
);
alter table public.whatsapp_outbox enable row level security;

drop policy if exists "Admins can view approvals" on public.application_approvals;
create policy "Admins can view approvals" on public.application_approvals
for select to authenticated using (public.is_admin());

drop policy if exists "Users can view own approval" on public.application_approvals;
create policy "Users can view own approval" on public.application_approvals
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Admins can view member barcodes" on public.member_barcodes;
create policy "Admins can view member barcodes" on public.member_barcodes
for select to authenticated using (public.is_admin());

drop policy if exists "Users can view own member barcode" on public.member_barcodes;
create policy "Users can view own member barcode" on public.member_barcodes
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Admins can view outbox" on public.whatsapp_outbox;
create policy "Admins can view outbox" on public.whatsapp_outbox
for select to authenticated using (public.is_admin());

drop policy if exists "Admins can update outbox" on public.whatsapp_outbox;
create policy "Admins can update outbox" on public.whatsapp_outbox
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop function if exists public.admin_review_application(uuid,text,text);
create or replace function public.admin_review_application(
  p_application_id uuid,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications;
  v_profile public.profiles;
  v_code text;
  v_prefix text;
  v_type text;
  v_name text;
  v_phone text;
  v_qr text;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  if p_status not in ('pending','under_review','approved','rejected') then
    raise exception 'invalid application status';
  end if;

  select * into v_app from public.applications where id = p_application_id for update;
  if v_app.id is null then raise exception 'application not found'; end if;

  update public.applications
     set status = p_status,
         notes = coalesce(p_notes, notes),
         updated_at = now()
   where id = p_application_id;

  if p_status = 'approved' then
    v_type := v_app.application_type;
    v_prefix := case v_type
      when 'caregiver' then 'CARE'
      when 'nurse' then 'NURS'
      when 'physiotherapist' then 'PHYS'
      when 'family' then 'FAM'
      else upper(left(regexp_replace(coalesce(v_type,'OTHER'),'[^A-Za-z]','','g'),4))
    end;
    if v_prefix = '' then v_prefix := 'OTHR'; end if;

    v_code := 'RAFIQ-' || v_prefix || '-' ||
      upper(substr(md5(v_app.id::text || ':' || clock_timestamp()::text),1,8));
    v_qr := 'https://rafiq-o6qd.onrender.com/barcode.html?code=' ||
      v_code;

    select * into v_profile
      from public.profiles
     where id = v_app.user_id
     for update;

    if v_profile.id is not null then
      v_name := trim(coalesce(v_profile.first_name,'') || ' ' || coalesce(v_profile.last_name,''));
      v_phone := regexp_replace(coalesce(v_profile.phone,''),'[^0-9]','','g');

      update public.profiles
         set status = 'active', updated_at = now()
       where id = v_app.user_id;

      if v_type = 'caregiver' then
        update public.caregivers set verification_status='approved', updated_at=now()
         where user_id=v_app.user_id;
      elsif v_type = 'nurse' then
        update public.nurses set verification_status='approved', updated_at=now()
         where user_id=v_app.user_id;
      end if;

      insert into public.application_approvals(application_id,user_id,approval_code,qr_payload,updated_at)
      values(v_app.id,v_app.user_id,v_code,v_qr,now())
      on conflict (application_id) do update set
        user_id=excluded.user_id,
        approval_code=excluded.approval_code,
        qr_payload=excluded.qr_payload,
        updated_at=now();

      insert into public.member_barcodes(user_id,code,member_type,status,issued_at,issued_by,note,updated_at)
      values(v_app.user_id,v_code,v_type,'active',now(),auth.uid(),'أصدر تلقائيًا بعد موافقة المدير',now())
      on conflict (user_id) do update set
        code=excluded.code,
        member_type=excluded.member_type,
        status='active',
        issued_at=now(),
        issued_by=auth.uid(),
        note=excluded.note,
        updated_at=now();

      if v_phone <> '' then
        insert into public.whatsapp_outbox(user_id,application_id,recipient,message,qr_payload,status)
        values(
          v_app.user_id,
          v_app.id,
          v_phone,
          'مرحبًا ' || coalesce(nullif(v_name,''),'بك') ||
          ' 🌿\nنرحب بك في منصة RAFIQ | رفيق. تمت الموافقة على طلب انتسابك إلى المنصة.\n' ||
          'الاختصاص: ' || case v_type
            when 'caregiver' then 'مقدم/ة رعاية'
            when 'nurse' then 'ممرض/ة'
            when 'physiotherapist' then 'معالج/ة فيزيائي/ة'
            when 'family' then 'عائلة'
            else v_type
          end || '\n' ||
          'رمز الباركود الخاص بك: ' || v_code || '\n' ||
          'افتح بطاقة الباركود واحفظها: ' || v_qr ||
          '\nيرجى الاحتفاظ بهذا الرمز وعدم مشاركته إلا عند الحاجة.',
          v_qr,
          'pending'
        )
        on conflict (application_id) do update set
          recipient=excluded.recipient,
          message=excluded.message,
          qr_payload=excluded.qr_payload,
          status='pending',
          sent_at=null,
          provider_message_id=null,
          error_message=null;
      end if;
    end if;

  elsif p_status = 'rejected' then
    update public.profiles set status='rejected', updated_at=now()
      where id=v_app.user_id;
    if v_app.application_type='caregiver' then
      update public.caregivers set verification_status='rejected', updated_at=now()
        where user_id=v_app.user_id;
    elsif v_app.application_type='nurse' then
      update public.nurses set verification_status='rejected', updated_at=now()
        where user_id=v_app.user_id;
    end if;
    update public.member_barcodes set status='suspended', updated_at=now()
      where user_id=v_app.user_id;
  end if;

  insert into public.audit_logs(user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'admin_review_application',
    'application',
    v_app.id,
    jsonb_build_object('status',p_status,'notes',p_notes)
  );
end;
$$;

revoke all on function public.admin_review_application(uuid,text,text) from public, anon;
grant execute on function public.admin_review_application(uuid,text,text) to authenticated;

drop function if exists public.admin_mark_outbox_sent(uuid,text);
create or replace function public.admin_mark_outbox_sent(
  p_outbox_id uuid,
  p_provider_message_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  update public.whatsapp_outbox
     set status='sent', sent_at=now(), provider_message_id=p_provider_message_id, error_message=null
   where id=p_outbox_id;
end;
$$;
revoke all on function public.admin_mark_outbox_sent(uuid,text) from public, anon;
grant execute on function public.admin_mark_outbox_sent(uuid,text) to authenticated;

drop function if exists public.admin_mark_outbox_failed(uuid,text);
create or replace function public.admin_mark_outbox_failed(
  p_outbox_id uuid,
  p_error text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  update public.whatsapp_outbox
     set status='failed', error_message=left(coalesce(p_error,'send failed'),1000)
   where id=p_outbox_id;
end;
$$;
revoke all on function public.admin_mark_outbox_failed(uuid,text) from public, anon;
grant execute on function public.admin_mark_outbox_failed(uuid,text) to authenticated;

commit;
