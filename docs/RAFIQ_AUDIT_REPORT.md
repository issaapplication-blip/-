# RAFIQ audit report

Audit date: 2026-10-15.

## Findings and actions
1. **Backend default port was 3000.** Changed to 7860 for the requested Docker Space; an explicitly configured `PORT` still takes precedence.
2. **No root Dockerfile or root README existed.** Added Dockerfile and Hugging Face Docker SDK front matter.
3. **Existing PWA assets already existed.** Kept `manifest.webmanifest`, icons, and install controller; added a parallel `manifest.json` using verified icon paths and updated home/application manifest links.
4. **Service Worker deleted every origin cache.** Changed activation to delete only RAFIQ-owned cache names. Removed admin/agent/dashboard pages from precache and bypassed API/private routes to avoid caching sensitive responses.
5. **Existing `render.yaml` was present.** Removed it as requested for Render retirement; no source files or database objects were deleted.
6. **Telegram startup registration requires explicit opt-in.** Container defaults keep it off. Marketing and broadcast features are also explicitly disabled by defaults.
7. **Supabase live inspection unavailable.** Table-list and read-only SQL tool calls returned a permission error. No database mutation was attempted. Table existence, actual columns, indexes and RLS are therefore unverified.

## Risks remaining
- Hugging Face Space source/repository linkage and deployment were not available to verify from GitHub access alone.
- Cloudflare Pages account/project authorization is still required to obtain a real `pages.dev` URL.
- Existing Supabase schema/RLS and live Edge Function status need owner-authorized verification.
- No live Telegram message test was run; no messages were sent.
- Build/runtime tests must be executed by CI or target hosting before declaring production readiness.

## Follow-up corrections on 2026-10-15
- Confirmed the PWA already registers its Service Worker through `public/install-app.js`; no duplicate registration was added to `public/app.js`.
- Confirmed icon files are in `public/` root (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`), not `public/assets/`; manifest uses the existing tracked paths.
- Tightened `/health` output to a generic service status and ISO timestamp; it no longer exposes gateway-specific/internal webhook timing.
- Explicitly bound Elysia to `0.0.0.0` and set Docker `HOST=0.0.0.0`.
- Reduced the optional Hugging Face health workflow cadence to once every six hours.
- Supabase checks remain blocked by connector permissions; no DDL or policy changes were applied.

## CI-discovered dependency issue
- GitHub Actions Docker build on commit `df499a494d32273327322eb545af274df326e673` failed at `bun install --frozen-lockfile --production` with: `lockfile had changes, but lockfile is frozen`. This establishes that `bun.lock` and `package.json` are currently out of sync. A documented production-only fallback was added to allow a validation build, but the lockfile should be regenerated and committed as a separate reproducibility fix once the resulting dependency graph is verified. Do not call the backend ready until the Docker smoke test passes.

## Second CI finding
- The initial fallback `bun install --production` still failed because Bun's CI mode treated the lockfile as frozen. Updated the explicit fallback to `bun install --no-frozen-lockfile --production`, with a warning. The next Docker CI run is the acceptance check; if it still fails, stop and repair the lockfile itself instead of adding more fallbacks.
