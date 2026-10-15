# Telegram webhook rollout — 2026-10-15

## What was changed
- Supabase project: `qmuxaehrahfsnabyjens`
- Function: `telegram-webhook`
- Live version after deployment: `5`
- Status: `ACTIVE`
- Gateway JWT verification: `verify_jwt=false`; the handler verifies `x-telegram-bot-api-secret-token` against `TELEGRAM_WEBHOOK_SECRET`.
- Deployed source: `supabase/functions/telegram-webhook/index.ts` from `main` (merged via PR #45).
- Workers AI is optional and uses `@cf/meta/llama-3.1-8b-instruct` by default. If `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` is missing, the webhook deliberately remains in guided fallback mode.
- The function redacts phone numbers before forwarding generic unanswered questions to Cloudflare Workers AI; it does not forward chat IDs, Telegram user IDs, or stored request-session data. Cloudflare's current Workers AI data policy states customer content is not used to train/improve its models/services without explicit consent.
- Verified in the live database: `telegram_update_receipts`, `claim_telegram_update`, `consume_telegram_rate_limit` exist; both RPC EXECUTE ACLs are restricted to `service_role`.
- Existing PR #45 CI run #27 ("RAFIQ edge function unit tests") completed successfully. This is offline test coverage, not a live Telegram send test.

## Rollback
- Exact live v4 source snapshot: `docs/recovery/live-snapshots/telegram-webhook-v4-live-20261015.ts` on the `safety/telegram-webhook-v4-live-backup-20261015` branch.
- Snapshot SHA-256 reported by Supabase: `ec3592705fb6c61dfaff3656990a8463567403e2d23a091a9dd899587241450e`.
- Rollback instructions: `docs/recovery/live-snapshots/telegram-webhook-v4-rollback-instructions.md`.
- Rollback means redeploy the snapshot as `telegram-webhook` with `verify_jwt=false`; leave the database tables, RPCs, and all secrets untouched.

## Remaining external steps
1. Register Telegram's webhook to `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook` using `ops/register-telegram-webhook.sh` locally. Enter the existing bot token and the same secret configured in Supabase; do not paste them into chat or commit them.
2. Send a real private message to `@RAFIQ_Care_Bot` and confirm a new receipt row appears and the reply answers a generic question. No end-to-end Telegram update was triggered from the deployment environment.
3. Verify the two optional Cloudflare secrets exist in Supabase Function Secrets; if missing, add `CLOUDFLARE_ACCOUNT_ID` and a narrowly scoped `CLOUDFLARE_API_TOKEN`. Do not print their values.
4. Do not enable WhatsApp auto-replies; `meta-whatsapp-webhook` remains on v5 with the hard-off guard.
