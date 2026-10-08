-- RAFIQ Telegram subscriber opt-in, managed broadcast targets and request sessions.
create table if not exists public.rafiq_telegram_subscribers (
  chat_id text primary key,
  telegram_user_id text,
  username text,
  first_name text,
  last_name text,
  language text not null default 'ar',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  is_subscribed boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists rafiq_telegram_subscribers_user_id_key on public.rafiq_telegram_subscribers(telegram_user_id) where telegram_user_id is not null;
alter table public.rafiq_telegram_subscribers enable row level security;
revoke all on public.rafiq_telegram_subscribers from anon,authenticated;
grant select,insert,update on public.rafiq_telegram_subscribers to service_role;

create table if not exists public.rafiq_telegram_broadcast_targets (
  chat_id text primary key,
  chat_type text not null check (chat_type in ('group','supergroup','channel')),
  title text,
  username text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.rafiq_telegram_broadcast_targets enable row level security;
revoke all on public.rafiq_telegram_broadcast_targets from anon,authenticated;
grant select,insert,update on public.rafiq_telegram_broadcast_targets to service_role;

create table if not exists public.rafiq_telegram_request_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  chat_id text not null,
  telegram_user_id text,
  language text not null default 'ar',
  service_type text,
  area text,
  case_type text,
  schedule text,
  notes text,
  status text not null default 'collecting' check (status in ('collecting','submitted','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rafiq_telegram_request_sessions_chat_idx on public.rafiq_telegram_request_sessions(chat_id,status,updated_at desc);
alter table public.rafiq_telegram_request_sessions enable row level security;
revoke all on public.rafiq_telegram_request_sessions from anon,authenticated;
grant select,insert,update on public.rafiq_telegram_request_sessions to service_role;