# RAFIQ safe backup and migration runbook

## Safety boundaries

- These scripts do not modify Supabase production, change DNS, set webhooks, or send Telegram/WhatsApp messages.
- Never commit database URLs, service-role keys, Telegram tokens, or backup passphrases. Set them only in a private local shell or secret manager.
- Do not run on a public/shared computer. Decrypted database and documents are sensitive.
- The backup is an operator-run tool, not a scheduled job.

## Encrypted backup

Prerequisites: PostgreSQL client tools (pg_dump, pg_restore), OpenSSL, Python 3, and tar.

Set privately in your local shell:
- SUPABASE_DB_URL: connection string for the existing production database with dump permissions.
- SUPABASE_URL: existing project URL.
- SUPABASE_SERVICE_ROLE_KEY: service-role key, never commit it.
- BACKUP_PASSPHRASE: a strong unique passphrase.
- Optional SUPABASE_STORAGE_BUCKETS: comma-separated buckets; defaults to private_documents.
- Optional RAFIQ_BACKUP_ROOT: local backup destination; defaults to ./backups.

Run: bash scripts/backup-supabase.sh

The script dumps accessible PostgreSQL schema/data, downloads objects from selected Storage buckets, includes repository migrations/Edge Function source if present, encrypts the archive, decrypts it again to verify archive structure, and checks the PostgreSQL dump catalogue.

Limitations:
- Only schemas/data accessible to the supplied database role are included.
- Only explicitly selected Storage buckets are exported. Confirm all production bucket names before relying on the archive.
- Dashboard-only provider credentials, SMTP/OAuth secrets, DNS, and external service settings require a separate secure inventory.
- Structural verification is not proof of a full restore. Run the isolated restore test next.

## Isolated restore

With Docker and PostgreSQL client tools installed, run:
bash scripts/restore-backup-local.sh ./backups/EXACT_BACKUP_NAME.tar.gz.enc

This starts a disposable PostgreSQL container bound to loopback, restores the dump, counts tables, then removes the container and temporary files. A restore error blocks cutover. Storage files are present in the archive but are not automatically re-uploaded by this database restore test.

## Telegram webhook smoke test

Deploy a separate staging instance with a staging webhook secret and disposable/test data. Set RAFIQ_TEST_BASE_URL to that staging HTTPS URL and TELEGRAM_WEBHOOK_SECRET to the staging secret, then run:
bash scripts/telegram-webhook-smoke.sh

It checks only that an invalid secret returns HTTP 401. The existing webhook checks recent conversation context for duplicate Telegram message IDs, but this is not a durable atomic update-id lock. Concurrent deliveries and restart/retry behavior still need isolated integration tests. Do not claim exactly-once processing until tested.

## Cloudflare Pages

- The candidate branch already has public/404.html.
- public/_headers sets baseline headers and starts with Content-Security-Policy-Report-Only because enforcing CSP without inventorying external scripts/images can break the multilingual site. Enforce CSP only after browser-console and functional testing.
- Pages does not run the existing Bun/Elysia server. A separate compatible backend is required for API, Telegram, admin logic, and webhooks.
- Keep webhook auto-configuration and WhatsApp outbound/auto-reply disabled until a real HTTPS backend passes acceptance tests.

## Cutover gate

Do not merge to main, repoint webhooks, or claim the platform is live until:
1. encrypted backup decrypts and the database restores in isolation;
2. required Storage buckets/files are present and private access paths work;
3. admin login, application intake, private document access, and review workflow pass;
4. Telegram invalid-secret, duplicate/concurrent update, rate-limit and restart/retry tests pass;
5. external secrets are configured only as server-side secrets;
6. HTTPS, health checks, and rollback are tested.

WhatsApp automated sending remains disabled throughout.
