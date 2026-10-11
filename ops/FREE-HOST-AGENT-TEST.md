# RAFIQ: isolated free-host agent test

**This branch is an isolated test harness. Never merge this branch into `main`.**
Branch: `staging/rafiq-current-free-host-20261011`

## Purpose

This deploys the latest `main` code plus a small test-only restriction layer. It is for checking the live Gemini-backed model response, not for operating RAFIQ or processing customers.

## Security controls

- The application is explicitly locked into staging-only mode in `src/index.ts`.
- Only `/`, `/health`, `/api/status`, and the token-protected `POST /api/agent/chat` endpoint are allowed.
- Every production page and all other APIs return 404, including sign-in, admin, forms, document uploads, barcode routes, Telegram webhook routes, and WhatsApp/Kapso routes.
- The test endpoint rejects requests unless `x-rafiq-staging-token` matches a host secret at least 32 characters long.
- It explicitly bypasses the local knowledge shortcut so the test verifies a call to Gemini.
- Telegram webhook registration, marketing timers, and startup broadcasts are disabled regardless of environment flags.
- No Supabase credentials or messaging credentials are needed.
- Docker excludes the live site's `public/` and `assets/` folders, local uploads, applicant files, ZIP archives, and secret files.
- The container does not write test requests to the production database.

Use synthetic questions only. Do not submit real patient names, contact details, medical records, application documents, or provider information. Gemini's free-tier data may be used by Google to improve products, according to Google's current API pricing terms; free hosting or a free API key is not a healthcare privacy guarantee.

## Required environment variables

Set them in your hosting provider's private environment settings. Do not put them in Git, source files, URLs, screenshots, or chat.

- `PORT=3000`
- `RAFIQ_AGENT_PROVIDER=gemini`
- `RAFIQ_GEMINI_MODEL=gemini-3.6-flash`
- `GEMINI_API_KEY=<your own API key>`
- `RAFIQ_STAGING_TEST_TOKEN=<random secret, at least 32 characters>`

Create a random test token in your trusted environment (for example, `openssl rand -hex 32`). Do not reuse your password or Telegram token.

Do not configure these in the test environment: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `KAPSO_API_KEY`, or production webhook secrets.

## Recommended free hosting path

### Fastest trial: Koyeb free web service

Koyeb currently lists one free web-service instance per organization with 512 MB RAM, 0.1 vCPU and 2 GB SSD. It can scale to zero after an hour without traffic and is intended for testing/hobby use, not production. That makes it acceptable for a brief agent-response test, but not a reliable promise for 24/7 RAFIQ operations.

1. Create or sign in to your Koyeb account using its official website.
2. Create a Web Service from this GitHub repository and select branch `staging/rafiq-current-free-host-20261011`.
3. Choose the Dockerfile builder and expose port `3000`.
4. Add the five environment variables above in the private Settings/Environment panel.
5. Deploy and wait for a healthy status.
6. Open the service's HTTPS URL, enter the private staging token in the password field, and test the synthetic Arabic question shown on the page.
7. Do not configure a custom production domain, Telegram bot token, Meta webhook, WhatsApp/Kapso key, or Supabase service-role key in this test.

Official Koyeb reference: https://www.koyeb.com/docs/reference/instances

### More control: Oracle Always Free + Coolify

Coolify is open source and free to self-host, but it runs on infrastructure you must provide. Oracle advertises an Always Free compute allowance; account verification, regional capacity, and reclamation rules mean a permanently available free server cannot be guaranteed. Confirm that the console explicitly labels the chosen resource Always Free before creating it, and never choose a paid upgrade.

- Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Coolify self-hosting requirements: https://coolify.io/docs/start-with-self-hosted
- Coolify installation: https://coolify.io/docs/installation

## Readiness and release limits

A successful model-only test does not mean Telegram, WhatsApp, form submissions, uploads, admin review, or Supabase persistence are live. This branch deliberately blocks those routes. Re-enabling production workflows requires a separate deployment branch, revalidated database isolation, private secrets in the new host, an independently controlled Telegram test bot/webhook, and a deliberate Meta webhook update. Do not point the existing production Telegram bot or WhatsApp webhook at this test service.
