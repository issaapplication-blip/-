-- RAFIQ admin review and private document access.
-- Applied to Supabase project qmuxaehrahfsnabyjens.

drop policy if exists "Admins can view all applications" on public.applications;
create policy "Admins can view all applications" on public.applications
for select to authenticated using ((select public.is_admin()));

drop policy if exists "Admins can view all documents" on public.documents;
create policy "Admins can view all documents" on public.documents
for select to authenticated using ((select public.is_admin()));

drop function if exists public.admin_review_application(uuid,text,text);
create function public.admin_review_application(
  p_application_id uuid,p_status text,p_notes text default null
) returns void language plpgsql security definer set search_path=''
as $$
begin
 if not (select public.is_admin()) then raise exception 'admin access required'; end if;
 if p_status not in ('pending','review','approved','rejected') then raise exception 'invalid application status'; end if;
 update public.applications set status=p_status,notes=coalesce(p_notes,notes),updated_at=now() where id=p_application_id;
 if not found then raise exception 'application not found'; end if;
 insert into public.audit_logs(user_id,action,target_type,target_id,details)
 values ((select auth.uid()),'admin_review_application','application',p_application_id,jsonb_build_object('status',p_status,'notes',p_notes));
end $$;

drop function if exists public.admin_review_document(uuid,text);
create function public.admin_review_document(
 p_document_id uuid,p_status text
) returns void language plpgsql security definer set search_path=''
as $$
begin
 if not (select public.is_admin()) then raise exception 'admin access required'; end if;
 if p_status not in ('pending','approved','rejected') then raise exception 'invalid document status'; end if;
 update public.documents set verification_status=p_status where id=p_document_id;
 if not found then raise exception 'document not found'; end if;
 insert into public.audit_logs(user_id,action,target_type,target_id,details)
 values ((select auth.uid()),'admin_review_document','document',p_document_id,jsonb_build_object('status',p_status));
end $$;

revoke execute on function public.admin_review_application(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.admin_review_document(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_review_application(uuid,text,text) to authenticated;
grant execute on function public.admin_review_document(uuid,text) to authenticated;

drop policy if exists "admin_read_intake_documents" on storage.objects;
drop policy if exists "admin_read_private_documents" on storage.objects;
create policy "admin_read_private_documents" on storage.objects
for select to authenticated using (bucket_id='private_documents' and (select public.is_admin()));
