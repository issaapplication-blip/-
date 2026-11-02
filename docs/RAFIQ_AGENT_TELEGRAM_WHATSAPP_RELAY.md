# RAFIQ — Agent, Telegram, and WhatsApp inbound relay

## Fixed architecture

- The automated RAFIQ agent answers only on the website and Telegram.
- WhatsApp messages never call `rafiq-agent`, `draftAgentReply`, an LLM provider, or any other agent.
- The Meta WhatsApp webhook verifies the Meta signature, stores each inbound event, and forwards the sender number and message text to the configured Telegram manager chat IDs.
- The platform does not send outbound WhatsApp messages. The manager replies manually from the official WhatsApp application.
- Legacy Meta/Kapso send-text API routes return HTTP 410 and cannot send.
- Duplicate WhatsApp message IDs are ignored using the unique `(provider, provider_message_id)` index and PostgreSQL duplicate-key handling.
- Telegram webhook updates are claimed through the existing atomic `claim_telegram_update` RPC; completed duplicates return an idempotent success response.

## Supabase Edge Function endpoints

Project: `qmuxaehrahfsnabyjens`

- Telegram webhook: `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook`
- Meta WhatsApp webhook: `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/meta-whatsapp-webhook`
- Website agent: `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/rafiq-agent`

## Environment variables

Set server-side values only in **Supabase Dashboard → Project Settings → Edge Functions → Secrets** for the existing RAFIQ project. Never commit values to GitHub, put them in browser code, or paste them into chat.

The deployment inventory requested for RAFIQ is:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `META_VERIFY_TOKEN`
4. `META_APP_SECRET`
5. `META_ACCESS_TOKEN`
6. `META_PHONE_NUMBER_ID`
7. `META_GRAPH_API_VERSION`
8. `RAFIQ_ALLOWED_ORIGINS`
9. `TELEGRAM_BOT_TOKEN`
10. `TELEGRAM_WEBHOOK_SECRET`
11. `TELEGRAM_MANAGER_CHAT_IDS`

Notes:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. Supabase may inject standard project values automatically; verify them in the function environment rather than exposing them.
- `RAFIQ_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins, for example `https://index-html.issaapplication.workers.dev`. Do not include paths or trailing slashes.
- `TELEGRAM_WEBHOOK_SECRET` must be 32–256 characters and use Telegram-supported characters `A-Z a-z 0-9 _ -`.
- `TELEGRAM_MANAGER_CHAT_IDS` is a comma-separated list of numeric Telegram chat IDs. Negative IDs are accepted for groups/supergroups. The bot must be able to message each configured chat.
- `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, and `META_GRAPH_API_VERSION` are retained in the requested Meta integration inventory, but the inbound relay does not read them and contains no Meta outbound API call. Do not remove them if another separately managed Meta integration still needs them.
- No OpenAI or Gemini key is required by the deterministic website/Telegram knowledge agent.

## Telegram webhook reset — operator-run only

Run locally from the backend repository:

```bash
bash ops/register-telegram-webhook.sh
```

The script prompts for the bot token and webhook secret using hidden input. It does not print or save either value. It calls Telegram `setWebhook` with:

- URL: the Telegram webhook endpoint above
- `allowed_updates`: `message`, `callback_query`
- `drop_pending_updates`: `false`

It then calls `getWebhookInfo` and checks the URL and both required update types. This script makes a real Telegram API configuration change only when you run it. It does not send a customer message.

## Important verification boundary — Telegram update claim RPC

The Telegram Edge Function calls `public.claim_telegram_update(p_update_id, p_lease_seconds)` and writes `public.telegram_update_receipts`. The current repository migration set contains the webhook's references and the rate-limit migration, but no migration defining `claim_telegram_update` or creating `telegram_update_receipts`. They may already exist in the live project from a manual change or an earlier deployment; this could not be checked because Supabase project access was denied in this session.

**Before enabling Telegram:** in the existing Supabase project, verify that both the table and RPC exist, that the RPC atomically claims an update ID and returns the expected `claimed` / `current_status` fields, and that only `service_role` can execute it. If either is absent, the Telegram webhook will return 503 and must not be considered ready. No migration or database change is included in this branch.

## Meta webhook setup

In Meta for Developers → WhatsApp → Configuration:

- Callback URL: the Meta webhook endpoint above.
- Verify token: the value stored as `META_VERIFY_TOKEN`.
- Subscribe to the `messages` webhook field.
- Keep the Meta app secret server-side as `META_APP_SECRET`.

The GET verification route uses the verify token. Every POST requires a valid `X-Hub-Signature-256` HMAC-SHA256 signature over the raw request body. Missing or invalid secrets/signatures fail closed.

## Offline test suite

Run from the backend repository:

```bash
bun test tests/functions
```

The test suite uses mocked database and provider calls. It does not contact Telegram, Meta, WhatsApp, OpenAI, Gemini, or Supabase. The Telegram registration script is not run by tests.

## Deployment checklist

1. Review the branch and offline test results.
2. Configure the listed secrets in the existing Supabase project.
3. Deploy the reviewed Edge Function versions manually.
4. Run `bash ops/register-telegram-webhook.sh` locally.
5. Configure/verify the Meta webhook in the Meta dashboard.
6. Check Supabase function logs and the Telegram manager chat.
7. Do not send customer messages or WhatsApp replies as a test. Use synthetic test fixtures and the offline suite first.

No function deployment, live webhook registration, Meta dashboard change, or external message is performed by this code change.
