# RAFIQ Telegram Bot on Cloudflare Pages (without Supabase)

Adds POST /api/telegram/webhook and a GET health response. This handler does not call Supabase, Render, WhatsApp, or another external database. Request workflow data is stored in Cloudflare D1 after configuring the binding and migration.

## Safety and behavior

- Only private Telegram chats are processed; group/channel updates are ignored.
- Requests require Telegram's X-Telegram-Bot-Api-Secret-Token header.
- Body limit: 256 KiB. Per-chat rate limit: 12 updates/minute. Stalled webhook receipt claims can be reclaimed after 120 seconds.
- Raw updates, usernames, profile names, phone numbers, and message history are not persisted.
- A request stores only service, area, schedule, Telegram chat ID, request ID, status, and timestamps.
- Requests are marked new; they are not bookings and do not trigger WhatsApp messages.
- Admin notices contain request ID, service, area, schedule, and Telegram chat ID so approved administrators can follow up through the bot. Do not add this ID to public pages or public channels.
- /stop deletes an unfinished request session. No broadcast/marketing command is included.

## Configure Cloudflare

1. Create a D1 database in the same Cloudflare account as the Pages project:
   npx wrangler@latest d1 create rafiq-telegram
2. Bind it to the RAFIQ Pages project:
   Dashboard > Workers & Pages > RAFIQ Pages project > Settings > Bindings > Add > D1 database.
   Variable name: RAFIQ_DB. Select database: rafiq-telegram, then redeploy so the binding takes effect.
3. Apply the schema from the repository root:
   npx wrangler@latest d1 execute rafiq-telegram --remote --file=migrations/0001_telegram_d1.sql
4. Add encrypted secrets in Settings > Variables and Secrets > Add (Production; Preview only with a test bot):
   TELEGRAM_BOT_TOKEN
   TELEGRAM_WEBHOOK_SECRET (32–256 chars; A–Z, a–z, 0–9, underscore, hyphen)
   TELEGRAM_MANAGER_CHAT_IDS (comma-separated numeric admin chat IDs; preserve the minus sign for supergroups)
5. Deploy this branch to a Pages Preview deployment first. Do not replace the current production webhook until Preview is verified.

If using Wrangler configuration instead of Dashboard bindings, add a D1 binding in wrangler.toml with the exact database_id returned by Cloudflare. Never commit placeholders or secrets.

## Register only after deployment

Run bash ops/register-cloudflare-telegram-webhook.sh from the repository root. It prompts for the token and secret without echoing them and prints only non-secret webhook status. Pending Telegram updates are preserved.

This changes the bot's single active webhook URL. Run it only after the production Pages endpoint has been deployed and verified. Never use a placeholder or unverified URL.

## Smoke test

1. Open https://<pages-domain>/api/telegram/webhook; expect an ok JSON health response.
2. Use a separate test bot token for Preview and send /start; verify welcome reply.
3. Send /services; verify the four buttons.
4. Send /request; select service, enter area and schedule. Verify the D1 row and admin notice.
5. Verify the customer receipt says the request is pending review, not a confirmed booking.
6. Verify /stop deletes an unfinished session.
7. Verify a request without the secret returns 401 and an oversized request returns 413.

## Deployment boundary

GitHub commits do not deploy Pages unless the Pages project is configured to build this branch. This is source-only until D1, encrypted variables, Preview deployment, and webhook registration are complete. Existing Supabase functions and data remain untouched.
