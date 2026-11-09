> **Historical deployment record — 2026-10-15.** The status and live-version statements below reflect the rollout recorded on that date only. They must not be treated as a fresh production check. The current source was refocused on 2026-11-09; care-request handling is removed, CV remains separate, Meta/Kapso are retired, and channel publishing is manual. For the current process see `docs/CLOUDFLARE-TELEGRAM-WEBHOOK.md`.

# Historical Telegram webhook rollout — 2026-10-15

## What was reported at the time
- Supabase project: `qmuxaehrahfsnabyjens`
- Function: `telegram-webhook`
- Live version recorded: `5`
- Status recorded: `ACTIVE`
- Gateway JWT verification was recorded as `verify_jwt=false`; the handler checked `x-telegram-bot-api-secret-token`.
- The deployed source at that time included guided FAQs and care-request collection. The current source no longer creates care/provider application sessions.
- Workers AI was optional and used `@cf/meta/llama-3.1-8b-instruct` as the fallback model.
- A live database check on that date reported `telegram_update_receipts`, `claim_telegram_update`, and `consume_telegram_rate_limit`, with RPC EXECUTE ACLs restricted to `service_role`.
- PR #45 CI run #27 passed. That was offline test coverage, not a live Telegram send test.

## Recovery reference
- Exact live v4 source snapshot recorded then: `docs/recovery/live-snapshots/telegram-webhook-v4-live-20261015.ts` on `safety/telegram-webhook-v4-live-backup-20261015`.
- Snapshot SHA-256 recorded by Supabase: `ec3592705fb6c61dfaff3656990a8463567403e2d23a091a9dd899587241450e`.
- Rollback instructions: `docs/recovery/live-snapshots/telegram-webhook-v4-rollback-instructions.md`.

## Current caution
Do not run rollback or webhook-registration instructions from this historical file without a fresh inspection of the current production function and webhook. The current Supabase connector returned a permission error in the 2026-11-09 session, so the deployed version and webhook target remain unverified. No live changes have been made by the repository cleanup.
