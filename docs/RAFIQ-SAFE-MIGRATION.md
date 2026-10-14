# RAFIQ safe migration and backup checklist

## Safety boundary

- This work is prepared on branch `safety/rafiq-backup-cloudflare-telegram-20261013`; do not merge it to `main` until review.
- Do not run database migrations, change Supabase policies, rotate secrets, or change Telegram/WhatsApp webhooks as part of this checklist.
- Keep WhatsApp outbound automation disabled during migration.
- Never put database URLs, service-role keys, Telegram tokens, or backup files in GitHub, issues, logs, or AI prompts.

## Database backup

`scripts/backup-supabase.sh` creates an encrypted PostgreSQL custom-format dump. It requires the operator to set `BACKUP_CONFIRM_TARGET=production` explicitly and does not print the database URL. It decrypts the encrypted result to a temporary file and runs `pg_restore --list` before declaring the archive structurally readable.

Example from a trusted local terminal (never paste the URL into chat or commit it):

```bash
export SUPABASE_DB_URL='postgresql://...'
export BACKUP_CONFIRM_TARGET=production
bash scripts/backup-supabase.sh
unset SUPABASE_DB_URL
```

Use a private directory with restrictive permissions and move the encrypted backup to a second secure location. Protect the passphrase separately from the backup.

### Scope limitations — do not call this a complete backup yet

The script backs up PostgreSQL only. It does NOT download Storage objects (including the private `private_documents` bucket), export Auth provider settings/email templates, save project secrets, or guarantee that Edge Function source is present in Git. Back up and verify those items separately before any migration. Do not include private customer documents in GitHub artifacts.

## Restore verification

A successful `pg_restore --list` confirms archive readability, not successful restoration. Restore only to a disposable local PostgreSQL/Supabase stack, never production. A plain PostgreSQL Docker image may lack Supabase extensions/schemas; prefer a local Supabase CLI stack for compatibility. The restore must complete and representative schema/data counts must be checked before calling the backup restore-tested.

## Telegram webhook audit (current main branch)

- The current route `POST /api/telegram/webhook` checks `verifyTelegramWebhookSecret(request)` and returns HTTP 401 when the secret is invalid.
- A search of the current `src/index.ts` did not find a durable `update_id` deduplication/processed-updates mechanism. Treat duplicate-update protection as NOT VERIFIED and a migration blocker until it is implemented with durable storage and tested.
- Do not send a valid synthetic update to the production bot or production webhook. Exercise the handler against a local mock/test bot with outbound Telegram requests disabled.
- Required isolated tests: wrong secret -> 401; duplicate `update_id` -> exactly one processing effect; synthetic text -> expected response and no real outbound calls; burst -> rate limit; restart mid-update -> pending update is retried without duplicate side effects.
- No test in this document claims to have been executed; run and record results in an isolated environment before cutover.

## Cloudflare Pages readiness

Pages is for the static frontend. The existing application uses Bun + Elysia and has a Telegram webhook/API; do not assume those routes run on Pages. Before publishing, inspect API calls and asset paths, then test the separate backend route from the preview deployment.

Do not add a strict Content-Security-Policy or rewrite canonical URLs blindly: first inventory external origins, inline scripts, Supabase endpoints, fonts, and the final preview hostname to avoid breaking the existing pages.

## Cutover gates

1. Encrypted DB backup is checksum-verified and restore-tested locally.
2. Storage objects, Auth settings, Edge Function source/secrets inventory, and recovery instructions are backed up separately.
3. Local webhook tests pass, including durable deduplication and restart recovery.
4. Preview passes login/admin review, intake/upload, private-document access controls, PWA install/offline behavior, and Telegram replies.
5. Confirm HTTPS, health check, secret configuration, and rollback plan.
6. Only then propose production cutover. Until then, keep existing Supabase and production webhook configuration unchanged.
