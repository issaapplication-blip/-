#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_REF="qmuxaehrahfsnabyjens"
BACKUP_BASE="${RAFIQ_BACKUP_DIR:-$HOME/rafiq-secure-backups}"
STAGE="preflight"
WORK=""
ARCHIVE=""
fail() { echo "ERROR: $*" >&2; exit 1; }
on_exit() {
  rc=$?
  if (( rc != 0 )); then
    if [[ -n "${WORK:-}" && -d "$WORK" ]]; then rm -rf -- "$WORK"; fi
    if [[ -n "${ARCHIVE:-}" && -f "$ARCHIVE" ]]; then rm -f -- "$ARCHIVE" "${ARCHIVE}.sha256"; fi
    echo "RESULT=FAIL stage=$STAGE code=$rc" >&2
  fi
}
trap on_exit EXIT

[[ -n "${SUPABASE_DB_URL:-}" ]] || fail "Set SUPABASE_DB_URL locally from the correct Supabase project's Database connection dialog."
[[ -n "${SUPABASE_URL:-}" ]] || fail "Set SUPABASE_URL locally to https://$PROJECT_REF.supabase.co."
[[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || fail "Set SUPABASE_SERVICE_ROLE_KEY locally; do not place it in GitHub or chat."
[[ "${SUPABASE_URL%/}" == "https://$PROJECT_REF.supabase.co" ]] || fail "SUPABASE_URL does not match project $PROJECT_REF."
for cmd in python3 pg_dump pg_restore gpg tar sha256sum; do command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: $cmd"; done
[[ -t 0 ]] || fail "Run interactively so GPG can ask for a local encryption passphrase."

pg_major="$(pg_dump --version | sed -E 's/.* ([0-9]+).*/\1/')"
(( pg_major >= 17 )) || fail "pg_dump 17 or later is required (found major $pg_major)."

STAGE="connection-parse"
mapfile -d '' -t DB_PARTS < <(python3 - <<'PY'
import os, sys
from urllib.parse import urlsplit, unquote
u = os.environ.get("SUPABASE_DB_URL", "")
p = urlsplit(u)
if p.scheme not in ("postgres", "postgresql") or not p.hostname or not p.username or p.password is None or not p.path.strip("/"):
    print("SUPABASE_DB_URL must be a full postgresql:// URI", file=sys.stderr); sys.exit(2)
ref = "qmuxaehrahfsnabyjens"
if ref not in p.hostname.lower() and ref not in unquote(p.username).lower():
    print("Database URI does not identify the expected Supabase project ref", file=sys.stderr); sys.exit(3)
for value in [p.hostname, str(p.port or 5432), unquote(p.username), unquote(p.path.lstrip("/")), unquote(p.password)]:
    sys.stdout.buffer.write(value.encode() + b"\0")
PY
)
(( ${#DB_PARTS[@]} == 5 )) || fail "Could not parse the database connection URI."
export PGHOST="${DB_PARTS[0]}" PGPORT="${DB_PARTS[1]}" PGUSER="${DB_PARTS[2]}" PGDATABASE="${DB_PARTS[3]}" PGPASSWORD="${DB_PARTS[4]}" PGSSLMODE=require
unset DB_PARTS

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_BASE"
chmod 700 "$BACKUP_BASE"
WORK="$(mktemp -d "$BACKUP_BASE/.rafiq-work-$STAMP.XXXXXX")"
chmod 700 "$WORK"
ARCHIVE="$BACKUP_BASE/rafiq-$PROJECT_REF-$STAMP.tar.gpg"
STAGE="database-dump"
pg_dump --format=custom --no-owner --file="$WORK/database.dump"
[[ -s "$WORK/database.dump" ]] || fail "Database archive is empty."

STAGE="storage-download"
export RAFIQ_STORAGE_DEST="$WORK/storage"
mkdir -p "$RAFIQ_STORAGE_DEST"
python3 - <<'PY'
import hashlib, json, os, sys, urllib.error, urllib.parse, urllib.request
base = os.environ["SUPABASE_URL"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
dest = os.environ["RAFIQ_STORAGE_DEST"]
headers = {"apikey": key, "Authorization": "Bearer " + key}
def request(path, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode()
    h = dict(headers)
    if data is not None: h["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=h, method=method)
    try:
        return urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        detail = e.read(400).decode("utf-8", "replace")
        raise RuntimeError(f"Storage API HTTP {e.code} at {path}: {detail}") from None

buckets = json.load(request("/storage/v1/bucket"))
if not isinstance(buckets, list):
    raise SystemExit("Storage bucket response was not a list.")
manifest = {"project_ref":"qmuxaehrahfsnabyjens","buckets":[],"objects":[]}
for bucket in buckets:
    name = str(bucket.get("name", ""))
    if not name: continue
    manifest["buckets"].append({"name":name,"public":bucket.get("public")})
    pending = [""]
    seen_prefixes = set()
    while pending:
        prefix = pending.pop()
        if prefix in seen_prefixes: continue
        seen_prefixes.add(prefix)
        offset, limit = 0, 100
        while True:
            encoded_bucket = urllib.parse.quote(name, safe="")
            items = json.load(request("/storage/v1/object/list/" + encoded_bucket, "POST",
                                      {"prefix":prefix,"limit":limit,"offset":offset,
                                       "sortBy":{"column":"name","order":"asc"}}))
            if not isinstance(items, list):
                raise RuntimeError(f"Unexpected object list response for bucket {name}")
            for item in items:
                child = str(item.get("name", "")).strip("/")
                if not child or child in (".",".."): continue
                key_path = prefix + child if prefix else child
                if item.get("id") is None and not item.get("metadata"):
                    pending.append(key_path + "/")
                    continue
                encoded_path = "/".join(urllib.parse.quote(part, safe="") for part in key_path.split("/"))
                with request("/storage/v1/object/" + encoded_bucket + "/" + encoded_path) as response:
                    path_on_disk = os.path.join(dest, name, *key_path.split("/"))
                    os.makedirs(os.path.dirname(path_on_disk), mode=0o700, exist_ok=True)
                    digest = hashlib.sha256()
                    count = 0
                    with open(path_on_disk, "wb") as out:
                        os.chmod(path_on_disk, 0o600)
                        while True:
                            chunk = response.read(1024*1024)
                            if not chunk: break
                            out.write(chunk); digest.update(chunk); count += len(chunk)
                manifest["objects"].append({"bucket":name,"path":key_path,"bytes":count,"sha256":digest.hexdigest()})
            if len(items) < limit: break
            offset += len(items)
with open(os.path.join(os.path.dirname(dest), "storage-manifest.json"), "w", encoding="utf-8") as out:
    json.dump(manifest, out, ensure_ascii=False, separators=(",",":"))
print(f"Storage backup complete: {len(manifest['buckets'])} buckets, {len(manifest['objects'])} objects")
PY

STAGE="integrity-manifest"
export RAFIQ_WORK_DIR="$WORK" STAMP
python3 - <<'PY'
import hashlib, json, os
root = os.environ["RAFIQ_WORK_DIR"]
items = []
for base, dirs, files in os.walk(root):
    dirs.sort(); files.sort()
    for name in files:
        path = os.path.join(base, name)
        rel = os.path.relpath(path, root)
        if rel == "integrity.json": continue
        h = hashlib.sha256(); size = 0
        with open(path, "rb") as f:
            for chunk in iter(lambda:f.read(1024*1024), b""):
                h.update(chunk); size += len(chunk)
        items.append({"path":rel,"bytes":size,"sha256":h.hexdigest()})
with open(os.path.join(root, "integrity.json"), "w", encoding="utf-8") as f:
    json.dump({"project_ref":"qmuxaehrahfsnabyjens","files":items}, f, separators=(",",":"))
with open(os.path.join(root, "backup-info.json"), "w", encoding="utf-8") as f:
    json.dump({"project_ref":"qmuxaehrahfsnabyjens","created_at_utc":os.environ.get("STAMP",""),"format":"pg_dump custom + Storage objects","encrypted":"GPG AES-256"}, f)
PY
STAGE="encrypt"
tar -C "$WORK" -cf - . | gpg --symmetric --cipher-algo AES256 --output "$ARCHIVE"
[[ -s "$ARCHIVE" ]] || fail "Encrypted archive is empty."
ARCHIVE_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
printf '%s  %s\n' "$ARCHIVE_SHA" "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"
printf '%s\n' "$ARCHIVE" > "$BACKUP_BASE/LATEST"
chmod 600 "$ARCHIVE" "$ARCHIVE.sha256" "$BACKUP_BASE/LATEST"
rm -rf "$WORK"
unset PGPASSWORD
STAGE="complete"
trap - EXIT
echo "BACKUP_CREATED=$ARCHIVE"
echo "BACKUP_SHA256=$ARCHIVE_SHA"
echo "NEXT=Run bash ops/verify.sh and send only its RESULT line."
