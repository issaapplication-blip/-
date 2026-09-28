-- Additive RAFIQ agent + WhatsApp runtime tables.
-- Safe to apply to the existing RAFIQ project; no data is deleted.

create table if not exists public.rafiq_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'web',
  external_conversation_id text not null,
  customer_phone text,
  language text,
  context jsonb not null default '[]'::jsonb,
  escalation_state text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create unique index if not exists rafiq_conversations_channel_external_uidx
  on public.rafiq_conversations(channel, external_conversation_id);

create index if not exists rafiq_conversations_updated_idx
  on public.rafiq_conversations(updated_at desc);

create table if not exists public.whatsapp_inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'meta',
  provider_message_id text not null,
  from_phone text,
  message_type text,
  text_body text,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists whatsapp_inbound_events_provider_message_uidx
  on public.whatsapp_inbound_events(provider, provider_message_id);

create index if not exists whatsapp_inbound_events_received_idx
  on public.whatsapp_inbound_events(received_at desc);

create table if not exists public.whatsapp_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'meta',
  provider_message_id text,
  to_phone text not null,
  body text not null,
  status text not null default 'sent',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_outbound_messages_created_idx
  on public.whatsapp_outbound_messages(created_at desc);

create table if not exists public.whatsapp_pending_approvals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  reason text not null,
  status text not null default 'open',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists whatsapp_pending_approvals_status_idx
  on public.whatsapp_pending_approvals(status, created_at desc);

alter table public.rafiq_conversations enable row level security;
alter table public.whatsapp_inbound_events enable row level security;
alter table public.whatsapp_outbound_messages enable row level security;
alter table public.whatsapp_pending_approvals enable row level security;

drop policy if exists rafiq_conversations_admin_read on public.rafiq_conversations;
create policy rafiq_conversations_admin_read on public.rafiq_conversations
for select to authenticated using (public.is_admin());

drop policy if exists whatsapp_inbound_events_admin_read on public.whatsapp_inbound_events;
create policy whatsapp_inbound_events_admin_read on public.whatsapp_inbound_events
for select to authenticated using (public.is_admin());

drop policy if exists whatsapp_outbound_messages_admin_read on public.whatsapp_outbound_messages;
create policy whatsapp_outbound_messages_admin_read on public.whatsapp_outbound_messages
for select to authenticated using (public.is_admin());

drop policy if exists whatsapp_pending_approvals_admin_read on public.whatsapp_pending_approvals;
create policy whatsapp_pending_approvals_admin_read on public.whatsapp_pending_approvals
for select to authenticated using (public.is_admin());
