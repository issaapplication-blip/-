> **Historical snapshot — 2026-10-14.** This file records the state observed on that date only. It is not a description of the current Telegram source or current production status. See `docs/CLOUDFLARE-TELEGRAM-WEBHOOK.md` and `docs/RAFIQ_INTEGRATION_MAP.md` for the 2026-11-09 architecture. The care-request workflow described below was removed from the current bot source; Meta/Kapso automation is retired. Do not follow the old request-collection or Meta steps.

# Historical RAFIQ Supabase security and Telegram Edge rollout — 2026-10-14

## Findings recorded at that date
- `rafiq-agent` was reported ACTIVE v9.
- `meta-whatsapp-webhook` was reported ACTIVE v5 with `verify_jwt=false` and a hard-off guard. Meta/Kapso automation has since been retired in source.
- PR #35 had added `telegram_update_receipts` and `claim_telegram_update(bigint,integer)`.
- The 2026-10-14 security migration added `service_role`-only policies and restricted manager RPC privileges.
- Leaked-password protection was reported disabled in the live Auth configuration at that time. This has not been freshly inspected in the current session.

## Current source direction (2026-11-09)
- The existing bot remains `@RAFIQ_Care_Bot`.
- The supported receiver is the existing Supabase Edge Function `telegram-webhook` in project `qmuxaehrahfsnabyjens`.
- The current source serves a medical directory: laboratories, imaging, physiotherapy, and medical-equipment sales/rental.
- `/request`, `/apply`, `/register`, and `/stop` no longer create care/provider request sessions. `/cv` remains separate for CV and Cover Letter.
- The Telegram channel is linked from the bot menu; channel publication remains manual after admin approval.
- WhatsApp is manual-only. Do not configure Meta or Kapso credentials.
- The legacy Cloudflare D1 webhook endpoint is retired with HTTP 410; do not create D1 or register that endpoint.

## Current deployment boundary
The current connector session did not have permission to read the existing Supabase project, so the deployed function version, secrets, `verify_jwt` setting, and Telegram's current webhook registration could not be verified. No live deployment, secret change, migration, or webhook registration was performed.
