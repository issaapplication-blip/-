create table if not exists public.rafiq_case_assignments (
 id uuid primary key default gen_random_uuid(),
 care_request_id uuid not null references public.care_requests(id) on delete cascade,
 provider_registry_id uuid not null references public.rafiq_provider_registry(id) on delete restrict,
 status text not null default 'proposed' check(status in ('proposed','approved','rejected','active','completed','cancelled')),
 admin_notes text, assigned_by uuid references auth.users(id), assigned_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rafiq_case_assignments_request_idx on public.rafiq_case_assignments(care_request_id,status);
alter table public.rafiq_case_assignments enable row level security;
revoke all on public.rafiq_case_assignments from anon, authenticated;
