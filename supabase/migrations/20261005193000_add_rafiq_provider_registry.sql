create table if not exists public.rafiq_provider_registry (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid unique references public.application_intakes(id) on delete set null,
  application_number bigint,
  member_number text unique,
  barcode_code text unique,
  member_type text not null check (member_type in ('caregiver','nurse','physiotherapist')),
  status text not null default 'pending' check (status in ('pending','review','approved','rejected','suspended')),
  full_name text, mother_name text, father_name text, birth_date date, photo_storage_path text,
  address text, area text, phone text, whatsapp_phone text, telegram_phone text, telegram_username text,
  platform_role text, specialty text, qualification text, experience text, languages text, services text, availability text,
  admin_notes text, approved_by uuid references auth.users(id), approved_at timestamptz, rejected_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rafiq_provider_registry_status_idx on public.rafiq_provider_registry(status);
create index if not exists rafiq_provider_registry_type_status_idx on public.rafiq_provider_registry(member_type,status);
alter table public.rafiq_provider_registry enable row level security;
revoke all on public.rafiq_provider_registry from anon, authenticated;
