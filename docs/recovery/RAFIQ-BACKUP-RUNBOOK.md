# RAFIQ local encrypted backup and verification

These scripts are intentionally run on the owner's own computer. Do not paste database URIs, service-role keys, or GPG passphrases into chat, GitHub, logs, or a ticket. Backups are encrypted with GPG AES-256 before the temporary working directory is removed. The archive includes a custom-format PostgreSQL dump and all Storage bucket objects the service-role API can list, plus per-file SHA-256 records. This is an export/restore-archive integrity check, not a full restore rehearsal into another database.

## Prerequisites
Install PostgreSQL client tools (pg_dump/pg_restore, client version 17 or later), GPG, Python 3 and Bash. Obtain the database connection URI from the existing project `qmuxaehrahfsnabyjens` Dashboard > Connect; use its project-specific direct/session connection URI. Never create another Supabase project for this.

Before running, set these environment variables locally in the terminal:
- `SUPABASE_DB_URL`: the project's PostgreSQL connection URI.
- `SUPABASE_URL`: `https://qmuxaehrahfsnabyjens.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: the existing project's server-side service key, used locally only to export Storage objects.

Then run:
```bash
bash ops/backup.sh && bash ops/verify.sh
```
GPG will prompt for an encryption passphrase locally. Keep that passphrase in a password manager; without it the archive cannot be decrypted. The backup is stored under `$HOME/rafiq-secure-backups` (or `RAFIQ_BACKUP_DIR` if set) with mode-restricted permissions.

Send back only the final line that starts with `RESULT=`. Do not send the database URI, service key, GPG passphrase, backup contents, or any customer data.

`pg_restore --list` plus file hashes checks archive readability and file integrity; it does not prove a restore into another project. The scripts never modify the live database or delete cloud objects.
