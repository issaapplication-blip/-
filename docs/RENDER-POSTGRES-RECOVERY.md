# RAFIQ Render PostgreSQL recovery

## Current known status

The Render resource `RAFIQ-n8n-db` was previously reported as suspended for billing. An external connection attempt was blocked, and no successful export or restore has been completed. The presence of a backup script in this repository does not mean the database has been backed up.

Render documents that Free Postgres expires 30 days after creation and becomes inaccessible unless upgraded; after the 14-day grace period, Render deletes it and its data. Free Postgres has no managed backup capability. Read the current [Render Free plan documentation](https://render.com/docs/free) and [PostgreSQL backup/restore guide](https://render.com/articles/how-to-backup-and-restore-postgresql-databases).

## Export if Render makes the database accessible

1. Open the database dashboard and check whether Render permits resuming the database or creating an export. If billing suspension prevents access, a network allowlist change alone may not be enough.
2. On a trusted computer, install PostgreSQL client tools. Use a `pg_dump` version at least as new as the source PostgreSQL major version, plus OpenSSL.
3. Copy the **External Database URL** directly into your local terminal environment. Never put the URL, password, passphrase, or database dump into GitHub, chat, issues, or logs.
4. From the repository root, run the following in your local terminal:

```bash
export RENDER_DATABASE_URL='(enter the external URL locally; do not share it)'
export BACKUP_CONFIRM_TARGET=render-rafiq-n8n-db
bash scripts/backup-render-postgres.sh
unset RENDER_DATABASE_URL
```

5. Enter a strong unique encryption passphrase when prompted. Store the generated encrypted `.dump.enc` and `.sha256` outside the repository; keep the passphrase separately.
6. A successful `pg_restore --list` confirms archive readability only. Restore into a disposable local PostgreSQL/Supabase environment and validate schema and representative data before relying on it.

The script deliberately refuses to run without explicit target confirmation. It does not upload the dump to GitHub. The repository's `.gitignore` excludes local backup artifacts.

## RAFIQ data safety boundary

- No Render or Supabase export has been confirmed completed.
- Do not delete or alter the existing Supabase project, tables, policies, or private Storage objects as part of recovery.
- The Supabase PostgreSQL backup script does not include Storage objects, Auth provider configuration, project secrets, or all external service settings.
- Keep Telegram/WhatsApp production webhooks unchanged until an isolated test and rollback plan are ready.
