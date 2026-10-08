begin;
create or replace function public.admin_delete_application_intake(p_intake_id uuid)
returns jsonb language plpgsql security definer set search_path='public'
as $fn$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  raise exception 'application_deletion_disabled';
end
$fn$;
revoke all on function public.admin_delete_application_intake(uuid) from public,anon,authenticated;
commit;