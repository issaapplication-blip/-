#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Export a Render PostgreSQL database through its EXTERNAL connection URL.
# This cannot work while the database/workspace is suspended or unreachable.
# Never commit the URL or backup files.

: "${RENDER_DATABASE_URL:?Set RENDER_DATABASE_URL to the Render EXTERNAL database URL}"
if [[ "${BACKUP_CONFIRM_TARGET:-}" != "render-rafiq-n8n-db" ]]; then
  echo "Refusing to export until BACKUP_CONFIRM_TARGET=render-rafiq-n8n-db is set explicitly." >&2
  exit 2
fi

for bin in pg_dump pg_restore openssl sha256sum; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Missing required command: $bin" >&2; exit 2; }
done

out_dir="${BACKUP_DIR:-./private-backups}"
mkdir -p "$out_dir"
chmod 700 "$out_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain="$(mktemp "${TMPDIR:-/tmp}/rafiq-render-${stamp}.XXXXXX.dump")"
verify="$(mktemp "${TMPDIR:-/tmp}/rafiq-render-verify-${stamp}.XXXXXX.dump")"
encrypted="$out_dir/rafiq-render-postgres-${stamp}.dump.enc"
trap 'rm -f "$plain" "$verify"' EXIT

echo "Exporting Render PostgreSQL database. The URL will not be printed."
pg_dump --format=custom --no-owner --no-privileges --file="$plain" "$RENDER_DATABASE_URL"
test -s "$plain"

echo "Encrypting export with AES-256-CBC and PBKDF2. Enter a strong unique passphrase."
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in "$plain" -out "$encrypted"
test -s "$encrypted"

echo "Verifying encrypted export can be decrypted and archive can be read..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$encrypted" -out "$verify"
pg_restore --list "$verify" >/dev/null
sha256sum "$encrypted" > "$encrypted.sha256"
chmod 600 "$encrypted" "$encrypted.sha256"

echo "Encrypted archive verified: $encrypted"
echo "SHA-256 file: $encrypted.sha256"
echo "This is an archive-readability check, NOT a successful restore test. Restore only into a disposable local PostgreSQL instance."
