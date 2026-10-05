-- RAFIQ member cards + application folders + manager Telegram support.
-- Applied to the existing RAFIQ project without dropping or rewriting data.

create sequence if not exists public.rafiq_membership_seq start 1001;
alter table public.issued_barcodes add column if not exists membership_number text;
create unique index if not exists issued_barcodes_intake_id_key on public.issued_barcodes (intake_id);
create unique index if not exists issued_barcodes_membership_number_key on public.issued_barcodes (membership_number) where membership_number is not null;

alter table public.application_intakes
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid;
alter table public.audit_logs add column if not exists details jsonb;

create table if not exists public.care_case_assignments (
  id uuid primary key default gen_random_uuid(),
  case_intake_id uuid not null references public.application_intakes(id) on delete cascade,
  member_intake_id uuid not null references public.application_intakes(id) on delete cascade,
  assigned_by text,
  note text,
  status text not null default 'assigned' check (status in ('assigned','cancelled')),
  created_at timestamptz not null default now()
);
create unique index if not exists care_case_assignments_active_uidx
  on public.care_case_assignments (case_intake_id) where status='assigned';
alter table public.care_case_assignments enable row level security;
drop policy if exists "admins manage case assignments" on public.care_case_assignments;
create policy "admins manage case assignments" on public.care_case_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.notify_admins_new_application()
returns trigger language plpgsql security definer set search_path to ''
as $fn$
begin
  insert into public.notifications(user_id,title,message,type)
  select p.id,'طلب جديد على RAFIQ',
    'طلب رقم '||coalesce(new.application_number::text,'-')||' — '||
    coalesce(new.application_type,'')||' — '||
    coalesce(new.applicant_name,'')||' — '||coalesce(new.area,''),
    'new_application'
  from public.profiles p where p.role='admin' and p.status='active';
  return new;
exception when others then
  raise warning 'RAFIQ notification trigger failed: % (%)',SQLERRM,SQLSTATE;
  return new;
end $fn$;

drop trigger if exists trg_notify_admins_new_application on public.application_intakes;
create trigger trg_notify_admins_new_application after insert on public.application_intakes
for each row execute function public.notify_admins_new_application();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create or replace view public.admin_application_folders with (security_invoker=true) as
select i.id intake_id,i.application_number,i.application_type,
  case i.application_type
    when 'انتساب ممرض/ة' then 'nurse'
    when 'انتساب معالج فيزيائي' then 'physiotherapist'
    when 'انتساب مقدم رعاية' then 'caregiver'
    when 'طلب رعاية عائلية' then 'family_request'
    when 'CV + Cover Letter' then 'cv' else 'general' end category,
  case i.status when 'approved' then 'accepted' when 'rejected' then 'rejected'
    when 'review' then 'review' else 'new' end folder,
  i.status,i.applicant_name,i.phone,i.area,
  nullif(coalesce(i.payload->>'qualification',i.payload->>'service'),'') specialty,
  i.admin_decision_notes,i.created_at,i.decided_at,
  b.membership_number,b.status barcode_status
from public.application_intakes i
left join public.issued_barcodes b on b.intake_id=i.id;

create or replace view public.admin_application_folder_counts with (security_invoker=true) as
select category,folder,count(*)::int total
from public.admin_application_folders group by category,folder;
revoke all on public.admin_application_folders from anon,authenticated,public;
revoke all on public.admin_application_folder_counts from anon,authenticated,public;

create or replace function public._resolve_intake(p_ref text)
returns uuid language sql stable security definer set search_path='public'
as $fn$
  select i.id from public.application_intakes i
  left join public.issued_barcodes b on b.intake_id=i.id
  where (b.membership_number is not null and b.membership_number=upper(trim(p_ref)))
     or (trim(p_ref) ~ '^[0-9]{1,18}$' and i.application_number=trim(p_ref)::bigint)
  limit 1
$fn$;
revoke all on function public._resolve_intake(text) from public,anon,authenticated;

create or replace function public._application_card_json(p_intake_id uuid)
returns jsonb language sql stable security definer set search_path='public'
as $fn$
  select jsonb_build_object(
    'intake_id',i.id,'application_number',i.application_number,'application_type',i.application_type,
    'status',i.status,
    'folder',case i.status when 'approved' then 'accepted' when 'rejected' then 'rejected'
      when 'review' then 'review' else 'new' end,
    'membership_number',b.membership_number,'barcode_code',b.code,
    'barcode_status',b.status,'member_type',b.member_type,
    'full_name',coalesce(nullif(concat_ws(' ',nullif(i.payload->>'first',''),
      nullif(i.payload->>'father',''),nullif(i.payload->>'last','')),''),i.applicant_name),
    'mother_name',nullif(i.payload->>'mother',''),'date_of_birth',nullif(i.payload->>'dob',''),
    'address',coalesce(nullif(i.payload->>'address',''),i.area),'phone',i.phone,
    'telegram',nullif(i.payload->>'telegram',''),'social',coalesce(i.payload->'social','{}'::jsonb),
    'photo_path',(select f.storage_path from public.application_intake_files f
      where f.intake_id=i.id and f.document_category='personal_photo'
      order by f.created_at desc limit 1),
    'admin_notes',i.admin_decision_notes,'created_at',i.created_at,'decided_at',i.decided_at
  )
  from public.application_intakes i
  left join public.issued_barcodes b on b.intake_id=i.id
  where i.id=p_intake_id
$fn$;
revoke all on function public._application_card_json(uuid) from public,anon,authenticated;

create or replace function public.public_lookup_issued_barcode(p_code text)
returns jsonb language sql stable security definer set search_path='public'
as $fn$
  select jsonb_build_object('member_type',member_type,'status',status,
    'intake_id',intake_id,'membership_number',membership_number)
  from public.issued_barcodes where code=trim(p_code) and status='active' limit 1
$fn$;
revoke all on function public.public_lookup_issued_barcode(text) from public,authenticated;
grant execute on function public.public_lookup_issued_barcode(text) to anon;

create or replace function public.admin_get_member_card(p_ref text)
returns jsonb language plpgsql stable security definer set search_path='public'
as $fn$
declare v uuid;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  v:=public._resolve_intake(p_ref);
  if v is null then return null; end if;
  return public._application_card_json(v);
end
$fn$;
revoke all on function public.admin_get_member_card(text) from public,anon;
grant execute on function public.admin_get_member_card(text) to authenticated;

-- The approval RPC keeps the existing signature and now issues:
-- RFQ-<NUR|PHY|CGV|FAM|CVL|GEN>-<sequence> + cryptographically random suffix.
-- It also writes decided_at/decided_by, audit details, and queues the welcome message.
-- The full function body is maintained in the deployed database and in this migration revision.

create or replace function public.manager_folder_counts()
returns table(category text,folder text,total int)
language sql stable security definer set search_path='public'
as $fn$ select category,folder,total from public.admin_application_folder_counts order by 1,2 $fn$;

create or replace function public.manager_list_applications(
  p_category text default null,p_folder text default null,p_limit int default 20)
returns table(application_number bigint,membership_number text,full_name text,category text,folder text,area text,specialty text,created_at timestamptz)
language sql stable security definer set search_path='public'
as $fn$
  select f.application_number,f.membership_number,f.applicant_name,f.category,f.folder,
    f.area,f.specialty,f.created_at
  from public.admin_application_folders f
  where (p_category is null or f.category=p_category)
    and (p_folder is null or f.folder=p_folder)
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit,20),1),50)
$fn$;

create or replace function public.manager_get_application(p_ref text)
returns jsonb language sql stable security definer set search_path='public'
as $fn$ select public._application_card_json(public._resolve_intake(p_ref)) $fn$;

revoke all on function public.manager_folder_counts() from public,anon,authenticated;
revoke all on function public.manager_list_applications(text,text,int) from public,anon,authenticated;
revoke all on function public.manager_get_application(text) from public,anon,authenticated;
grant execute on function public.manager_folder_counts() to service_role;
grant execute on function public.manager_list_applications(text,text,int) to service_role;
grant execute on function public.manager_get_application(text) to service_role;


create or replace function public.admin_approve_application_intake(
  p_intake_id uuid,p_status text,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='public'
as $fn$
declare
  i public.application_intakes; b public.issued_barcodes;
  role_name text; type_code text; mnum text; code text; welcome text; recipient text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('review','approved','rejected') then raise exception 'invalid_status'; end if;
  select * into i from public.application_intakes where id=p_intake_id for update;
  if i.id is null then raise exception 'intake_not_found'; end if;

  if p_status='approved' then
    role_name:=case i.application_type
      when 'انتساب ممرض/ة' then 'ممرض/ة'
      when 'انتساب معالج فيزيائي' then 'معالج فيزيائي'
      when 'انتساب مقدم رعاية' then 'مقدم رعاية'
      when 'طلب رعاية عائلية' then 'عائلة'
      when 'CV + Cover Letter' then 'متقدم لوظيفة' else 'منتسب' end;
    type_code:=case i.application_type
      when 'انتساب ممرض/ة' then 'NUR'
      when 'انتساب معالج فيزيائي' then 'PHY'
      when 'انتساب مقدم رعاية' then 'CGV'
      when 'طلب رعاية عائلية' then 'FAM'
      when 'CV + Cover Letter' then 'CVL' else 'GEN' end;
    select * into b from public.issued_barcodes where intake_id=i.id for update;
    if b.id is null then
      mnum:='RFQ-'||type_code||'-'||lpad(nextval('public.rafiq_membership_seq')::text,5,'0');
      code:=mnum||'-'||upper(encode(extensions.gen_random_bytes(12),'hex'));
      insert into public.issued_barcodes(intake_id,code,code_hash,member_type,status,issued_by,membership_number)
      values(i.id,code,encode(extensions.digest(code::bytea,'sha256'),'hex'),role_name,'active',auth.uid(),mnum);
    else
      mnum:=coalesce(b.membership_number,'RFQ-'||type_code||'-'||lpad(nextval('public.rafiq_membership_seq')::text,5,'0'));
      code:=coalesce(nullif(b.code,''),mnum||'-'||upper(encode(extensions.gen_random_bytes(12),'hex')));
      update public.issued_barcodes set status='active',member_type=role_name,membership_number=mnum,
        code=code,code_hash=encode(extensions.digest(code::bytea,'sha256'),'hex'),
        issued_by=auth.uid(),updated_at=now() where id=b.id;
    end if;
    update public.application_intakes set status='approved',admin_decision_notes=p_notes,
      decided_at=now(),decided_by=auth.uid(),updated_at=now() where id=i.id;
    recipient:=regexp_replace(coalesce(i.phone,''),'[^0-9]','','g');
    welcome:='مرحباً '||coalesce(i.applicant_name,'')||' 🌿'||E'\n\n'||
      'نود إعلامك بأن طلبك للانضمام إلى منصة RAFIQ | رفيق قد تمت الموافقة عليه. ✅'||E'\n\n'||
      'الصفة: '||role_name||E'\n'||'رقم الطلب: '||coalesce(i.application_number::text,'-')||E'\n'||
      'رقم العضوية: '||mnum||E'\n'||
      'رابط بطاقتك: https://rafiq-o6qd.onrender.com/verify.html?c='||code||E'\n\n'||
      'احتفظ بهذا الرابط ولا تشاركه مع أحد، فهو بطاقة العضوية الخاصة بك لدى رفيق.';
    if recipient<>'' and not exists(select 1 from public.whatsapp_outbox w where w.intake_id=i.id and w.qr_payload=code) then
      insert into public.whatsapp_outbox(user_id,application_id,intake_id,recipient,message,qr_payload,status)
      values(null,null,i.id,recipient,welcome,code,'pending');
    end if;
    insert into public.audit_logs(user_id,action,table_name,record_id,details)
    values(auth.uid(),'application_intake_approved','application_intakes',i.id,
      jsonb_build_object('membership_number',mnum,'member_type',role_name,'notification_queued',recipient<>''));
    return jsonb_build_object('status','approved','intake_id',i.id,'barcode_code',code,
      'membership_number',mnum,'member_type',role_name,'whatsapp_phone',nullif(recipient,''),'notification_queued',recipient<>'');
  elsif p_status='rejected' then
    update public.application_intakes set status='rejected',admin_decision_notes=p_notes,
      decided_at=now(),decided_by=auth.uid(),updated_at=now() where id=i.id;
    update public.issued_barcodes set status='revoked',updated_at=now() where intake_id=i.id;
    insert into public.audit_logs(user_id,action,table_name,record_id,details)
    values(auth.uid(),'application_intake_rejected','application_intakes',i.id,jsonb_build_object('notes',p_notes));
    return jsonb_build_object('status','rejected','intake_id',i.id);
  else
    update public.application_intakes set status='review',admin_decision_notes=p_notes,updated_at=now() where id=i.id;
    return jsonb_build_object('status','review','intake_id',i.id);
  end if;
end
$fn$;
revoke all on function public.admin_approve_application_intake(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_approve_application_intake(uuid,text,text) to authenticated;

create or replace function public.manager_assign_case(
  p_case_ref text,p_member_ref text,p_assigned_by text,p_note text default null
)
returns jsonb language plpgsql security definer set search_path='public'
as $fn$
declare c public.application_intakes; m public.application_intakes; mb public.issued_barcodes; a uuid;
begin
  select * into c from public.application_intakes where id=public._resolve_intake(p_case_ref);
  if c.id is null or c.application_type<>'طلب رعاية عائلية' then raise exception 'case_not_found'; end if;
  select * into m from public.application_intakes where id=public._resolve_intake(p_member_ref);
  if m.id is null then raise exception 'member_not_found'; end if;
  select * into mb from public.issued_barcodes where intake_id=m.id and status='active' limit 1;
  if m.status<>'approved' or mb.id is null then raise exception 'member_not_approved'; end if;
  if exists(select 1 from public.care_case_assignments where case_intake_id=c.id and status='assigned') then
    raise exception 'case_already_assigned';
  end if;
  begin
    insert into public.care_case_assignments(case_intake_id,member_intake_id,assigned_by,note)
    values(c.id,m.id,p_assigned_by,p_note) returning id into a;
  exception when unique_violation then raise exception 'case_already_assigned'; end;
  insert into public.audit_logs(user_id,action,table_name,record_id,details)
  values(null,'care_case_assigned','care_case_assignments',a,
    jsonb_build_object('case_number',c.application_number,'membership_number',mb.membership_number,'assigned_by',p_assigned_by));
  return jsonb_build_object('assignment_id',a,'case_number',c.application_number,
    'membership_number',mb.membership_number,'member_name',m.applicant_name);
end
$fn$;
revoke all on function public.manager_assign_case(text,text,text,text) from public,anon,authenticated;
grant execute on function public.manager_assign_case(text,text,text,text) to service_role;
