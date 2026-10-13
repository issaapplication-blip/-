#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "$SUPABASE_DB_URL"; : "$SUPABASE_URL"; : "$SUPABASE_SERVICE_ROLE_KEY"; : "$BACKUP_PASSPHRASE"
if [[ -z "$SUPABASE_DB_URL" || -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" || -z "$BACKUP_PASSPHRASE" ]]; then
  echo "Set SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and BACKUP_PASSPHRASE privately." >&2; exit 2
fi
for bin in pg_dump pg_restore openssl tar python3; do command -v "$bin" >/dev/null 2>&1 || { echo "Missing required command: $bin" >&2; exit 2; }; done
[[ -f scripts/backup-storage.py ]] || { echo "Run this from repository root; scripts/backup-storage.py is missing." >&2; exit 2; }
BACKUP_ROOT=./backups
BUCKETS=private_documents
if [[ -n "$RAFIQ_BACKUP_ROOT" ]]; then BACKUP_ROOT="$RAFIQ_BACKUP_ROOT"; fi
if [[ -n "$SUPABASE_STORAGE_BUCKETS" ]]; then BUCKETS="$SUPABASE_STORAGE_BUCKETS"; fi
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_ROOT"; chmod 700 "$BACKUP_ROOT"
WORK=$(mktemp -d)
FINAL="$BACKUP_ROOT/rafig-supabase-$STAMP.tar.gz.enc"
cleanup() { rm -rf "$WORK"; }; trap cleanup EXIT INT TERM
mkdir -p "$WORK/payload/storage" "$WORK/payload/repository"
echo "[1/5] Exporting PostgreSQL schema and data ..."
pg_dump --format=custom --no-owner --no-privileges --file "$WORK/payload/database.dump" "$SUPABASE_DB_URL"
echo "[2/5] Exporting objects from selected Storage buckets ..."
export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
python3 scripts/backup-storage.py --output "$WORK/payload/storage" --buckets "$BUCKETS"
echo "[3/5] Including migrations and Edge Function source where present ..."
[[ ! -d supabase/migrations ]] || cp -R supabase/migrations "$WORK/payload/repository/"
[[ ! -d supabase/functions ]] || cp -R supabase/functions "$WORK/payload/repository/"
printf 'RAFIQ encrypted backup\nCreated UTC: %s\nStorage buckets requested: %s\nDashboard-only provider credentials, SMTP/OAuth secrets, DNS and external service settings require separate secure inventory.\n' "$STAMP" "$BUCKETS" > "$WORK/payload/BACKUP-MANIFEST.txt"
echo "[4/5] Creating and encrypting archive ..."
tar -czf "$WORK/archive.tar.gz" -C "$WORK" payload
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$WORK/archive.tar.gz" -out "$FINAL"
chmod 600 "$FINAL"
echo "[5/5] Verifying decryption, archive structure and PostgreSQL dump catalogue ..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$FINAL" -out "$WORK/verified.tar.gz"
tar -tzf "$WORK/verified.tar.gz" >/dev/null
tar -xzf "$WORK/verified.tar.gz" -C "$WORK"
pg_restore --list "$WORK/payload/database.dump" >/dev/null
echo "Verified encrypted backup: $FINAL"
echo "Structural verification is not a substitute for an isolated PostgreSQL restore test."
