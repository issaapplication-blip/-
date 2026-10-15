# RAFIQ environment variable template (names only; no values)

## Runtime
- `PORT=7860` — container default
- `HOST=0.0.0.0` — container default
- `NODE_ENV=production`

## Supabase
- `SUPABASE_URL` — existing project URL: https://qmuxaehrahfsnabyjens.supabase.co
- `SUPABASE_ANON_KEY` — public/anon key; browser exposure only where intended and protected by RLS
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never expose to browser, commit, or log

## Telegram — server secret settings only
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_MANAGER_CHAT_IDS` (optional; restrict access)
- `RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK=false` by default; keep false until explicit cutover
- `TELEGRAM_MARKETING_ENABLED=false` by default
- `TELEGRAM_BROADCAST_ON_START=false` by default

## WhatsApp / Kapso / Meta — disabled during migration
- `KAPSO_ENABLED=false`
- `WHATSAPP_SENDING_ENABLED=false`
- `RAFIQ_WHATSAPP_AUTO_REPLY=false`
- `RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING=false`
- `KAPSO_API_KEY` (only if later approved)
- `KAPSO_WEBHOOK_SECRET` (only if later approved)
- `META_ACCESS_TOKEN` (only if later approved)
- `META_APP_SECRET` (only if later approved)
- `META_VERIFY_TOKEN` (only if later approved)

## Optional Cloudflare Workers AI
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — narrowly scoped token; server-side only
- `CLOUDFLARE_AI_MODEL` (optional)

## Rules
- Store secret values only in hosting-provider secret settings.
- Never paste tokens into chat, source files, GitHub issues, or logs.
- Do not use the old Supabase project `nyrwfxqitxrspfvshejb`.
- These are names and safety defaults, not proof that a hosting environment is configured.
