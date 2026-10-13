#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [[ $# -ne 1 ]]; then echo "Usage: BACKUP_PASSPHRASE=... bash scripts/restore-backup-local.sh file.tar.gz.enc" >&2; exit 2; fi
: "$BACKUP_PASSPHRASE"
for bin in openssl tar docker pg_restore; do command -v "$bin" >/dev/null 2>&1 || { echo "Missing required command: $bin" >&2; exit 2; }; done
ARCHIVE=$(realpath "$1"); WORK=$(mktemp -d); CONTAINER="rafig-restore-$RANDOM"
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$WORK"; }; trap cleanup EXIT INT TERM
echo "[1/4] Decrypting and checking archive ..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$ARCHIVE" -out "$WORK/archive.tar.gz"
tar -tzf "$WORK/archive.tar.gz" >/dev/null; tar -xzf "$WORK/archive.tar.gz" -C "$WORK"
DUMP="$WORK/payload/database.dump"; [[ -f "$DUMP" ]] || { echo "database.dump missing" >&2; exit 1; }
pg_restore --list "$DUMP" >/dev/null
echo "[2/4] Starting disposable PostgreSQL container bound to localhost ..."
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=local-only-restore -e POSTGRES_DB=rafig_restore -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$CONTAINER" pg_isready -U postgres -d rafig_restore >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CONTAINER" pg_isready -U postgres -d rafig_restore >/dev/null
echo "[3/4] Restoring database dump into isolated container ..."
docker cp "$DUMP" "$CONTAINER:/tmp/database.dump"
docker exec "$CONTAINER" pg_restore -U postgres -d rafig_restore --no-owner --no-privileges --exit-on-error /tmp/database.dump
echo "[4/4] Counting restored tables ..."
docker exec "$CONTAINER" psql -U postgres -d rafig_restore -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"
echo "Isolated restore passed. Supabase production was not modified."
