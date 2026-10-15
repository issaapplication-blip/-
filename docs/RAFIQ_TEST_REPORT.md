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


- Second CI run failed because Bun 1.3.10 still treated the lockfile as frozen even with `--no-frozen-lockfile`. The temporary validation image now installs from `package.json` without copying the stale lockfile; this is not the final reproducible build. Acceptance still requires the Docker health smoke test to pass and the lockfile to be refreshed afterward.

## Docker CI run 38778522812 — verified final result
- Run URL: https://github.com/issaapplication-blip/-/actions/runs/38778522812
- Final result: **FAILURE**. Job `edge-function-tests` failed in step `Build and smoke-test Hugging Face Docker runtime`.
- The Docker image itself built successfully in this run. The container then exited before serving `http://127.0.0.1:17860/health`; the first request reported connection reset and later attempts could not connect. The smoke-test step exited with code 1.
- Because the Docker step failed, Bun setup, Cloudflare bundle validation, and mocked Supabase Edge Function tests were skipped in this run. This run is not evidence that those tests passed.
- The log did not include the container's own startup output, so the precise runtime exception is not established from this run alone.

## CI diagnostic update
- Commit: https://github.com/issaapplication-blip/-/commit/6453b5352525fa2cdb49b0c8116ad587705113db
- Added a container-log dump to the cleanup handler so a future startup failure records the actual application error.
- Pinned CI Bun to 1.3.10 to match the Docker base image.
- Added a non-blocking frozen-lockfile validation step and made backup syntax, Cloudflare bundle, and offline test steps run even if Docker smoke testing fails. The lockfile validation is deliberately non-blocking while the current `bun.lock` mismatch is unresolved; a failure will remain visible in the job log.
- These are workflow changes only. No test result is inferred from source inspection; the new run must complete before reporting results.

## Deployment workflow safety review
- Inspected the workflows present under `.github/workflows/`: `keep-alive.yml`, `rafig-pwa-icons.yml`, `rafiq-edge-function-tests.yml`, `rafiq-production-qa.yml`, and `rafiq-safety-preflight.yml`.
- No automatic deployment workflow to Render or another hosting provider was found in this directory.
- `keep-alive.yml` only issues an HTTPS health request to the configured Hugging Face URL and emits a warning for non-200 responses; it does not deploy.
- `rafiq-production-qa.yml` is manually dispatched and rejects `onrender.com` targets.
- `rafig-pwa-icons.yml` generates icon assets and pushes a commit on main when its configured source paths change; it is not a hosting deployment workflow.
- No Render deployment, production test, outbound message, WhatsApp/Kapso/Meta activation, Supabase mutation, or Telegram webhook change was performed in this task.
- The actual Hugging Face URL and source linkage are not verified. Cloudflare Pages is not deployed; only the CI bundle-build command is intended to validate the static output.

## Current acceptance status
- Docker image build: **PASS** in run 38778522812.
- Docker runtime /health smoke test: **FAIL** in run 38778522812.
- Bun tests and Cloudflare Pages bundle in run 38778522812: **SKIPPED** because the preceding Docker step failed.
- `bun.lock` refresh: **NOT DONE**. No updated lockfile is committed. CI's frozen-lockfile validation must be reviewed, and the lockfile should only be updated by Bun 1.3.10 with a verified diff.
- Supabase and current Telegram webhook remain unchanged.



## 2026-10-15 — Bun lock audit follow-up

- Successful isolated branch run: https://github.com/issaapplication-blip/-/actions/runs/38791959887
- Regenerated `bun.lock` with Bun 1.3.10 and verified both frozen-lock commands.
- `bun test tests/functions`, `bun test src`, Cloudflare Pages build, Docker build, and isolated Docker `/health` passed in the same run.
- Proposed Dockerfile now copies `bun.lock` and uses `bun install --frozen-lockfile --production`.
- Commit: https://github.com/issaapplication-blip/-/commit/76510153248a28df16bf50dead5dc04214a6ec5e; draft PR: https://github.com/issaapplication-blip/-/pull/54.
- Supabase live read access remains denied; no live integrations or deployment were touched. See `docs/RAFIQ_DEEPSEEK_FINAL_AUDIT.md` for scope and remaining blockers.
