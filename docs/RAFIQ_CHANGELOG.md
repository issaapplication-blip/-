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
