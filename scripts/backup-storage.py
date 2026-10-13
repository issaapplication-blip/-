#!/usr/bin/env python3
"""Download objects from selected Supabase Storage buckets to a local folder."""
import argparse, json, os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
parser.add_argument("--buckets", required=True, help="Comma-separated bucket names")
args = parser.parse_args()
base = os.environ["SUPABASE_URL"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
root = Path(args.output).resolve()
root.mkdir(parents=True, exist_ok=True)
headers = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}
def request_json(url, body):
    req = Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urlopen(req, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as exc:
        raise RuntimeError("Storage listing failed; backup aborted.") from exc
def walk(bucket, prefix=""):
    offset = 0
    while True:
        items = request_json(f"{base}/storage/v1/object/list/{quote(bucket, safe='')}",
            {"prefix": prefix, "limit": 100, "offset": offset, "sortBy": {"column": "name", "order": "asc"}})
        if not isinstance(items, list): raise RuntimeError("Unexpected Storage listing; backup aborted.")
        if not items: break
        for item in items:
            name = item.get("name")
            if not isinstance(name, str) or not name or name in (".", ".."): continue
            rel = f"{prefix}/{name}".lstrip("/")
            if item.get("id") is None and item.get("metadata") is None: yield from walk(bucket, rel)
            else: yield rel
        if len(items) < 100: break
        offset += len(items)
for bucket in [v.strip() for v in args.buckets.split(",") if v.strip()]:
    bucket_dir = root / bucket
    bucket_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for object_path in walk(bucket):
        dest = (bucket_dir / object_path).resolve()
        if bucket_dir.resolve() not in dest.parents: raise RuntimeError("Unsafe Storage path; backup aborted.")
        dest.parent.mkdir(parents=True, exist_ok=True)
        encoded = "/".join(quote(part, safe="") for part in object_path.split("/"))
        req = Request(f"{base}/storage/v1/object/{quote(bucket, safe='')}/{encoded}",
            headers={"apikey": key, "Authorization": "Bearer " + key})
        try:
            with urlopen(req, timeout=120) as response, open(dest, "wb") as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk: break
                    output.write(chunk)
        except (HTTPError, URLError, OSError) as exc:
            raise RuntimeError(f"Storage download failed for bucket {bucket}; backup aborted.") from exc
        count += 1
    print(f"Exported {count} object(s) from bucket {bucket}")
