-- RAFIQ: structured location fields for provider/admin sorting
alter table public.profiles add column if not exists region text;
alter table public.caregivers add column if not exists governorate text;
alter table public.caregivers add column if not exists district text;
alter table public.caregivers add column if not exists locality text;
alter table public.nurses add column if not exists governorate text;
alter table public.nurses add column if not exists district text;
alter table public.nurses add column if not exists locality text;
alter table public.physiotherapists add column if not exists governorate text;
alter table public.physiotherapists add column if not exists district text;
alter table public.physiotherapists add column if not exists locality text;