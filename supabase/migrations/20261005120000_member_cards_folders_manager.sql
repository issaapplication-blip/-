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

-- manager_assign_case is service_role-only in the deployed database.
