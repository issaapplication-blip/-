# RAFIQ file inventory

Audit date: 2026-10-15. Source of truth inspected: GitHub `main`.

## Runtime and build
- `package.json`: Bun scripts and runtime dependencies (Elysia, Kapso WhatsApp SDK, QRCode).
- `bun.lock`: Bun dependency lockfile.
- `src/index.ts`: Elysia API, public HTML/static routing, Telegram and Kapso/Meta handlers, admin-gated routes, status/health.
- `src/telegram*.ts`, `src/agent.ts`, `src/rafiq-local-agent.ts`, `src/rafiq-service-knowledge.ts`: Telegram, AI and service knowledge modules.
- `ops/build-cloudflare-pages.sh`: builds a static `dist/` bundle and replaces old Render URLs; excludes `auto-reply.mjs`.
- `ops/register-telegram-webhook.sh`: prompts locally for Telegram token/secret without printing or storing them; targets the existing Supabase Edge Function.

## Public assets
- `public/index.html`: public home page.
- `public/app.html`: public application/intake interface.
- `public/admin.html`, `public/admin.js`: admin interface; must remain protected by authentication/RLS.
- `public/agent.html`: agent interface.
- `public/manifest.webmanifest`, `public/sw.js`, `public/install-app.js`: existing PWA implementation.
- `public/assets/rafig-logo.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`: existing branding/PWA assets.
- `public/auto-reply.mjs`: legacy browser-side file intentionally excluded from the Cloudflare build.

## Recovery and deployment
- `docs/recovery/RAFIQ-CLOUDFLARE-PAGES-SETUP-2026-10-14.md`: current static deployment recipe.
- `docs/recovery/TELEGRAM-WEBHOOK-ROLLOUT-2026-10-15.md`: documented Supabase Telegram webhook state.
- `docs/recovery/live-snapshots/`: rollback snapshot/instructions for Telegram Edge Function.
- `render.yaml` was present before this migration and is removed in this change per the Render retirement request.

This is a source-tree inventory, not proof that external services are currently deployed or operational. Supabase table/RLS inspection was blocked by the connected tool's permission response; see the audit report.

## Resolved source-tree anomaly
- The prior tree contained two accidental files whose names were shell command sequences and whose contents were command text, not application code. After inspecting the exact blobs and confirming these were not the real scripts, the two stray entries were removed. The real scripts under `ops/` remain in place.
