begin;

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text,
  phone text not null,
  address text not null,
  locality text,
  district text not null,
  governorate text not null,
  ownership_type text not null default 'unknown'
    check (ownership_type in ('public','private','unknown')),
  latitude double precision,
  longitude double precision,
  source_name text not null default 'وزارة الصحة العامة اللبنانية — دليل المنشآت الصحية',
  source_url text not null,
  source_verified_at timestamptz not null default now(),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospitals_phone_not_blank check (length(trim(phone)) > 0),
  constraint hospitals_address_not_blank check (length(trim(address)) > 0),
  constraint hospitals_coordinates_pair check (
    (latitude is null and longitude is null)
    or
    (latitude between -90 and 90 and longitude between -180 and 180)
  )
);

comment on table public.hospitals is
  'RAFIQ public hospital directory. Only hospitals are included; other provider categories remain out of scope until separate agreements.';
comment on column public.hospitals.is_published is
  'Public directory visibility. Does not indicate a commercial partnership or endorsement.';
comment on column public.hospitals.latitude is
  'Verified map coordinate only. Null until a precise location is confirmed.';
comment on column public.hospitals.address is
  'Published address/location text. District-level addresses are explicitly labeled until a street address is confirmed.';

create index if not exists hospitals_region_idx
  on public.hospitals(governorate, district, locality);
create index if not exists hospitals_published_name_idx
  on public.hospitals(name_ar)
  where is_published is true;

alter table public.hospitals enable row level security;
revoke all on table public.hospitals from public, anon, authenticated;
grant select on table public.hospitals to anon;
grant select, insert, update, delete on table public.hospitals to authenticated;

drop policy if exists hospitals_public_read on public.hospitals;
create policy hospitals_public_read
  on public.hospitals for select
  to anon, authenticated
  using (is_published is true);

drop policy if exists hospitals_admin_read_all on public.hospitals;
create policy hospitals_admin_read_all
  on public.hospitals for select
  to authenticated
  using (public.is_admin());

drop policy if exists hospitals_admin_insert on public.hospitals;
create policy hospitals_admin_insert
  on public.hospitals for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists hospitals_admin_update on public.hospitals;
create policy hospitals_admin_update
  on public.hospitals for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists hospitals_admin_delete on public.hospitals;
create policy hospitals_admin_delete
  on public.hospitals for delete
  to authenticated
  using (public.is_admin());

insert into public.hospitals
  (slug,name_ar,name_en,phone,address,locality,district,governorate,ownership_type,source_url,is_published)
values
('taanayel-general','مستشفى تعنايل العام','Taanayel General Hospital','08/545199; 08/545100','زحلة، محافظة البقاع، لبنان','تعنايل','زحلة','البقاع','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('khoury-general','مستشفى خوري العام - مركز الأطباء','Khoury General Hospital - Doctors Center','08/811181; 08/807000','زحلة، محافظة البقاع، لبنان','زحلة','زحلة','البقاع','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('bekaa-hospital','مستشفى البقاع','Bekaa Hospital','08/543150/2','زحلة، محافظة البقاع، لبنان','تعلبايا','زحلة','البقاع','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('tel-chiha','مستشفى تل شيحا','Tel Chiha Hospital','08/807782/3; 08/802172','زحلة، محافظة البقاع، لبنان','زحلة','زحلة','البقاع','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('nazareth-hospital','مستشفى الناصرة - جمعية الهلال الأحمر الفلسطيني','Al-Nazareth Hospital - Palestine Red Crescent','08/510793','زحلة، محافظة البقاع، لبنان','زحلة','زحلة','البقاع','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('bashamoun-specialized','مستشفى بشامون التخصصي','Bashamoun Specialized Hospital','05/270970','بشامون، قضاء عاليه، محافظة جبل لبنان، لبنان','بشامون','عاليه','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('watani-hospital','المستشفى الوطني','Al-Watani Hospital','05/557880/1/2/5','عاليه، محافظة جبل لبنان، لبنان','عاليه','عاليه','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('lebanese-eye-hospital','مستشفى العيون اللبناني','Lebanese Eye Hospital','05/557355','عاليه، محافظة جبل لبنان، لبنان','عاليه','عاليه','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('medical-2000','مستشفى ميديكال 2000','Medical 2000 Hospital','05/432525','عاليه، محافظة جبل لبنان، لبنان','عاليه','عاليه','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('azzounieh-sanatorium','مستشفى العزونية - مصح الأرمن','Azzounieh Armenian Sanatorium','05/220160','العزونية، قضاء عاليه، محافظة جبل لبنان، لبنان','العزونية','عاليه','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('jabal-hospital','مستشفى الجبل','Al-Jabal Hospital','05/360555','عاليه، محافظة جبل لبنان، لبنان','عاليه','عاليه','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('iman-hospital','مستشفى الإيمان','Al-Iman Hospital','05/554264; 05/555692','عاليه، محافظة جبل لبنان، لبنان','عاليه','عاليه','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('bahman-hospital','مستشفى بهمن','Bahman Hospital','01/545000; 01/544000','حارة حريك، قضاء بعبدا، محافظة جبل لبنان، لبنان','حارة حريك','بعبدا','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('rasoul-azam','مستشفى الرسول الأعظم','Al-Rasoul Al-Aazam Hospital','01/456456; 01/452700','قضاء بعبدا، محافظة جبل لبنان، لبنان','بعبدا','بعبدا','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('sahel-hospital','مستشفى الساحل','Sahel General Hospital','01/858333; 01/858340','الغبيري، قضاء بعبدا، محافظة جبل لبنان، لبنان','الغبيري','بعبدا','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('dr-mohammad-khaled','مؤسسة الدكتور محمد خالد الاجتماعية','Dr. Mohammad Khaled Social Foundation','01/851934; 01/852933','قضاء بعبدا، محافظة جبل لبنان، لبنان','بعبدا','بعبدا','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=80',true),
('baakleen-hospital','مستشفى بعقلين','Baakleen Hospital','05/300882; 05/300883','بعقلين، قضاء الشوف، محافظة جبل لبنان، لبنان','بعقلين','الشوف','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=82',true),
('hopital-maritime-jbeil','مستشفى مارتيـم جبيل','Hopital Maritime Jbeil','09/540017','جبيل، محافظة جبل لبنان، لبنان','جبيل','جبيل','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=82',true),
('saint-michel-amchit','مستشفى سان ميشال - عمشيت','Hopital Saint-Michel Amchit','09/621033; 09/621034','عمشيت، قضاء جبيل، محافظة جبل لبنان، لبنان','عمشيت','جبيل','جبل لبنان','private','https://staging.moph.menaws.com/en/Pages/3/20129/%D8%AA%D9%88%D8%B2%D9%91%D8%B9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A7%D9%84%D8%B5%D8%AD%D9%8A%D9%91%D8%A9-20000?page=82',true)
on conflict (slug) do nothing;

commit;