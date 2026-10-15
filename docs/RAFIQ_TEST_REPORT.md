# RAFIQ test report

Audit date: 2026-10-15.

## Static checks completed in this session
- Confirmed repository `issaapplication-blip/-`, branch `main`, and GitHub write permission metadata.
- Read `package.json`, `src/index.ts`, `public/index.html`, `public/app.html`, `public/manifest.webmanifest`, `public/sw.js`, `public/install-app.js`, Cloudflare build script, and Telegram rollout documentation.
- Confirmed `src/index.ts` has `GET /health` and `GET /api/status`.
- Confirmed existing PWA icon files: `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`.
- Confirmed source port default was 3000 before this change.
- Confirmed Cloudflare build script copies `public/` to `dist/` and removes `auto-reply.mjs`.

## Checks not run / blocked
- Bun install, TypeScript runtime launch, Docker build, and HTTP smoke tests: not executable from the connected GitHub file API in this session; require CI or target hosting.
- Supabase table listing and read-only SQL: blocked by Supabase connector permission error. No SQL changes were made.
- Live Hugging Face health check and actual Space source linkage: not verified.
- Cloudflare Pages deployment: not created; account-owner authorization is required.
- Telegram webhook registration and live bot message: not run; existing Supabase Edge webhook preserved.
- WhatsApp/Meta/Kapso: no outbound tests or messages sent.

## Result
Source changes are migration preparation, not proof of a live deployment or production readiness. Acceptance requires the blocked checks above.

## Follow-up source inspection
- Confirmed the existing Service Worker registration owner is `public/install-app.js`; no duplicate registration was introduced.
- Confirmed manifest icon paths point to tracked root-level public assets.
- Source-level check confirms `/health` returns only status, service identifier and timestamp; Elysia listen options specify `0.0.0.0`.
- GitHub Actions health-check cadence was changed to every six hours. This does not verify a workflow run or endpoint availability.
- Docker build/runtime, HTTP checks, Supabase and Telegram live tests remain unexecuted.

## Docker CI failure and remediation
- Run: https://github.com/issaapplication-blip/-/actions/runs/38778200935
- Result: failed before container startup at the frozen Bun install step because `bun.lock` does not match `package.json`.
- Remediation committed: Dockerfile now emits an explicit warning and retries production dependency resolution without frozen mode. This is a temporary, documented workaround; the lockfile remains a reproducibility issue until refreshed.
- The follow-up CI run must pass the Docker build and live `/health` smoke test before the image is considered runnable.

- Follow-up: plain `bun install --production` also failed under CI's frozen-lockfile behavior. Docker fallback now uses the explicit `--no-frozen-lockfile` option. Awaiting the next run; not yet verified.
