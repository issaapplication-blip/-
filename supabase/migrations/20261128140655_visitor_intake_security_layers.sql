-- RAFIQ visitor intake and upload security controls.
-- Additive only: existing intake records, files, and storage objects are preserved.
begin;

create schema if not exists rafig_private;
revoke all on schema rafig_private from public, anon, authenticated, service_role;

create table if not exists rafig_private.public_rate_limits (
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  scope text not null check (scope in ('application_intake_10m','application_intake_24h','application_upload_10m','application_upload_24h')),
  window_started_at timestamptz not null,
  hits integer not null check (hits > 0),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (key_hash, scope)
);

create table if not exists rafig_private.application_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.application_intakes(id) on delete cascade,
  slots integer not null check (slots between 1 and 8),
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now()
);
create index if not exists application_upload_reservations_intake_expiry_idx
  on rafig_private.application_upload_reservations(intake_id, expires_at);
revoke all on all tables in schema rafig_private from public, anon, authenticated, service_role;

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
  if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_scope not in ('application_intake_10m','application_intake_24h','application_upload_10m','application_upload_24h') then
    return false;
  end if;
  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from v_now) / v_window) * v_window
  );
  insert into rafig_private.public_rate_limits as current_limit(key_hash,scope,window_started_at,hits,updated_at)
  values(p_key_hash,p_scope,v_window_start,1,v_now)
  on conflict(key_hash,scope) do update
    set window_started_at=excluded.window_started_at,
        hits=case when current_limit.window_started_at=excluded.window_started_at then current_limit.hits+1 else 1 end,
        updated_at=excluded.updated_at
  returning hits into v_hits;
  if pg_catalog.mod(pg_catalog.floor(extract(epoch from v_now))::bigint,600)=0 then
    delete from rafig_private.public_rate_limits where window_started_at < v_now - interval '48 hours';
  end if;
  return v_hits <= v_limit;
end;
$rafig$;

create or replace function public.reserve_rafig_upload_slots(p_intake_id uuid,p_slots integer)
returns uuid language plpgsql security definer set search_path = ''
as $rafig$
declare v_existing integer; v_reserved integer; v_reservation_id uuid;
begin
  if p_intake_id is null or p_slots is null or p_slots < 1 or p_slots > 8 then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_intake_id::text,0));
  perform 1 from public.application_intakes i
    where i.id=p_intake_id and i.application_type='CV + Cover Letter' and i.status in ('pending','review')
    for update;
  if not found then return null; end if;
  delete from rafig_private.application_upload_reservations
    where intake_id=p_intake_id and expires_at <= pg_catalog.now();
  select count(*)::integer into v_existing from public.application_intake_files f where f.intake_id=p_intake_id;
  select coalesce(sum(r.slots),0)::integer into v_reserved
    from rafig_private.application_upload_reservations r
    where r.intake_id=p_intake_id and r.expires_at > pg_catalog.now();
  if v_existing+v_reserved+p_slots>8 then return null; end if;
  insert into rafig_private.application_upload_reservations(intake_id,slots,expires_at)
    values(p_intake_id,p_slots,pg_catalog.now()+interval '10 minutes')
    returning id into v_reservation_id;
  return v_reservation_id;
end;
$rafig$;

create or replace function public.release_rafig_upload_slots(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $rafig$
declare v_rows integer;
begin
  if p_reservation_id is null then return false; end if;
  delete from rafig_private.application_upload_reservations where id=p_reservation_id;
  get diagnostics v_rows = row_count;
  return v_rows=1;
end;
$rafig$;

revoke all on function public.consume_rafig_public_rate_limit(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.reserve_rafig_upload_slots(uuid,integer) from public,anon,authenticated;
revoke all on function public.release_rafig_upload_slots(uuid) from public,anon,authenticated;
grant execute on function public.consume_rafig_public_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.reserve_rafig_upload_slots(uuid,integer) to service_role;
grant execute on function public.release_rafig_upload_slots(uuid) to service_role;
commit;
