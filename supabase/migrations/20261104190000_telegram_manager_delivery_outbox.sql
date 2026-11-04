-- Durable per-manager Telegram delivery receipts for RAFIQ requests.
-- This migration is additive; it does not modify or delete existing request data.
create table if not exists public.rafiq_telegram_manager_deliveries (
  request_id text not null references public.rafiq_telegram_request_sessions(request_id) on delete cascade,
  manager_chat_id text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  telegram_message_id bigint,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_id, manager_chat_id)
);

create index if not exists rafiq_telegram_manager_deliveries_status_idx
  on public.rafiq_telegram_manager_deliveries(status, updated_at);

alter table public.rafiq_telegram_manager_deliveries enable row level security;
revoke all on public.rafiq_telegram_manager_deliveries from anon, authenticated;
grant select, insert, update on public.rafiq_telegram_manager_deliveries to service_role;
