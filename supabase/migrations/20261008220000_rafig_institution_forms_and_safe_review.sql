begin;

create table if not exists public.institution_intakes (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique default ('INST-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  institution_type text not null check (institution_type in ('laboratory','radiology_center','medical_equipment_center')),
  institution_name text not null,
  contact_name text not null,
  phone text not null,
  email text,
  address text,
  governorate text,
  district text,
  locality text,
  license_number text,
  services text,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','review','approved','rejected')),
  admin_decision_notes text,
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.institution_intakes enable row level security;
revoke all on public.institution_intakes from anon, public;
grant select, update on public.institution_intakes to authenticated;
drop policy if exists institution_intakes_admin_select on public.institution_intakes;
create policy institution_intakes_admin_select on public.institution_intakes for select to authenticated using (public.is_admin());
drop policy if exists institution_intakes_admin_update on public.institution_intakes;
create policy institution_intakes_admin_update on public.institution_intakes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create index if not exists institution_intakes_status_created_idx on public.institution_intakes(status, created_at desc);
create index if not exists institution_intakes_type_created_idx on public.institution_intakes(institution_type, created_at desc);

create table if not exists public.institution_intake_files (
  id uuid primary key default gen_random_uuid(),
  institution_intake_id uuid not null references public.institution_intakes(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  document_category text,
  verification_status text not null default 'pending' check (verification_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.institution_intake_files enable row level security;
revoke all on public.institution_intake_files from anon, public;
grant select, update on public.institution_intake_files to authenticated;
drop policy if exists institution_intake_files_admin_select on public.institution_intake_files;
create policy institution_intake_files_admin_select on public.institution_intake_files for select to authenticated using (public.is_admin());
drop policy if exists institution_intake_files_admin_update on public.institution_intake_files;
create policy institution_intake_files_admin_update on public.institution_intake_files for update to authenticated using (public.is_admin()) with check (public.is_admin());
create index if not exists institution_intake_files_intake_idx on public.institution_intake_files(institution_intake_id, created_at desc);

create or replace function public.admin_approve_application_intake(p_intake_id uuid,p_status text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public
as $fn$
declare i public.application_intakes; member_type text; prefix text; member_number text; code text; existing_code text; result jsonb;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('pending','review','approved','rejected') then raise exception 'invalid_status'; end if;
  select * into i from public.application_intakes where id=p_intake_id for update;
  if i.id is null then raise exception 'intake_not_found'; end if;
  if p_status='approved' then
    if i.application_type='انتساب مقدم رعاية' then member_type:='caregiver'; prefix:='CG';
    elsif i.application_type='انتساب ممرض/ة' then member_type:='nurse'; prefix:='NR';
    elsif i.application_type='انتساب معالج فيزيائي' then member_type:='physiotherapist'; prefix:='PT';
    else member_type:=null; prefix:='MB'; end if;
    if member_type is not null then
      select code into existing_code from public.issued_barcodes where intake_id=i.id and status='active' order by created_at desc limit 1;
      code:=coalesce(existing_code,'RAFIQ-'||prefix||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)));
      member_number:='RAFIQ-'||prefix||'-'||lpad(coalesce(i.application_number,0)::text,6,'0');
      insert into public.issued_barcodes(intake_id,code,code_hash,member_type,status,issued_at,issued_by,membership_number,updated_at)
      values(i.id,code,encode(digest(code,'sha256'),'hex'),member_type,'active',now(),auth.uid(),member_number,now())
      on conflict (intake_id) do update set code=excluded.code,code_hash=excluded.code_hash,member_type=excluded.member_type,status='active',issued_at=now(),issued_by=auth.uid(),membership_number=excluded.membership_number,updated_at=now();
      insert into public.rafiq_provider_registry(intake_id,application_number,member_number,barcode_code,member_type,status,full_name,address,area,phone,whatsapp_phone,telegram_phone,telegram_username,platform_role,specialty,qualification,experience,languages,services,availability,admin_notes,approved_by,approved_at,updated_at)
      values(i.id,i.application_number,member_number,code,member_type,'approved',i.applicant_name,null,i.area,i.phone,i.phone,null,null,member_type,coalesce(i.payload->>'specialty',null),coalesce(i.payload->>'qualification',null),coalesce(i.payload->>'experience',null),coalesce(i.payload->>'languages',null),coalesce(i.payload->>'services',null),coalesce(i.payload->>'availability',null),p_notes,auth.uid(),now(),now())
      on conflict (intake_id) do update set member_number=excluded.member_number,barcode_code=excluded.barcode_code,member_type=excluded.member_type,status='approved',admin_notes=excluded.admin_notes,approved_by=auth.uid(),approved_at=now(),updated_at=now();
      result:=jsonb_build_object('barcode_code',code,'membership_number',member_number,'member_type',member_type);
    else result:='{}'::jsonb; end if;
  else result:='{}'::jsonb; end if;
  update public.application_intakes set status=p_status,admin_decision_notes=coalesce(p_notes,admin_decision_notes),decided_at=case when p_status in ('approved','rejected') then now() else decided_at end,decided_by=case when p_status in ('approved','rejected') then auth.uid() else decided_by end,updated_at=now() where id=i.id;
  insert into public.audit_logs(user_id,action,table_name,record_id,details) values(auth.uid(),'admin_intake_review_'||p_status,'application_intakes',i.id,jsonb_build_object('application_number',i.application_number,'status',p_status,'notes',p_notes));
  return result||jsonb_build_object('status',p_status,'intake_id',i.id,'application_number',i.application_number,'deleted_file_paths',jsonb_build_array());
end $fn$;
revoke all on function public.admin_approve_application_intake(uuid,text,text) from public,anon;
grant execute on function public.admin_approve_application_intake(uuid,text,text) to authenticated;

create or replace function public.admin_institution_review(p_institution_id uuid,p_status text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public
as $fn$
declare r public.institution_intakes;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('pending','review','approved','rejected') then raise exception 'invalid_status'; end if;
  select * into r from public.institution_intakes where id=p_institution_id for update;
  if r.id is null then raise exception 'institution_not_found'; end if;
  update public.institution_intakes set status=p_status,admin_decision_notes=coalesce(p_notes,admin_decision_notes),decided_at=case when p_status in ('approved','rejected') then now() else decided_at end,decided_by=case when p_status in ('approved','rejected') then auth.uid() else decided_by end,updated_at=now() where id=r.id;
  insert into public.audit_logs(user_id,action,table_name,record_id,details) values(auth.uid(),'institution_review_'||p_status,'institution_intakes',r.id,jsonb_build_object('request_id',r.request_id,'institution_type',r.institution_type,'status',p_status,'notes',p_notes));
  return jsonb_build_object('status',p_status,'request_id',r.request_id);
end $fn$;
revoke all on function public.admin_institution_review(uuid,text,text) from public,anon;
grant execute on function public.admin_institution_review(uuid,text,text) to authenticated;

commit;