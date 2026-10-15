# RAFIQ changelog

## 2026-10-15 — Hosting migration preparation
- Added Dockerfile for Bun 1.3.10/Elysia on port 7860 with outbound messaging and webhook automation disabled by default.
- Added Hugging Face Space README metadata and runtime instructions.
- Changed backend default port from 3000 to 7860.
- Added `public/manifest.json` using existing icon assets and updated manifest references in home/application HTML; preserved existing webmanifest and install controller.
- Hardened Service Worker cache activation so it removes only RAFIQ-owned caches; excluded admin/agent/dashboard pages from precache and bypassed API/private routes.
- Added a scheduled health-check workflow for the configured Hugging Face Space; this is a diagnostic ping, not a guarantee of continuous uptime.
- Removed `render.yaml` per the requested retirement of Render.
- Added migration, inventory, integration, audit, deployment, test, and changelog reports.
- No Supabase database changes; no webhook cutover; no customer messages sent.

## 2026-10-15 — post-review hardening
- Made health response minimal and privacy-safe.
- Pinned Elysia listen hostname to `0.0.0.0`; Docker `HOST` defaults to the same.
- Added manifest JSON to the existing Service Worker asset list.
- Reduced optional health-check cadence to six hours.
- Confirmed no duplicate Service Worker registration was added.

## 2026-10-15 — source-tree hygiene
- Removed two accidental files whose paths were shell command sequences and whose contents were command text. The real scripts under `ops/` were preserved. This cleanup did not remove application code or database objects.

## 2026-10-15 — dependency-lock mismatch response
- CI proved `bun.lock` is out of sync with `package.json` under frozen install.
- Added a clearly logged production-install fallback in Dockerfile so CI can test whether the dependency graph still launches; this is a temporary workaround, not a claim that the lockfile is fixed.

- The first fallback attempt remained frozen under CI. Switched to explicit `--no-frozen-lockfile` for the documented workaround and required another Docker smoke test.


- Bun 1.3.10 rejected both frozen and explicit no-frozen install attempts against the stale lock. For a validation attempt only, Docker now installs from `package.json` without copying the stale lock into the image; a reproducible frozen-lockfile build remains a release requirement.

## 2026-10-15 — offline fallback and environment template completion
- Added `public/offline.html` with an Arabic retry page.
- Updated the existing Service Worker to precache the offline page and serve it on navigation network failure, while preserving its existing cache ownership and private-route protections.
- Expanded the environment template with the requested Telegram, WhatsApp/Kapso, Meta, Gemini, and runtime variable names; no secret values were added.
- PWA icon files were not moved or duplicated: the existing icons are referenced from the `public/` root, not `public/assets/`. The existing manifest remains unchanged pending a decision on the requested alternate icon paths.
- Supabase preflight remains blocked by connector permissions; no SQL or database changes were performed.
