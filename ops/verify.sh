#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
BACKUP_BASE="${RAFIQ_BACKUP_DIR:-$HOME/rafiq-secure-backups}"
STAGE="preflight"
fail() { echo "RESULT=FAIL stage=$STAGE reason=$*" ; exit 1; }
trap 'rc=$?; if (( rc != 0 )); then echo "RESULT=FAIL stage=$STAGE code=$rc"; fi' EXIT

for cmd in python3 pg_restore gpg tar sha256sum; do command -v "$cmd" >/dev/null 2>&1 || fail "missing-$cmd"; done
[[ -t 0 ]] || fail "Run interactively so GPG can ask for the local encryption passphrase."
[[ -s "$BACKUP_BASE/LATEST" ]] || fail "latest-backup-pointer-missing"
ARCHIVE="$(cat "$BACKUP_BASE/LATEST")"
[[ -f "$ARCHIVE" && -s "$ARCHIVE" ]] || fail "encrypted-backup-missing"
[[ -f "$ARCHIVE.sha256" ]] || fail "archive-checksum-missing"
STAGE="archive-checksum"
(cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256" >/dev/null) || fail "archive-checksum-mismatch"
WORK="$(mktemp -d "$BACKUP_BASE/.verify.XXXXXX")"
chmod 700 "$WORK"
cleanup(){ rm -rf "$WORK"; }
trap 'rc=$?; cleanup; if (( rc != 0 )); then echo "RESULT=FAIL stage=$STAGE code=$rc"; fi' EXIT
STAGE="decrypt"
gpg --output - --decrypt "$ARCHIVE" | tar --no-same-owner --no-same-permissions -xf - -C "$WORK"
[[ -s "$WORK/database.dump" && -s "$WORK/integrity.json" && -s "$WORK/storage-manifest.json" ]] || fail "archive-content-missing"
STAGE="pg-restore-list"
pg_restore --list "$WORK/database.dump" > "$WORK/restore-list.txt"
[[ -s "$WORK/restore-list.txt" ]] || fail "pg-restore-list-empty"
STAGE="file-checksums"
python3 - "$WORK" <<'PY'
import hashlib,json,os,sys
root=sys.argv[1]
with open(os.path.join(root,"integrity.json"),encoding="utf-8") as f: manifest=json.load(f)
checked=0
for item in manifest.get("files",[]):
    path=os.path.normpath(os.path.join(root,item["path"]))
    if not path.startswith(root+os.sep) or not os.path.isfile(path):
        raise SystemExit("missing or unsafe path in integrity manifest")
    h=hashlib.sha256(); size=0
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk); size+=len(chunk)
    if size != item["bytes"] or h.hexdigest() != item["sha256"]:
        raise SystemExit("checksum mismatch: "+item["path"])
    checked+=1
with open(os.path.join(root,"storage-manifest.json"),encoding="utf-8") as f: storage=json.load(f)
if storage.get("project_ref") != manifest.get("project_ref"):
    raise SystemExit("project reference mismatch")
print(f"VERIFIED_FILES={checked} STORAGE_OBJECTS={len(storage.get('objects',[]))}")
PY
STAGE="complete"
ARCHIVE_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
trap - EXIT
cleanup
echo "RESULT=OK project=qmuxaehrahfsnabyjens archive=$(basename "$ARCHIVE") sha256=$ARCHIVE_SHA"
bash ops/backup.sh && bash ops/verify.sh