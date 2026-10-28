# RAFIQ channel agent operations — 2026-10-27

## Scope and safety
This runbook records verified discovery from the authorized Telegram account and the current repository. It does not claim that Supabase or Cloudflare production was deployed or verified. Keep all broadcasts, WhatsApp auto-replies, automatic webhook registration, and customer-facing campaign sends disabled until the owner explicitly approves a test and the endpoint is verified. Do not create replacement groups or channels.

## Existing Telegram destinations discovered
Discovered in the connected Telegram account's dialog inventory:
- Bot: https://t.me/RAFIQ_Care_Bot (dialog title RAFIQ / رفيق; connector peer ID: 8875311665)
- Public/announcement channel: https://t.me/+a7CDblNyGKw1Yjg8 (channel title RAFIQ; Telegram signed chat ID: -1003994778849)
- Existing group: RAFIQ نصل بالحب ❤️ والامان لرعاية العائلة (dialog kind chat; connector peer ID: 5163322274)
- A second channel dialog with the same display title was found (connector peer ID: 3933771801); verify which one is the intended destination before publishing.
These IDs are observations from the connected account inventory, not a substitute for checking the bot's current API permissions or webhook.

## Existing WhatsApp destinations
- Official contact: https://wa.me/96181506299
- Official channel: https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K
- A historical WhatsApp group invitation was found in prior messages, but the invitation URL is intentionally omitted because it may grant access to the group. The owner must verify the current group and, if necessary, rotate the invitation privately before any use. Do not create a replacement group.

## Agent responsibilities
1. Answer general service questions in Arabic; support English, French, Italian, and German where existing code supports it.
2. Explain RAFIQ's service scope: elderly care, patient care, home nursing, home physiotherapy, labs, imaging, and medical equipment; never invent provider availability, prices, credentials, or a confirmed booking.
3. Collect a minimum request: service, region, schedule, and non-sensitive needs. Avoid collecting unnecessary clinical details or identification documents in Telegram.
4. Persist requests in the existing Supabase project only, with idempotency keys and audit records. Do not send a request to public channels.
5. Notify only verified, authorized admin destinations; send no customer-facing acceptance or WhatsApp reply until an admin approves it.
6. Prepare public announcements as drafts for owner approval. No broadcast on startup or automatic subscriber marketing.
7. For urgent medical symptoms, tell the person to contact local emergency services or their treating clinician immediately; do not diagnose or prescribe.
8. If database, provider, or messaging delivery fails, acknowledge only what is confirmed, record a redacted error, and avoid duplicate requests or leaking patient details.

## Current technical evidence and blockers
- Repository main contains supabase/functions/telegram-webhook/index.ts and ops/register-telegram-webhook.sh.
- The webhook implementation expects SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, a strong TELEGRAM_WEBHOOK_SECRET, admin chat IDs, and database objects including claim_telegram_update, consume_telegram_rate_limit, telegram_update_receipts, and rafiq_telegram_request_sessions. Existence and live schema were not verified in this session.
- Supabase management API calls for project qmuxaehrahfsnabyjens returned a permission error. Do not deploy or overwrite the live function until access is restored and the current function/settings have been backed up.
- The deployment runbook documents the current webhook URL: https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook
- Cloudflare Pages setup is documented in docs/recovery/RAFIQ-CLOUDFLARE-PAGES-SETUP-2026-10-14.md; this does not prove that the existing Workers service was updated.
- WhatsApp Business API does not provide general-purpose management of consumer WhatsApp groups or publishing to WhatsApp Channels. Use the official WhatsApp contact/channel for manual operations; only use Cloud API/Kapso for supported business conversations after verifying webhooks and permissions. Never use WhatsApp Web automation or Baileys.

## Required release gate
Before enabling production operation:
- Restore authorized Supabase project access; inspect current function version, environment secret names, database objects, RLS, and logs.
- Verify current Telegram webhook URL and last error using Bot API without changing it; back up the current function.
- Run synthetic request and duplicate-update tests, then one explicitly authorized test chat.
- Confirm the manager chat ID belongs to the intended admin group and bot has permission to post.
- Verify Cloudflare project/service type, build command, origin, and deployment health before publishing.
- Verify Meta/Kapso account, phone-number ID, signed webhook, subscribed events, and a test recipient. Keep auto-replies and broadcasts off.
- Record commit/build IDs and rollback path. Do not claim end-to-end integration until inbound, persistence, admin notification, approval, and delivery are observed in tests.