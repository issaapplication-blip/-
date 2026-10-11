-- RAFIQ capacity readiness: safe TEST-only isolation and query indexes.
-- Existing production rows are retained and are classified as real by default.
alter table public.application_intakes add column if not exists is_test boolean not null default false;
alter table public.institution_intakes add column if not exists is_test boolean not null default false;
alter table public.rafiq_telegram_request_sessions add column if not exists is_test boolean not null default false;
alter table public.care_requests add column if not exists is_test boolean not null default false;

create index if not exists application_intakes_status_created_idx on public.application_intakes (status, created_at desc);
create index if not exists application_intakes_type_status_created_idx on public.application_intakes (application_type, status, created_at desc);
create index if not exists application_intakes_area_created_idx on public.application_intakes (area, created_at desc);
create index if not exists application_intakes_test_status_created_idx on public.application_intakes (is_test, status, created_at desc);
create index if not exists application_intake_files_intake_created_idx on public.application_intake_files (intake_id, created_at desc);
create index if not exists institution_intakes_type_status_created_idx on public.institution_intakes (institution_type, status, created_at desc);
create index if not exists institution_intakes_region_created_idx on public.institution_intakes (governorate, district, locality, created_at desc);
create index if not exists institution_intakes_test_status_created_idx on public.institution_intakes (is_test, status, created_at desc);
create index if not exists rafiq_provider_registry_status_type_area_idx on public.rafiq_provider_registry (status, member_type, area);
create index if not exists rafiq_telegram_request_sessions_chat_status_created_idx on public.rafiq_telegram_request_sessions (chat_id, status, created_at desc);
create index if not exists care_requests_test_status_created_idx on public.care_requests (is_test, status, created_at desc);

-- Keep application and institution intake documents protected by existing admin-only RLS.
alter table public.application_intakes enable row level security;
alter table public.application_intake_files enable row level security;
alter table public.institution_intakes enable row level security;
alter table public.institution_intake_files enable row level security;
