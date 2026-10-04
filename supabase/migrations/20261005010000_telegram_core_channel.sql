-- Telegram is a second channel into the existing RAFIQ Core.
-- No data is deleted or replaced.

create unique index if not exists rafiq_conversations_channel_external_unique
  on public.rafiq_conversations(channel, external_conversation_id);

create index if not exists rafiq_conversations_channel_updated_idx
  on public.rafiq_conversations(channel, updated_at desc);

drop policy if exists rafiq_conversations_admin_read on public.rafiq_conversations;
create policy rafiq_conversations_admin_read on public.rafiq_conversations
for select to authenticated using (public.is_admin());

