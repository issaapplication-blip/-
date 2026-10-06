-- RAFIQ: permanently remove rejected applicant files and keep manager folders clean.
begin;

drop policy if exists "admins delete private intake documents" on storage.objects;
create policy "admins delete private intake documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'private_documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role='admin' and p.status='active'
  )
);

drop policy if exists "application_intake_files_admin_delete" on public.application_intake_files;
create policy "application_intake_files_admin_delete"
on public.application_intake_files for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role='admin' and p.status='active'
  )
);

create or replace function public.admin_approve_application_intake(
  p_intake_id uuid,p_status text,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='public'
as $fn$
declare
  i public.application_intakes; b public.issued_barcodes;
  role_name text; type_code text; mnum text; code text; welcome text; recipient text;
  deleted_paths jsonb := '[]'::jsonb;
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
    select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into deleted_paths
      from public.application_intake_files where intake_id=i.id;
    delete from public.application_intake_files where intake_id=i.id;
    delete from public.whatsapp_outbox where intake_id=i.id;
    update public.application_intakes set status='rejected',admin_decision_notes=p_notes,
      decided_at=now(),decided_by=auth.uid(),updated_at=now() where id=i.id;
    update public.issued_barcodes set status='revoked',updated_at=now() where intake_id=i.id;
    insert into public.audit_logs(user_id,action,table_name,record_id,details)
    values(auth.uid(),'application_intake_rejected','application_intakes',i.id,
      jsonb_build_object('notes',p_notes,'deleted_file_paths',deleted_paths));
    return jsonb_build_object('status','rejected','intake_id',i.id,'deleted_file_paths',deleted_paths);
  else
    update public.application_intakes set status='review',admin_decision_notes=p_notes,updated_at=now() where id=i.id;
    return jsonb_build_object('status','review','intake_id',i.id);
  end if;
end
$fn$;

revoke all on function public.admin_approve_application_intake(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_approve_application_intake(uuid,text,text) to authenticated;

commit;