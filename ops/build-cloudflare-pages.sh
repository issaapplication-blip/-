#!/usr/bin/env bash
set -Eeuo pipefail

# Use the stable project origin for production SEO and canonical links; a Pages deployment URL is immutable and changes on every release.
SITE_URL="${RAFIQ_PUBLIC_BASE_URL:-https://rafiq-lebanon.pages.dev}"
OUT_DIR="${1:-dist}"
if [[ -z "$SITE_URL" ]]; then
  echo "RAFIQ_PUBLIC_BASE_URL must be the final https://<project>.pages.dev or custom domain" >&2
  exit 2
fi
python3 - "$SITE_URL" <<'PY'
from urllib.parse import urlsplit
import sys
u=urlsplit(sys.argv[1].strip().rstrip("/"))
if u.scheme != "https" or not u.netloc or u.path or u.query or u.fragment or u.username or u.password:
    raise SystemExit("RAFIQ_PUBLIC_BASE_URL must be an HTTPS origin with no path/query/credentials")
if "onrender.com" in u.netloc.lower():
    raise SystemExit("The suspended Render host cannot be the Pages origin")
PY

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -R public/. "$OUT_DIR/"
# Never publish the legacy browser-side auto-reply script on a static host.
rm -f "$OUT_DIR/auto-reply.mjs"

python3 - "$SITE_URL" "$OUT_DIR" <<'PY'
import os, sys
base=sys.argv[1].rstrip("/")
root=sys.argv[2]
text_ext={".html",".js",".mjs",".css",".xml",".txt",".json",".webmanifest",".svg"}
replaced=0
for here, dirs, files in os.walk(root):
    dirs.sort()
    for name in files:
        path=os.path.join(here,name)
        if os.path.splitext(name)[1].lower() not in text_ext: continue
        try:
            with open(path,"r",encoding="utf-8") as f: text=f.read()
        except UnicodeDecodeError:
            continue
        updated=text.replace("https://rafiq-o6qd.onrender.com",base)
        if updated != text:
            replaced += text.count("https://rafiq-o6qd.onrender.com")
            with open(path,"w",encoding="utf-8",newline="") as f: f.write(updated)
        if "rafiq-o6qd.onrender.com" in updated:
            raise SystemExit("Suspended Render URL remains in static asset: "+os.path.relpath(path,root))
with open(os.path.join(root,"_routes.json"),"w",encoding="utf-8") as f:
    f.write('{"version":1,"include":["/api/*"],"exclude":[]}')
with open(os.path.join(root,"_headers"),"w",encoding="utf-8") as f:
    f.write("/*\\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\\n  X-Content-Type-Options: nosniff\\n  X-Frame-Options: DENY\\n  Referrer-Policy: strict-origin-when-cross-origin\\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\\n  X-Permitted-Cross-Domain-Policies: none\\n  Content-Security-Policy: object-src 'none'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests\\n  Cache-Control: no-store\\n\\n/sw.js\\n  Cache-Control: no-cache\\n\\n/manifest.json\\n  Cache-Control: no-cache\\n\\n/manifest.webmanifest\\n  Cache-Control: no-cache\\n\\n/assets/*\\n  Cache-Control: public, max-age=86400, stale-while-revalidate=604800\\n")
print(f"Cloudflare Pages static bundle created at {root}; replaced {replaced} suspended-host URLs.")
PY

test -f "$OUT_DIR/index.html"
test -f "$OUT_DIR/admin.html"
test -f "$OUT_DIR/caregivers.html"
test -f "$OUT_DIR/map.html"
test -f "$OUT_DIR/hospitals.html"
test ! -e "$OUT_DIR/auto-reply.mjs"
test -f "$OUT_DIR/_routes.json"
test -f "$OUT_DIR/_headers"
