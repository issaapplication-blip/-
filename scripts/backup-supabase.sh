#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Exports the PostgreSQL database only. Storage objects, Auth provider settings,
# Edge Function secrets, and external provider configuration are NOT included.
# Run from a trusted local machine with pg_dump, pg_restore, OpenSSL and sha256sum.

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the intended Supabase database connection string}"
if [[ "${BACKUP_CONFIRM_TARGET:-}" != "production" ]]; then
  echo "Refusing to export until you set BACKUP_CONFIRM_TARGET=production explicitly." >&2
  exit 2
fi

for bin in pg_dump pg_restore openssl sha256sum; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Missing required command: $bin" >&2; exit 2; }
done

out_dir="${BACKUP_DIR:-./private-backups}"
mkdir -p "$out_dir"
chmod 700 "$out_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain="$(mktemp "${TMPDIR:-/tmp}/rafiq-db-${stamp}.XXXXXX.dump")"
verify="$(mktemp "${TMPDIR:-/tmp}/rafiq-verify-${stamp}.XXXXXX.dump")"
encrypted="$out_dir/rafiq-postgres-${stamp}.dump.enc"
trap 'rm -f "$plain" "$verify"' EXIT

echo "Exporting database with pg_dump (connection string is not printed)..."
pg_dump --format=custom --no-owner --no-privileges --file="$plain" "$SUPABASE_DB_URL"
test -s "$plain"

echo "Encrypting backup with OpenSSL AES-256-CBC + PBKDF2. Use a strong unique passphrase."
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in "$plain" -out "$encrypted"
test -s "$encrypted"

echo "Decrypting to a temporary file to verify the passphrase and archive integrity..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$encrypted" -out "$verify"
pg_restore --list "$verify" >/dev/null

sha256sum "$encrypted" > "$encrypted.sha256"
chmod 600 "$encrypted" "$encrypted.sha256"
echo "Verified encrypted database archive: $encrypted"
echo "SHA-256 file: $encrypted.sha256"
echo "IMPORTANT: This is NOT a complete RAFIQ backup until Storage objects and configuration/code are separately backed up and restore-tested."
