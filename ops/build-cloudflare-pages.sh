#!/usr/bin/env bash
set -Eeuo pipefail

SITE_URL="${RAFIQ_PUBLIC_BASE_URL:-${CF_PAGES_URL:-}}"
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
        if path.lower().endswith(".html") and 'src="/site-menu.js' not in updated and "</body>" in updated:
            updated=updated.replace("</body>", '  <script src="/site-menu.js?v=1" defer></script>\n</body>')
        if updated != text:
            replaced += text.count("https://rafiq-o6qd.onrender.com")
            with open(path,"w",encoding="utf-8",newline="") as f: f.write(updated)
        if "rafiq-o6qd.onrender.com" in updated:
            raise SystemExit("Suspended Render URL remains in static asset: "+os.path.relpath(path,root))
with open(os.path.join(root,"_routes.json"),"w",encoding="utf-8") as f:
    f.write('{"version":1,"include":["/api/*"],"exclude":[]}')
with open(os.path.join(root,"_headers"),"w",encoding="utf-8") as f:
    f.write("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-store\n\n/assets/*\n  Cache-Control: public, max-age=86400, stale-while-revalidate=604800\n")
print(f"Cloudflare Pages static bundle created at {root}; replaced {replaced} suspended-host URLs.")
PY

test -f "$OUT_DIR/index.html"
test -f "$OUT_DIR/admin.html"
test -f "$OUT_DIR/app.html"
test ! -e "$OUT_DIR/auto-reply.mjs"
test -f "$OUT_DIR/_routes.json"
test -f "$OUT_DIR/_headers"
