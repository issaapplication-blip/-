# RAFIQ cleanup and Telegram status — 2026-11-09

## Completed and merged
- PR #86 merged into `main` as commit `036e12ce1d668f30c79ce2fabc240b81e348da23`.
- Removed public non-CV care/provider/member/centre application flows and links.
- Preserved the dedicated CV & Cover Letter page, payment workflow, `src/telegram-cv.ts`, and its existing order migration.
- Restricted public intake/upload code to CV + Cover Letter and payment proof.
- Restricted the protected admin intake screen to CV records; decision actions do not send automatic WhatsApp/Telegram messages.
- Updated Supabase Telegram webhook source to medical directory categories/regions, with `/cv` separate and no care-request sessions.
- Retired Meta/Kapso runtime routes and outbound WhatsApp API sending. WhatsApp remains manual-only.
- Disabled legacy Telegram manager application/broadcast commands and scheduled/startup broadcasts.
- Replaced old public member-barcode lookup with a safe notice while a new one-time discount-code verification flow is still to be designed.
- PWA manifest, service worker, sitemap, and regression tests updated.

## Telegram channel shortcut
- PR #87 adds the official Telegram channel URL as a direct button in the bot's directory keyboard.
- It does not post to the channel or change the bot's administrator permissions.
- The current channel posting policy remains manual after admin approval.

## Existing public links
- Telegram bot: https://t.me/RAFIQ_Care_Bot
- Telegram channel: https://t.me/+a7CDblNyGKw1Yjg8
- WhatsApp channel: https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K
- WhatsApp contact: https://wa.me/96181506299

## Outstanding production connection
The Supabase MCP connector rejected read access to project `qmuxaehrahfsnabyjens` with a permission error. Therefore the following were not verified or changed:
- Live Edge Function version and `verify_jwt` gateway setting.
- Existing `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` presence.
- Actual Telegram webhook URL and `getWebhookInfo`.
- Actual bot administrator status and channel permissions.

No Supabase deployment, secret mutation, table/row/storage change, migration, or webhook update was performed. No Meta account was accessed and no real Telegram message or channel post was sent.

## Required safe sequence once Supabase access is restored
1. Read the current function and its runtime configuration.
2. Confirm the existing database contains `telegram_update_receipts`, `claim_telegram_update`, and `consume_telegram_rate_limit`; do not add migrations unless a missing dependency is proven and a separate database-change approval is obtained.
3. Confirm the existing secrets are present without revealing their values.
4. Deploy only `telegram-webhook` to the existing project, with Telegram-compatible function auth settings.
5. Register the single Telegram webhook using `ops/register-telegram-webhook.sh`, keep pending updates, and verify the returned URL.
6. Manually open the bot, test `/start`, `/services`, `/areas`, and `/cv`, and verify the channel shortcut opens the official channel.
