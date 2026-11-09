# RAFIQ Telegram integration — current architecture (2026-11-09)

## Active identity and channel
- Existing bot: `@RAFIQ_Care_Bot` — https://t.me/RAFIQ_Care_Bot
- Existing Telegram channel: https://t.me/+a7CDblNyGKw1Yjg8
- No replacement bot is created.
- The bot's directory keyboard includes the existing Telegram channel invite as a direct URL button (PR #87); the welcome text also includes the invite.

## Supported webhook
The only supported production receiver is the existing Supabase Edge Function in the existing project:

- Project ref: `qmuxaehrahfsnabyjens`
- Function: `telegram-webhook`
- URL: `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook`
- Source: `supabase/functions/telegram-webhook/index.ts`
- Required server-side secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and the existing Supabase service credential injected into the function runtime.
- The function validates Telegram's `X-Telegram-Bot-Api-Secret-Token` header itself. Verify the Supabase function's gateway setting is `verify_jwt=false` before relying on Telegram delivery, because Telegram does not send a Supabase user JWT.

Do not create a new Supabase project or a separate D1 database.

## Bot behavior in main
- `/start`, `/help`, `/services`, `/directory`, and `/areas` show the medical-directory categories and covered areas.
- Categories: laboratories, imaging/radiology, physiotherapy, medical-equipment sales, and medical-equipment rental.
- `/cv` opens the separate CV and Cover Letter contact/pricing path.
- `/request`, `/apply`, `/register`, and `/stop` no longer create care/provider application sessions.
- Centre names, offers, discounts, and codes must not be invented; only publish items after admin approval.
- WhatsApp is manual-only. Do not configure Meta, Kapso, WhatsApp Cloud API, or WhatsApp webhooks.

## Telegram channel publishing
The current agreed mode is manual publishing after admin approval. A public channel link in the bot menu does not require the bot to be a channel administrator.

If a later, separately approved feature should publish approved centre advertisements automatically, the channel owner must add the existing bot as an administrator with only the required `can_post_messages` right, and the implementation must store the real channel chat ID in a server-side setting. Do not grant edit/delete/admin-management rights unless separately required and approved. Do not enable automatic publishing by merely adding the bot to the channel.

## Deployment and webhook registration — do this only after Supabase access is restored
1. Read the deployed `telegram-webhook` function and confirm its `verify_jwt=false` gateway setting. Check the existing `telegram_update_receipts`, `claim_telegram_update`, and `consume_telegram_rate_limit` dependencies; do not run migrations unless a read-only check proves one is missing and the user separately approves the schema change.
2. Confirm the existing project's secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are already present. Never copy either value into chat or GitHub. The webhook secret must be 32–256 Telegram-supported characters.
3. Deploy only `telegram-webhook` from `main` to the existing project. Do not deploy the whole project or touch unrelated functions.
4. After successful deployment and a signed verification, run `bash ops/register-telegram-webhook.sh` locally. It prompts for secrets without echoing them, registers the existing Supabase URL, keeps `drop_pending_updates=false`, and checks `getWebhookInfo`.
5. Verify the reported webhook URL equals the Supabase function URL and that Telegram reports no last error. Then test `/start`, `/services`, `/areas`, and `/cv` from the existing bot account.
6. Never point the bot to `/api/telegram/webhook`, Render, or a placeholder URL.

## Retired alternative
The old Cloudflare Pages + D1 webhook was an unused competing path that collected care requests. It is now retired with HTTP 410. Its migration and registration helper are removed. Do not create `RAFIQ_DB`, do not apply `migrations/0001_telegram_d1.sql`, and do not run `ops/register-cloudflare-telegram-webhook.sh`.

## Current verification boundary
PR #86 is merged to `main`. The Supabase connector rejected project reads in the current session, and the Telepath archive did not expose this bot or the invite-only channel. Therefore the deployed Edge Function version, bot token/secrets, actual webhook registration, and channel administrator permissions remain unverified. No live webhook was changed by this repository cleanup.
