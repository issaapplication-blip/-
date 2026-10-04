-- RAFIQ Telegram campaign delivery tracking
create table if not exists public.rafiq_telegram_broadcasts (
  id uuid primary key default gen_random_uuid(),
  announcement_key text not null,
  recipient_id text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_key, recipient_id)
);

alter table public.rafiq_telegram_broadcasts enable row level security;
revoke all on public.rafiq_telegram_broadcasts from anon, authenticated;
grant select, insert, update on public.rafiq_telegram_broadcasts to service_role;
