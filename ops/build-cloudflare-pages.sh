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
    raise SystemExit("The retired Render host cannot be the Pages origin")
PY

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

PUBLIC_DIR="public"
FILES=(
  index.html announcements.html services.html regions.html faq.html caregivers.html
  laboratories.html radiology.html physiotherapy.html medical-equipment.html
  admin.html 404.html offline.html
  elderly-care.html patient-care.html home-nursing.html
  lebanon.html tripoli.html dinniyeh.html zgharta.html koura.html batroun.html beirut.html
  guide.html guide-after-hospital.html guide-caregiver-vs-nurse.html guide-choose-caregiver.html guide-elderly-home.html
  manifest.webmanifest sw.js install-app.js robots.txt sitemap.xml
  apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png
)

for file in "${FILES[@]}"; do
  if [[ ! -f "$PUBLIC_DIR/$file" ]]; then
    echo "Required public asset is missing: $PUBLIC_DIR/$file" >&2
    exit 1
  fi
  cp "$PUBLIC_DIR/$file" "$OUT_DIR/$file"
done

cp -R "$PUBLIC_DIR/assets" "$OUT_DIR/assets"

python3 - "$SITE_URL" "$OUT_DIR" <<'PY'
import os, sys
base=sys.argv[1].rstrip("/")
root=sys.argv[2]
text_ext={".html",".js",".mjs",".css",".xml",".txt",".json",".webmanifest",".svg"}
for here, dirs, files in os.walk(root):
    dirs.sort()
    for name in files:
        path=os.path.join(here,name)
        if os.path.splitext(name)[1].lower() not in text_ext:
            continue
        try:
            with open(path,"r",encoding="utf-8") as f:
                text=f.read()
        except UnicodeDecodeError:
            continue
        updated=text.replace("https://rafiq.invalid",base).replace("https://rafiq-o6qd.onrender.com",base)
        if "onrender.com" in updated.lower() or "rafiq.invalid" in updated.lower():
            raise SystemExit("Unresolved public origin in asset: "+os.path.relpath(path,root))
        if updated != text:
            with open(path,"w",encoding="utf-8",newline="") as f:
                f.write(updated)
with open(os.path.join(root,"_routes.json"),"w",encoding="utf-8") as f:
    f.write('{"version":1,"include":["/api/*"],"exclude":[]}')
with open(os.path.join(root,"_headers"),"w",encoding="utf-8") as f:
    f.write("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-store\n\n/assets/*\n  Cache-Control: public, max-age=86400, stale-while-revalidate=604800\n")
print(f"Cloudflare Pages allowlisted bundle created at {root}.")
PY

for retired in agent.html dashboard.html barcode.html install.html app.js install-pwa.js manifest.json i18n.js; do
  test ! -e "$OUT_DIR/$retired" || { echo "Retired public surface leaked: $retired" >&2; exit 1; }
done
test ! -e "$OUT_DIR/js"
test -f "$OUT_DIR/index.html"
test -f "$OUT_DIR/admin.html"
test -f "$OUT_DIR/announcements.html"
test -f "$OUT_DIR/caregivers.html"
test -f "$OUT_DIR/_routes.json"
test -f "$OUT_DIR/_headers"
if grep -RniE 't\.me/|wa\.me/|whatsapp\.com|onrender\.com|rafiq\.invalid' "$OUT_DIR" --include='*.html' --include='*.xml' --include='*.txt'; then
  echo "Retired host or external messaging link found in public bundle." >&2
  exit 1
fi
