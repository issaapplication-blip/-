-- Harden public visitor telemetry function grants and search paths.
begin;
alter table rafig_private.public_rate_limits drop constraint public_rate_limits_scope_check;
alter table rafig_private.public_rate_limits add constraint public_rate_limits_scope_check check (scope in (
  'application_intake_10m','application_intake_24h','application_upload_10m','application_upload_24h','pwa_install_10m','pwa_install_24h'
));
create or replace function public.consume_rafig_public_rate_limit(p_key_hash text,p_scope text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = ''
as $rafig$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window integer := greatest(60, least(coalesce(p_window_seconds,600),86400));
  v_limit integer := greatest(1, least(coalesce(p_limit,10),1000));
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$' or p_scope is null
     or p_scope not in ('application_intake_10m','application_intake_24h','application_upload_10m','application_upload_24h','pwa_install_10m','pwa_install_24h') then
    return false;
  end if;
  v_window_start := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from v_now)/v_window)*v_window);
  insert into rafig_private.public_rate_limits as current_limit(key_hash,scope,window_started_at,hits,updated_at)
  values(p_key_hash,p_scope,v_window_start,1,v_now)
  on conflict(key_hash,scope) do update
    set window_started_at=excluded.window_started_at,
        hits=case when current_limit.window_started_at=excluded.window_started_at then current_limit.hits+1 else 1 end,
        updated_at=excluded.updated_at
  returning hits into v_hits;
  if pg_catalog.mod(pg_catalog.floor(extract(epoch from v_now))::bigint,600)=0 then
    delete from rafig_private.public_rate_limits where window_started_at<v_now-interval '48 hours';
  end if;
  return v_hits<=v_limit;
end;
$rafig$;
alter function public.public_member_barcode(text) set search_path='';
alter function public.public_member_count() set search_path='';
revoke execute on function public.public_member_barcode(text) from authenticated;
revoke execute on function public.public_member_count() from authenticated;
revoke all on function public.record_pwa_install(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_pwa_install(uuid,text,text,text,text,text) to service_role;
alter function public.record_pwa_install(uuid,text,text,text,text,text) set search_path='';
commit;
