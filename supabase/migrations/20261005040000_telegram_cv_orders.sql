-- RAFIQ Telegram CV mini-platform.
-- Payment must be confirmed by an admin before final delivery.
create table if not exists public.rafiq_telegram_cv_orders (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  telegram_user_id text,
  username text,
  service text not null check (service in ('cv','cover','bundle')),
  amount_usd numeric(10,2) not null,
  extra_language text,
  full_name text,
  target_job text,
  experience text,
  old_cv_file_id text,
  payment_proof_file_id text,
  payment_proof_type text,
  payment_status text not null default 'pending_payment' check (payment_status in ('pending_payment','proof_submitted','confirmed','rejected')),
  order_status text not null default 'collecting' check (order_status in ('collecting','awaiting_payment','payment_review','in_progress','completed','cancelled')),
  final_document_file_id text,
  final_document_type text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rafiq_telegram_cv_orders_chat_idx on public.rafiq_telegram_cv_orders(chat_id, updated_at desc);
create index if not exists rafiq_telegram_cv_orders_payment_idx on public.rafiq_telegram_cv_orders(payment_status, order_status);
alter table public.rafiq_telegram_cv_orders enable row level security;
revoke all on public.rafiq_telegram_cv_orders from anon, authenticated;
grant select, insert, update on public.rafiq_telegram_cv_orders to service_role;
